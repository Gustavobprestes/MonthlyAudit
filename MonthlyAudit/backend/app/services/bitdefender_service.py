import base64
import httpx
from app.core.config import settings


class BitdefenderService:
    def __init__(self) -> None:
        self.base_url = settings.BITDEFENDER_API_URL.rstrip("/")
        self.api_key = settings.BITDEFENDER_API_KEY

    def _auth_header(self) -> str:
        # Formato oficial GravityZone: Basic base64(API_KEY + ":")
        raw = f"{self.api_key}:".encode("utf-8")
        return f"Basic {base64.b64encode(raw).decode('utf-8')}"

    async def _rpc_call(self, endpoint: str, method: str, params: dict) -> dict:
        if not self.api_key:
            return {}
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                f"{self.base_url}/{endpoint}",
                headers={
                    "Authorization": self._auth_header(),
                    "Content-Type": "application/json",
                },
                json={
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "id": "softlan-audit",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"GravityZone RPC Error: {data['error']}")
            return data.get("result", {})

    async def list_companies(self) -> list[dict]:
        """Lista as empresas filhas (clientes) no painel Partner/MSP."""
        result = await self._rpc_call("companies", "getCompaniesList", {"perPage": 100, "page": 1})
        items = result.get("items", []) if isinstance(result, dict) else []
        return [{"id": c["id"], "name": c["name"]} for c in items]

    async def collect_security_audit(self, company_id: str | None) -> dict | None:
        if not company_id or not self.api_key:
            return None

        endpoints_res = await self._rpc_call(
            "network",
            "getEndpointsList",
            {"companyId": company_id, "perPage": 100, "page": 1},
        )
        items = endpoints_res.get("items", []) if isinstance(endpoints_res, dict) else []

        total_endpoints = len(items)
        managed = sum(1 for ep in items if ep.get("isManaged") is True)
        with_issues = 0
        machines = []

        for ep in items:
            sec_issues = ep.get("securityIssues") or []
            has_issue = len(sec_issues) > 0 if isinstance(sec_issues, list) else bool(sec_issues)
            if has_issue:
                with_issues += 1
            machines.append(
                {
                    "name": ep.get("name", "Endpoint"),
                    "ip": ep.get("ip", "N/D"),
                    "os": ep.get("operatingSystemVersion", "Windows"),
                    "status": "Atenção" if has_issue else "Protegido",
                }
            )

        quarantine_res = await self._rpc_call(
            "quarantine/computers",
            "getQuarantineItemsList",
            {"companyId": company_id, "perPage": 50, "page": 1},
        )
        quarantine_count = (
            quarantine_res.get("total", 0) if isinstance(quarantine_res, dict) else 0
        )

        health_score = (
            round(((total_endpoints - with_issues) / total_endpoints) * 100, 1)
            if total_endpoints > 0
            else 100.0
        )

        return {
            "total_endpoints": total_endpoints,
            "managed_endpoints": managed,
            "clean_endpoints": total_endpoints - with_issues,
            "endpoints_with_issues": with_issues,
            "quarantine_items": quarantine_count,
            "security_health_percent": health_score,
            "endpoints": machines[:20],
        }