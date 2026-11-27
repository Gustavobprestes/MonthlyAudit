import calendar
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
from app.core.config import settings

logger = logging.getLogger("softlan.zabbix")


def _normalize_zabbix_url(raw_url: str) -> str:
    url = raw_url.strip().rstrip("/")
    if not url:
        return ""
    if not url.endswith("api_jsonrpc.php"):
        return f"{url}/api_jsonrpc.php"
    return url


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
        self.backup_group = settings.ZABBIX_BACKUP_GROUP.strip() or "LogsBackups"

    async def _rpc(self, method: str, params: dict[str, Any]) -> Any:
        if not self.api_token or not self.api_url:
            return None

        headers_bearer = {
            "Content-Type": "application/json-rpc",
            "Authorization": f"Bearer {self.api_token}",
        }
        payload_bearer: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1,
        }

        async with httpx.AsyncClient(timeout=25.0, verify=False) as client:
            resp = await client.post(self.api_url, json=payload_bearer, headers=headers_bearer)
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                payload_legacy = {
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "auth": self.api_token,
                    "id": 1,
                }
                resp_legacy = await client.post(
                    self.api_url,
                    json=payload_legacy,
                    headers={"Content-Type": "application/json-rpc"},
                )
                resp_legacy.raise_for_status()
                data_legacy = resp_legacy.json()
                if "error" in data_legacy:
                    logger.error("Erro Zabbix RPC (%s): %s", method, data_legacy["error"])
                    raise RuntimeError(f"Zabbix RPC ({method}): {data_legacy['error']}")
                return data_legacy.get("result")

            return data.get("result")

    async def list_backup_hosts(self) -> list[dict[str, Any]]:
        """Lista todos os hosts de clientes criados via LLD no grupo LogsBackups."""
        if not self.api_token or not self.api_url:
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

            # Fallback: busca todos os hosts visíveis e filtra os que possuem chaves backup.item / disk.space
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
            logger.exception("Falha ao listar hosts do Zabbix em %s: %s", self.api_url, exc)
            return []

    async def collect_backup_audit(
        self, host_slug: str | None, reference_month: str | None = None
    ) -> dict[str, Any]:
        """Coleta rotinas de backup (1=Funcional, 0=Com Falha), SLA mensal, timeline diária e espaço em disco."""
        if not self.api_token or not host_slug:
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

                # Ignora o item auxiliar disk.space.status (usamos disk.space.pct para o percentual real)
                if key_.startswith("disk.space.status["):
                    continue

                # 1. Coleta de Espaço em Disco (disk.space.pct[cliente,arquivo,mount])
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

                # 2. Coleta de Rotinas de Backup (backup.item[cliente,arquivo])
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

                # Consulta histórico da competência no Zabbix para SLA mensal + Timeline diária
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
                        # Consolida por dia (se houve ao menos um 1 no dia, o dia foi Funcional)
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
            logger.exception("Erro ao coletar backup Zabbix para %s: %s", host_slug, exc)
            return {
                "host_slug": host_slug,
                "overall_sla_percent": 0.0,
                "active_channels": [],
                "disk_usage": [],
                "error": str(exc),
            }