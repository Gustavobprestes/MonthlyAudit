import calendar
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
from app.core.config import settings

logger = logging.getLogger("softlan.zabbix")


def _normalize_zabbix_url(raw_url: str) -> str:
    clean = raw_url.strip().rstrip("/")
    if not clean:
        return ""
    if clean.endswith("api_jsonrpc.php"):
        return clean
    return f"{clean}/api_jsonrpc.php"


def _month_epoch_bounds(reference_month: str | None) -> tuple[int, int]:
    """Retorna (time_from, time_till) em Unix timestamp UTC para a competência YYYY-MM."""
    now = datetime.now(timezone.utc)
    if not reference_month or "-" not in reference_month:
        start_dt = now - timedelta(days=30)
        return int(start_dt.timestamp()), int(now.timestamp())

    try:
        year, month = map(int, reference_month.split("-")[:2])
        last_day = calendar.monthrange(year, month)[1]
        start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
        end_dt = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        if end_dt > now:
            end_dt = now
        return int(start_dt.timestamp()), int(end_dt.timestamp())
    except ValueError:
        start_dt = now - timedelta(days=30)
        return int(start_dt.timestamp()), int(now.timestamp())


class ZabbixService:
    def __init__(self) -> None:
        self.api_url = _normalize_zabbix_url(settings.ZABBIX_API_URL)
        self.api_token = settings.ZABBIX_API_TOKEN.strip()
        self.zbx_user = settings.ZABBIX_USER.strip()
        self.zbx_password = settings.ZABBIX_PASSWORD.strip()
        self.backup_group = settings.ZABBIX_BACKUP_GROUP.strip() or "LogsBackups"
        self._session_token: str | None = None

    async def _login_with_credentials(self, client: httpx.AsyncClient) -> str | None:
        """Realiza login via user.login caso ZABBIX_USER e ZABBIX_PASSWORD estejam configurados."""
        if not self.zbx_user or not self.zbx_password:
            return None
        payload = {
            "jsonrpc": "2.0",
            "method": "user.login",
            "params": {"username": self.zbx_user, "password": self.zbx_password},
            "id": 1,
        }
        resp = await client.post(
            self.api_url,
            json=payload,
            headers={"Content-Type": "application/json-rpc"},
        )
        resp.raise_for_status()
        data = resp.json()
        if "result" in data:
            self._session_token = str(data["result"])
            return self._session_token
        return None

    async def _rpc(self, method: str, params: dict[str, Any]) -> Any:
        if not self.api_url:
            return None

        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            token = self._session_token or self.api_token
            if not token and self.zbx_user and self.zbx_password:
                token = await self._login_with_credentials(client)

            if not token:
                logger.warning("Zabbix não configurado: defina ZABBIX_API_TOKEN no .env.")
                return None

            headers = {
                "Content-Type": "application/json-rpc",
                "Authorization": f"Bearer {token}",
            }
            payload: dict[str, Any] = {
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
                "id": 1,
            }

            resp = await client.post(self.api_url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                err_data = str(data["error"].get("data", ""))
                # Se o token estático falhou e existem credenciais de usuário no .env, tenta user.login
                if "Session terminated" in err_data and self.zbx_user and self.zbx_password:
                    new_token = await self._login_with_credentials(client)
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp_retry = await client.post(self.api_url, json=payload, headers=headers)
                        resp_retry.raise_for_status()
                        data_retry = resp_retry.json()
                        if "result" in data_retry:
                            return data_retry["result"]

                logger.error(
                    "Falha na API Zabbix (%s): %s — Verifique se ZABBIX_API_TOKEN no .env é um API Token válido gerado em Users -> API tokens no Zabbix.",
                    method,
                    data["error"],
                )
                raise RuntimeError(f"Zabbix RPC ({method}): {data['error']}")

            return data.get("result")

    async def list_backup_hosts(self) -> list[dict[str, Any]]:
        """Lista todos os hosts de clientes criados via LLD no grupo LogsBackups."""
        if not self.api_url or (not self.api_token and not self.zbx_user):
            return []
        try:
            groups = await self._rpc(
                "hostgroup.get",
                {"output": ["groupid", "name"], "filter": {"name": [self.backup_group]}},
            )
            if not groups:
                groups = await self._rpc(
                    "hostgroup.get",
                    {"output": ["groupid", "name"], "search": {"name": self.backup_group}},
                )

            host_params: dict[str, Any] = {
                "output": ["hostid", "host", "name", "status"],
                "selectItems": ["itemid", "key_"],
            }
            if groups:
                host_params["groupids"] = [g["groupid"] for g in groups]

            hosts = await self._rpc("host.get", host_params)

            if not hosts:
                all_hosts = await self._rpc(
                    "host.get",
                    {
                        "output": ["hostid", "host", "name", "status"],
                        "selectItems": ["itemid", "key_"],
                    },
                )
                hosts = [
                    h
                    for h in (all_hosts or [])
                    if any(
                        str(it.get("key_", "")).startswith(("backup.item[", "disk.space."))
                        for it in h.get("items", [])
                    )
                ]

            result = []
            for h in hosts or []:
                slug = str(h.get("host", "")).strip()
                if not slug or slug.lower() == "logsbackups_clientes":
                    continue
                if str(h.get("status", "0")) != "0":
                    continue
                items_count = len(h.get("items", []))
                result.append(
                    {
                        "hostid": str(h["hostid"]),
                        "slug": slug,
                        "name": str(h.get("name") or slug),
                        "items_count": items_count,
                    }
                )

            return sorted(result, key=lambda x: x["slug"].lower())
        except Exception as exc:
            logger.error("Não foi possível carregar hosts do Zabbix: %s", exc)
            return []

    async def collect_backup_audit(
        self, host_slug: str | None, reference_month: str | None = None
    ) -> dict[str, Any]:
        """Coleta rotinas de backup (1=Funcional, 0=Com Falha), SLA mensal, timeline diária e espaço em disco."""
        if not host_slug or not self.api_url:
            return {}

        try:
            hosts = await self._rpc(
                "host.get",
                {
                    "output": ["hostid", "host", "name"],
                    "filter": {"host": [host_slug]},
                },
            )
            if not hosts:
                hosts = await self._rpc(
                    "host.get",
                    {
                        "output": ["hostid", "host", "name"],
                        "search": {"host": host_slug},
                    },
                )
            if not hosts:
                return {}

            host_id = hosts[0]["hostid"]
            items = await self._rpc(
                "item.get",
                {
                    "output": ["itemid", "name", "key_", "lastvalue", "lastclock", "value_type"],
                    "hostids": [host_id],
                    "filter": {"status": "0"},
                },
            )

            time_from, time_till = _month_epoch_bounds(reference_month)

            active_channels: list[dict[str, Any]] = []
            disk_usage: list[dict[str, Any]] = []

            for item in items or []:
                key_ = str(item.get("key_", "")).strip()
                item_name = str(item.get("name", "")).strip()
                last_clock = int(item.get("lastclock", 0))
                last_val_raw = str(item.get("lastvalue", "")).strip()

                if key_.startswith("disk.space.status["):
                    continue

                if (
                    key_.startswith("disk.space.pct[")
                    or "espaco" in item_name.lower()
                    or "espaço" in item_name.lower()
                ):
                    if last_clock == 0:
                        continue
                    try:
                        pct = round(float(last_val_raw), 1)
                        severity_label = (
                            "Crítico"
                            if pct >= 95
                            else ("Atenção" if pct >= 85 else "Normal")
                        )
                        disk_usage.append(
                            {
                                "volume": item_name,
                                "used_percent": pct,
                                "status": severity_label,
                            }
                        )
                    except ValueError:
                        pass
                    continue

                if not key_.startswith("backup.item[") and last_clock == 0:
                    continue

                last_dt = (
                    datetime.fromtimestamp(last_clock, tz=timezone.utc).strftime("%d/%m/%Y %H:%M")
                    if last_clock > 0
                    else "Sem coleta"
                )

                # No b2_client.py: 1 = Funcional (sucesso no dia), 0 = Com Falha
                try:
                    num_val = float(last_val_raw)
                    is_ok = num_val >= 1.0
                except ValueError:
                    is_ok = last_val_raw.lower() in ("1", "ok", "sucesso", "operante", "funcional")

                sla_percent = 100.0 if is_ok else 0.0
                total_checks = 0
                ok_checks = 0
                daily_timeline: list[dict[str, Any]] = []

                try:
                    history = await self._rpc(
                        "history.get",
                        {
                            "output": ["clock", "value"],
                            "history": int(item.get("value_type", 3)),
                            "itemids": [item["itemid"]],
                            "time_from": time_from,
                            "time_till": time_till,
                            "sortfield": "clock",
                            "sortorder": "ASC",
                            "limit": 1000,
                        },
                    )
                    if history:
                        by_day: dict[str, bool] = {}
                        for h in history:
                            clk = int(h.get("clock", 0))
                            val_str = str(h.get("value", "0")).strip()
                            try:
                                day_ok = float(val_str) >= 1.0
                            except ValueError:
                                day_ok = val_str in ("1", "OK", "ok")

                            day_key = datetime.fromtimestamp(clk, tz=timezone.utc).strftime("%d/%m")
                            by_day[day_key] = by_day.get(day_key, False) or day_ok

                        total_checks = len(by_day)
                        ok_checks = sum(1 for v in by_day.values() if v)
                        sla_percent = (
                            round((ok_checks / total_checks) * 100, 1)
                            if total_checks > 0
                            else (100.0 if is_ok else 0.0)
                        )
                        daily_timeline = [
                            {"date": d, "ok": ok} for d, ok in list(by_day.items())[-14:]
                        ]
                except Exception as hist_exc:
                    logger.warning("Falha ao consultar history.get (%s): %s", key_, hist_exc)

                active_channels.append(
                    {
                        "key": key_,
                        "channel": item_name,
                        "status": "Funcional" if is_ok else "Com Falha",
                        "is_healthy": is_ok,
                        "sla_30d_percent": sla_percent,
                        "ok_days": ok_checks,
                        "total_days": total_checks,
                        "last_check": last_dt,
                        "timeline": daily_timeline,
                    }
                )

            active_channels.sort(key=lambda c: c["channel"].lower())
            disk_usage.sort(key=lambda d: d["volume"].lower())

            overall_sla = (
                round(
                    sum(c["sla_30d_percent"] for c in active_channels) / len(active_channels), 1
                )
                if active_channels
                else 100.0
            )

            failing_channels = [c["channel"] for c in active_channels if not c["is_healthy"]]
            if not active_channels:
                analyst_note = (
                    f"Host '{host_slug}' localizado no Zabbix, porém sem rotinas ativas de backup "
                    "reportadas na competência selecionada."
                )
            elif failing_channels:
                analyst_note = (
                    f"Auditoria de continuidade via Backblaze B2 / Zabbix: SLA médio consolidado de "
                    f"{overall_sla}%. Atenção identificada nas rotinas: {', '.join(failing_channels)}."
                )
            else:
                analyst_note = (
                    f"Todas as {len(active_channels)} camadas de backup auditadas via Backblaze B2 / Zabbix "
                    f"operaram com status Funcional (SLA consolidado de {overall_sla}%)."
                )

            return {
                "host_slug": host_slug,
                "overall_sla_percent": overall_sla,
                "active_channels": active_channels,
                "disk_usage": disk_usage,
                "analyst_note": analyst_note,
            }
        except Exception as exc:
            logger.error("Erro ao coletar backup Zabbix para %s: %s", host_slug, exc)
            return {
                "host_slug": host_slug,
                "overall_sla_percent": 0.0,
                "active_channels": [],
                "disk_usage": [],
                "error": str(exc),
            }