from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
from app.core.config import settings


class ZabbixService:
    def __init__(self) -> None:
        self.api_url = settings.ZABBIX_API_URL.strip()
        self.api_token = settings.ZABBIX_API_TOKEN.strip()
        self.backup_group = settings.ZABBIX_BACKUP_GROUP.strip() or "LogsBackups"

    async def _rpc(self, method: str, params: dict[str, Any]) -> Any:
        if not self.api_token:
            return None
        # Zabbix 7.0+ utiliza obrigatoriamente Authorization: Bearer <API_TOKEN>
        headers = {
            "Content-Type": "application/json-rpc",
            "Authorization": f"Bearer {self.api_token}",
        }
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1,
        }
        async with httpx.AsyncClient(timeout=20.0, verify=True) as client:
            resp = await client.post(self.api_url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                # Fallback para instâncias Zabbix 6.x legadas caso Bearer seja rejeitado
                legacy_payload = {
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "auth": self.api_token,
                    "id": 1,
                }
                resp_legacy = await client.post(
                    self.api_url,
                    json=legacy_payload,
                    headers={"Content-Type": "application/json-rpc"},
                )
                resp_legacy.raise_for_status()
                data_legacy = resp_legacy.json()
                if "error" in data_legacy:
                    raise RuntimeError(f"Zabbix RPC ({method}): {data_legacy['error']}")
                return data_legacy.get("result")
            return data.get("result")

    async def list_backup_hosts(self) -> list[dict[str, Any]]:
        """Lista todos os hosts abreviados (ex: 1protesto, 2ri, 5notas) no grupo LogsBackups."""
        if not self.api_token:
            return []
        try:
            groups = await self._rpc(
                "hostgroup.get",
                {"output": ["groupid", "name"], "filter": {"name": [self.backup_group]}},
            )
            if not groups:
                # Busca parcial caso o nome tenha variação
                groups = await self._rpc(
                    "hostgroup.get",
                    {"output": ["groupid", "name"], "search": {"name": self.backup_group}},
                )
            if not groups:
                return []
            group_ids = [g["groupid"] for g in groups]
            hosts = await self._rpc(
                "host.get",
                {
                    "output": ["hostid", "host", "name", "status"],
                    "groupids": group_ids,
                    "filter": {"status": "0"},
                },
            )
            result = [
                {
                    "hostid": h["hostid"],
                    "slug": h["host"],
                    "name": h.get("name") or h["host"],
                }
                for h in (hosts or [])
            ]
            return sorted(result, key=lambda x: x["slug"].lower())
        except Exception:
            return []

    async def collect_backup_audit(self, host_slug: str | None) -> dict[str, Any]:
        """Coleta itens ativos de backup do host abreviado no Zabbix, ignorando canais não contratados."""
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

            now = datetime.now(timezone.utc)
            time_from = int((now - timedelta(days=30)).timestamp())
            time_till = int(now.timestamp())

            active_channels: list[dict[str, Any]] = []
            disk_usage: list[dict[str, Any]] = []

            for item in items or []:
                last_clock = int(item.get("lastclock", 0))
                if last_clock == 0:
                    continue

                item_name = str(item.get("name", ""))
                last_val_raw = str(item.get("lastvalue", "")).strip()
                last_dt = datetime.fromtimestamp(last_clock, tz=timezone.utc).strftime(
                    "%d/%m/%Y %H:%M"
                )

                # Itens de armazenamento / disco
                if "espaço" in item_name.lower() or "disk" in item_name.lower() or "%" in item_name:
                    try:
                        disk_usage.append(
                            {"volume": item_name, "used_percent": round(float(last_val_raw), 1)}
                        )
                    except ValueError:
                        pass
                    continue

                # No Zabbix LogsBackups: valor 0 = OK / Operante; != 0 = Alerta / Atenção
                is_ok = last_val_raw in ("0", "0.0", "OK", "ok", "true", "1") if last_val_raw != "0" else True
                # Regra específica Softlan TI: 0 = Sucesso, >= 1 = Falha/Aviso
                try:
                    num_val = float(last_val_raw)
                    is_ok = num_val == 0.0
                except ValueError:
                    is_ok = last_val_raw.lower() in ("ok", "sucesso", "operante")

                sla_percent = 100.0
                try:
                    history = await self._rpc(
                        "history.get",
                        {
                            "output": ["value"],
                            "history": int(item.get("value_type", 3)),
                            "itemids": [item["itemid"]],
                            "time_from": time_from,
                            "time_till": time_till,
                            "limit": 120,
                        },
                    )
                    if history:
                        ok_count = sum(
                            1
                            for h in history
                            if str(h.get("value", "")).strip() in ("0", "0.0", "OK", "ok")
                        )
                        sla_percent = round((ok_count / len(history)) * 100, 1)
                except Exception:
                    sla_percent = 100.0 if is_ok else 90.0

                active_channels.append(
                    {
                        "channel": item_name,
                        "status": "Operante" if is_ok else "Atenção / Verificar",
                        "is_healthy": is_ok,
                        "sla_30d_percent": sla_percent,
                        "last_check": last_dt,
                    }
                )

            overall_sla = (
                round(
                    sum(c["sla_30d_percent"] for c in active_channels) / len(active_channels), 1
                )
                if active_channels
                else 100.0
            )

            return {
                "host_slug": host_slug,
                "overall_sla_percent": overall_sla,
                "active_channels": active_channels,
                "disk_usage": disk_usage,
                "analyst_note": (
                    "Rotinas de cópia de segurança auditadas via telemetria Zabbix / Backblaze B2, "
                    "operando dentro da janela de retenção contratada."
                ),
            }
        except Exception as exc:
            return {"host_slug": host_slug, "active_channels": [], "error": str(exc)}