import base64
from datetime import datetime
from typing import Any
import httpx
from app.core.config import settings


def _format_bd_date(raw_date: Any) -> str:
    if not raw_date:
        return "Não informada"
    text = str(raw_date).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text[:19], fmt[: len(text[:19])])
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            continue
    return text[:10]


class BitdefenderService:
    def __init__(self) -> None:
        self.base_url = settings.BITDEFENDER_API_URL.rstrip("/")
        self.api_key = settings.BITDEFENDER_API_KEY.strip()

    def _auth_header(self) -> dict[str, str]:
        if not self.api_key:
            return {"Content-Type": "application/json"}
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
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, json=payload, headers=self._auth_header())
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"Bitdefender RPC ({method}): {data['error']}")
            return data.get("result")

    async def list_companies(self) -> list[dict[str, Any]]:
        """Lista todas as empresas clientes (Partner/MSP) no GravityZone com paginação."""
        if not self.api_key:
            return []
        companies: list[dict[str, Any]] = []
        page = 1
        try:
            while page <= 5:
                res = await self._rpc(
                    "companies",
                    "getCompaniesList",
                    {"page": page, "perPage": 100},
                )
                items = res.get("items", []) if isinstance(res, dict) else (res or [])
                if not items:
                    break
                for c in items:
                    cid = c.get("id")
                    cname = c.get("name")
                    if cid and cname:
                        companies.append({"id": str(cid), "name": str(cname)})
                pages_count = int(res.get("pagesCount", 1)) if isinstance(res, dict) else 1
                if page >= pages_count:
                    break
                page += 1
            return sorted(companies, key=lambda x: x["name"].lower())
        except Exception:
            try:
                inv = await self._rpc(
                    "network",
                    "getNetworkInventoryItems",
                    {"page": 1, "perPage": 100},
                )
                items = inv.get("items", []) if isinstance(inv, dict) else []
                return [
                    {"id": str(i["id"]), "name": str(i["name"])}
                    for i in items
                    if i.get("id") and i.get("type") in ("company", "group", 1, 2)
                ]
            except Exception:
                return []

    async def _fetch_license_details(self, company_id: str) -> dict[str, Any]:
        """Obtém total de assentos/licenças contratadas e data de expiração da empresa."""
        total_seats = 0
        used_seats = 0
        expiration_date = "Não informada"
        product_name = "GravityZone Business Security"

        # 1. Tenta via companies/getCompanyDetails
        try:
            details = await self._rpc("companies", "getCompanyDetails", {"companyId": company_id})
            if isinstance(details, dict):
                lic = details.get("license") or details.get("subscription") or {}
                if isinstance(lic, dict):
                    total_seats = int(
                        lic.get("totalSlots")
                        or lic.get("slots")
                        or lic.get("seats")
                        or 0
                    )
                    used_seats = int(lic.get("usedSlots") or lic.get("usedSeats") or 0)
                    raw_exp = lic.get("expirationDate") or lic.get("expiresAt") or lic.get("validUntil")
                    if raw_exp:
                        expiration_date = _format_bd_date(raw_exp)
                    if lic.get("productName"):
                        product_name = str(lic["productName"])
        except Exception:
            pass

        # 2. Complementa ou faz fallback via licensing/getLicenseInfo
        if total_seats == 0 or expiration_date == "Não informada":
            try:
                lic_info = await self._rpc("licensing", "getLicenseInfo", {"companyId": company_id})
                if isinstance(lic_info, dict):
                    if total_seats == 0:
                        total_seats = int(
                            lic_info.get("totalSlots")
                            or lic_info.get("ownSlots")
                            or lic_info.get("seats")
                            or 0
                        )
                    if used_seats == 0:
                        used_seats = int(lic_info.get("usedSlots") or 0)
                    raw_exp = (
                        lic_info.get("expirationDate")
                        or lic_info.get("subscriptionExpirationDate")
                        or lic_info.get("validUntil")
                    )
                    if raw_exp and expiration_date == "Não informada":
                        expiration_date = _format_bd_date(raw_exp)
            except Exception:
                pass

        return {
            "total_seats": total_seats,
            "used_seats": used_seats,
            "expiration_date": expiration_date,
            "product_name": product_name,
        }

    async def collect_security_audit(self, company_id: str | None) -> dict[str, Any]:
        """Coleta endpoints gerenciados, nomes, licenças, validade e quarentena."""
        if not self.api_key or not company_id:
            return {}

        all_endpoints: list[dict[str, Any]] = []
        page = 1

        try:
            license_meta = await self._fetch_license_details(company_id)

            while page <= 5:
                params: dict[str, Any] = {
                    "parentId": company_id,
                    "page": page,
                    "perPage": 100,
                    "filters": {
                        "type": {"computers": True, "virtualMachines": True},
                        "security": {"management": {"managedWithBest": True}},
                    },
                }
                endpoints_res = await self._rpc("network", "getEndpointsList", params)
                items = endpoints_res.get("items", []) if isinstance(endpoints_res, dict) else []
                all_endpoints.extend(items)
                pages_count = (
                    int(endpoints_res.get("pagesCount", 1))
                    if isinstance(endpoints_res, dict)
                    else 1
                )
                if page >= pages_count or not items:
                    break
                page += 1

            if not all_endpoints:
                inv_res = await self._rpc(
                    "network",
                    "getNetworkInventoryItems",
                    {
                        "parentId": company_id,
                        "page": 1,
                        "perPage": 100,
                        "filters": {"type": {"computers": True, "virtualMachines": True}},
                    },
                )
                all_endpoints = inv_res.get("items", []) if isinstance(inv_res, dict) else []

            total_endpoints = len(all_endpoints)
            managed_count = 0
            clean_count = 0
            infected_or_issue = 0
            endpoint_rows: list[dict[str, str]] = []

            for ep in all_endpoints:
                is_managed = bool(ep.get("isManaged", True))
                if is_managed:
                    managed_count += 1
                state = str(ep.get("state", "")).lower()
                malware = ep.get("malwareStatus", {})
                has_malware = bool(malware.get("infected")) if isinstance(malware, dict) else False
                is_clean = not has_malware and state in ("", "ok", "clean", "protected", "0", "online")
                if is_clean:
                    clean_count += 1
                else:
                    infected_or_issue += 1

                ep_name = str(ep.get("name") or ep.get("label") or "Endpoint")
                ep_ip = str(ep.get("ip") or ep.get("ipAddress") or "-")
                endpoint_rows.append(
                    {
                        "name": ep_name,
                        "ip": ep_ip,
                        "status": "Protegido" if is_clean else "Verificar",
                    }
                )

            endpoint_rows.sort(key=lambda x: x["name"].lower())

            quarantine_count = 0
            for q_endpoint in ("quarantine/computers", "quarantine"):
                try:
                    q_res = await self._rpc(
                        q_endpoint,
                        "getQuarantineItemsList",
                        {"companyId": company_id, "page": 1, "perPage": 50},
                    )
                    if isinstance(q_res, dict):
                        quarantine_count = int(q_res.get("total", len(q_res.get("items", []))))
                        break
                except Exception:
                    continue

            health_score = (
                round((clean_count / total_endpoints) * 100, 1) if total_endpoints > 0 else 100.0
            )
            total_seats = license_meta["total_seats"] or total_endpoints
            used_seats = license_meta["used_seats"] or managed_count

            return {
                "total_endpoints": total_endpoints,
                "managed_endpoints": managed_count,
                "clean_endpoints": clean_count,
                "endpoints_with_issues": infected_or_issue,
                "quarantine_items": quarantine_count,
                "security_health_percent": health_score,
                "total_seats": total_seats,
                "used_seats": used_seats,
                "expiration_date": license_meta["expiration_date"],
                "product_name": license_meta["product_name"],
                "endpoints": endpoint_rows,
            }
        except Exception as exc:
            return {
                "total_endpoints": 0,
                "managed_endpoints": 0,
                "clean_endpoints": 0,
                "endpoints_with_issues": 0,
                "quarantine_items": 0,
                "security_health_percent": 0.0,
                "total_seats": 0,
                "used_seats": 0,
                "expiration_date": "Não informada",
                "product_name": "GravityZone",
                "endpoints": [],
                "error": str(exc),
            }