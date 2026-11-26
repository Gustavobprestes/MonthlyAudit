import base64
from typing import Any
import httpx
from app.core.config import settings


class BitdefenderService:
    def __init__(self) -> None:
        self.base_url = settings.BITDEFENDER_API_URL.rstrip("/")
        self.api_key = settings.BITDEFENDER_API_KEY.strip()

    def _auth_header(self) -> dict[str, str]:
        if not self.api_key:
            return {"Content-Type": "application/json"}
        # GravityZone exige Basic base64(api_key + ":")
        raw = self.api_key if self.api_key.endswith(":") else f"{self.api_key}:"
        encoded = base64.b64encode(raw.encode("utf-8")).decode("ascii")
        return {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/json",
        }

    async def _rpc(self, endpoint: str, method: str, params: dict[str, Any]) -> Any:
        if not self.api_key:
            return None
        payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload, headers=self._auth_header())
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"Bitdefender RPC Error ({method}): {data['error']}")
            return data.get("result")

    async def list_companies(self) -> list[dict[str, Any]]:
        """Lista as empresas gerenciadas (Multi-Tenant MSP) no GravityZone."""
        if not self.api_key:
            return []
        try:
            res = await self._rpc(
                "companies",
                "getCompaniesList",
                {"page": 1, "perPage": 100},
            )
            items = res.get("items", []) if isinstance(res, dict) else (res or [])
            return [{"id": c.get("id"), "name": c.get("name")} for c in items if c.get("id")]
        except Exception:
            return []

    async def collect_security_audit(self, company_id: str | None) -> dict[str, Any]:
        """Coleta métricas de proteção de endpoints, status de gerenciamento e quarentena."""
        if not self.api_key:
            return {}

        params: dict[str, Any] = {"page": 1, "perPage": 100}
        if company_id:
            params["parentId"] = company_id

        try:
            endpoints_res = await self._rpc("network", "getEndpointsList", params)
            items = endpoints_res.get("items", []) if isinstance(endpoints_res, dict) else []

            total_endpoints = len(items)
            managed_count = 0
            clean_count = 0
            infected_or_issue = 0

            for ep in items:
                is_managed = bool(ep.get("isManaged", True))
                if is_managed:
                    managed_count += 1
                state = str(ep.get("state", "")).lower()
                if state in ("", "ok", "clean", "protected", "0"):
                    clean_count += 1
                else:
                    infected_or_issue += 1

            quarantine_count = 0
            try:
                q_params: dict[str, Any] = {"page": 1, "perPage": 50}
                if company_id:
                    q_params["companyId"] = company_id
                q_res = await self._rpc("quarantine", "getQuarantineItemsList", q_params)
                if isinstance(q_res, dict):
                    quarantine_count = int(q_res.get("total", len(q_res.get("items", []))))
            except Exception:
                quarantine_count = 0

            health_score = (
                round((clean_count / total_endpoints) * 100, 1) if total_endpoints > 0 else 100.0
            )

            return {
                "total_endpoints": total_endpoints,
                "managed_endpoints": managed_count,
                "clean_endpoints": clean_count,
                "endpoints_with_issues": infected_or_issue,
                "quarantine_items": quarantine_count,
                "security_health_percent": health_score,
            }
        except Exception as exc:
            return {
                "total_endpoints": 0,
                "managed_endpoints": 0,
                "clean_endpoints": 0,
                "endpoints_with_issues": 0,
                "quarantine_items": 0,
                "security_health_percent": 0.0,
                "error": str(exc),
            }