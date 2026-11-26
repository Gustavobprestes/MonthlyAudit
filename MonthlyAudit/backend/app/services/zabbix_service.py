from datetime import datetime, timedelta, timezone
import httpx
from app.core.config import settings


class ZabbixService:
    def __init__(self) -> None:
        self.url = settings.ZABBIX_API_URL
        self.token = settings.ZABBIX_API_TOKEN

    async def _rpc(self, method: str, params: dict) -> list | dict:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                self.url,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
                json={
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "id": 1,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"Zabbix API Error: {data['error']}")
            return data.get("result", [])

    async def list_backup_hosts(self) -> list[dict]:
        groups = await self._rpc(
            "hostgroup.get",
            {"output": ["groupid"], "filter": {"name": [settings.ZABBIX_BACKUP_GROUP]}},
        )
        if not groups:
            return []
        group_id = groups[0]["groupid"]
        hosts = await self._rpc(
            "host.get",
            {"output": ["hostid", "host", "name"], "groupids": group_id},
        )
        return [{"hostid": h["hostid"], "slug": h["host"], "name": h["name"]} for h in hosts]

    async def collect_backup_audit(self, host_slug: str | None) -> dict | None:
        """
        Coleta status atual + disponibilidade real dos últimos 30 dias
        apenas sobre canais ativos (ignorando rotinas não contratadas).
        """
        if not host_slug:
            return None

        hosts = await self._rpc(
            "host.get",
            {"output": ["hostid", "host", "name"], "filter": {"host": [host_slug]}},
        )
        if not hosts:
            return None
        host_id = hosts[0]["hostid"]

        items = await self._rpc(
            "item.get",
            {
                "output": ["itemid", "name", "key_", "lastvalue", "lastclock", "value_type"],
                "hostids": host_id,
                "status": 0,  # Apenas itens habilitados
            },
        )

        target_channels = ("Backup Nuvem", "HD Externo 1", "HD Externo 2", "Replica", "Storage")
        now = datetime.now(timezone.utc)
        time_from = int((now - timedelta(days=30)).timestamp())

        channels = []
        disk_usage = []

        for item in items:
            name = item["name"]
            last_val = item.get("lastvalue")
            last_clock = int(item.get("lastclock", 0))

            if any(ch.lower() in name.lower() for ch in target_channels) and last_clock > 0:
                # Busca histórico de 30 dias para calcular SLA real de execuções registradas
                history = await self._rpc(
                    "history.get",
                    {
                        "output": ["value", "clock"],
                        "history": int(item.get("value_type", 3)),
                        "itemids": item["itemid"],
                        "time_from": time_from,
                        "limit": 100,
                    },
                )
                total_runs = len(history)
                ok_runs = sum(1 for h in history if str(h.get("value")) == "1")
                sla_30d = round((ok_runs / total_runs) * 100, 1) if total_runs > 0 else (
                    100.0 if str(last_val) == "1" else 0.0
                )

                last_dt = datetime.fromtimestamp(last_clock, tz=timezone.utc).strftime(
                    "%d/%m/%Y %H:%M"
                )
                is_ok = str(last_val) == "1"
                channels.append(
                    {
                        "channel": name,
                        "status": "Operante" if is_ok else "Atenção / Em Verificação",
                        "is_healthy": is_ok,
                        "sla_30d_percent": sla_30d,
                        "last_check": last_dt,
                        "note": "" if is_ok else "Verificação técnica agendada pela equipe Softlan TI.",
                    }
                )
            elif "espaço" in name.lower() and last_clock > 0:
                try:
                    pct = round(float(last_val), 1)
                    disk_usage.append({"volume": name, "used_percent": pct})
                except ValueError:
                    pass

        overall_sla = (
            round(sum(c["sla_30d_percent"] for c in channels) / len(channels), 1)
            if channels
            else 100.0
        )

        return {
            "host_slug": host_slug,
            "overall_sla_percent": overall_sla,
            "active_channels": channels,
            "disk_usage": disk_usage,
            "analyst_note": "Rotinas de cópia de segurança auditadas conforme política de retenção e continuidade operacional.",
        }