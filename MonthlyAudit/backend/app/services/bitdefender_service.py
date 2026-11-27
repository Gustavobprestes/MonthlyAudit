import base64
import logging
from datetime import datetime, timezone
from typing import Any
import httpx
from app.core.config import settings

logger = logging.getLogger("softlan.bitdefender")


def _format_bd_date(raw_date: Any) -> str:
    """Converte timestamps Unix (segundos/ms) ou strings ISO do GravityZone para DD/MM/YYYY."""
    if raw_date is None or raw_date == "" or raw_date == 0:
        return "Não informada"

    if isinstance(raw_date, (int, float)):
        ts = float(raw_date)
        if ts > 1e11:
            ts = ts / 1000.0
        if ts > 0:
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d/%m/%Y")
        return "Não informada"

    text = str(raw_date).strip()
    if not text or text.lower() in ("null", "none", "n/a", "unlimited"):
        return "Perpétua / Sem expiração" if text.lower() == "unlimited" else "Não informada"

    if text.isdigit():
        ts = float(text)
        if ts > 1e11:
            ts = ts / 1000.0
        if ts > 0:
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d/%m/%Y")

    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
    ):
        try:
            slice_len = 24 if "%f" in fmt else (19 if "%H" in fmt else 10)
            dt = datetime.strptime(text[:slice_len], fmt)
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            continue

    return text[:10]


def _extract_license_fields(payload: Any) -> tuple[int, int, str, str]:
    """Varre recursivamente dicionários/listas da resposta GravityZone em busca de assentos e vencimento."""
    total_seats = 0
    used_seats = 0
    expiration_date = "Não informada"
    product_name = "GravityZone Business Security"

    seat_total_keys = (
        "totalSlots",
        "ownSlots",
        "allocatedSlots",
        "slots",
        "seats",
        "totalSeats",
        "maxEndpoints",
        "endpointsLimit",
    )
    seat_used_keys = ("usedSlots", "usedSeats", "activeEndpoints", "managedEndpoints")
    expiry_keys = (
        "expirationDate",
        "subscriptionExpirationDate",
        "licenseExpirationDate",
        "expiryDate",
        "expiresAt",
        "validUntil",
        "endDate",
        "expiration",
    )
    product_keys = ("productName", "solutionName", "licenseType", "subscriptionType", "planName")

    def _walk(node: Any) -> None:
        nonlocal total_seats, used_seats, expiration_date, product_name
        if isinstance(node, dict):
            if total_seats == 0:
                for k in seat_total_keys:
                    val = node.get(k)
                    if isinstance(val, (int, float)) and val > 0:
                        total_seats = int(val)
                        break
                    if isinstance(val, str) and val.isdigit() and int(val) > 0:
                        total_seats = int(val)
                        break

            if used_seats == 0:
                for k in seat_used_keys:
                    val = node.get(k)
                    if isinstance(val, (int, float)) and val > 0:
                        used_seats = int(val)
                        break
                    if isinstance(val, str) and val.isdigit() and int(val) > 0:
                        used_seats = int(val)
                        break

            if expiration_date == "Não informada":
                for k in expiry_keys:
                    if k in node and node[k]:
                        formatted = _format_bd_date(node[k])
                        if formatted != "Não informada":
                            expiration_date = formatted
                            break

            for k in product_keys:
                if isinstance(node.get(k), str) and node[k].strip():
                    product_name = node[k].strip()
                    break

            for v in node.values():
                if isinstance(v, (dict, list)):
                    _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(payload)
    return total_seats, used_seats, expiration_date, product_name


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
        """Consulta getCompanyDetails, getCompaniesList e licensing/getLicenseInfo para extrair assentos e vencimento."""
        total_seats = 0
        used_seats = 0
        expiration_date = "Não informada"
        product_name = "GravityZone Business Security"

        try:
            details = await self._rpc("companies", "getCompanyDetails", {"companyId": company_id})
            if details:
                t, u, exp, prod = _extract_license_fields(details)
                if t > 0:
                    total_seats = t
                if u > 0:
                    used_seats = u
                if exp != "Não informada":
                    expiration_date = exp
                if prod:
                    product_name = prod
        except Exception as exc:
            logger.debug("getCompanyDetails indisponível para %s: %s", company_id, exc)

        if total_seats == 0 or expiration_date == "Não informada":
            try:
                lic_info = await self._rpc("licensing", "getLicenseInfo", {"companyId": company_id})
                if lic_info:
                    t, u, exp, prod = _extract_license_fields(lic_info)
                    if total_seats == 0 and t > 0:
                        total_seats = t
                    if used_seats == 0 and u > 0:
                        used_seats = u
                    if expiration_date == "Não informada" and exp != "Não informada":
                        expiration_date = exp
                    if prod and product_name == "GravityZone Business Security":
                        product_name = prod
            except Exception as exc:
                logger.debug("licensing/getLicenseInfo indisponível para %s: %s", company_id, exc)

        if total_seats == 0 or expiration_date == "Não informada":
            try:
                page = 1
                while page <= 5:
                    res = await self._rpc(
                        "companies",
                        "getCompaniesList",
                        {"page": page, "perPage": 100},
                    )
                    items = res.get("items", []) if isinstance(res, dict) else (res or [])
                    if not items:
                        break
                    matched = next((c for c in items if str(c.get("id")) == str(company_id)), None)
                    if matched:
                        t, u, exp, prod = _extract_license_fields(matched)
                        if total_seats == 0 and t > 0:
                            total_seats = t
                        if used_seats == 0 and u > 0:
                            used_seats = u
                        if expiration_date == "Não informada" and exp != "Não informada":
                            expiration_date = exp
                        if prod and product_name == "GravityZone Business Security":
                            product_name = prod
                        break
                    pages_count = int(res.get("pagesCount", 1)) if isinstance(res, dict) else 1
                    if page >= pages_count:
                        break
                    page += 1
            except Exception as exc:
                logger.debug("Fallback getCompaniesList falhou para %s: %s", company_id, exc)

        return {
            "total_seats": total_seats,
            "used_seats": used_seats,
            "expiration_date": expiration_date,
            "product_name": product_name,
        }

    async def collect_security_audit(self, company_id: str | None) -> dict[str, Any]:
        """Coleta endpoints gerenciados, IDs, bloqueios/quarentena por máquina e status de mitigação."""
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

            # Coleta itens em quarentena e bloqueios por endpoint
            quarantine_items: list[dict[str, Any]] = []
            quarantine_count = 0
            for q_endpoint in ("quarantine/computers", "quarantine"):
                try:
                    q_res = await self._rpc(
                        q_endpoint,
                        "getQuarantineItemsList",
                        {"companyId": company_id, "page": 1, "perPage": 100},
                    )
                    if isinstance(q_res, dict):
                        quarantine_items = q_res.get("items", []) or []
                        quarantine_count = int(q_res.get("total", len(quarantine_items)))
                        break
                except Exception:
                    continue

            # Indexa bloqueios/quarentena por endpointId e endpointName
            blocks_by_id: dict[str, list[str]] = {}
            blocks_by_name: dict[str, list[str]] = {}
            for qi in quarantine_items:
                ep_id = str(qi.get("endpointId") or qi.get("computerId") or "").strip()
                ep_nm = str(qi.get("endpointName") or qi.get("computerName") or "").strip().lower()
                threat = str(qi.get("threatName") or qi.get("fileName") or "Ameaça Bloqueada").strip()
                if ep_id:
                    blocks_by_id.setdefault(ep_id, []).append(threat)
                if ep_nm:
                    blocks_by_name.setdefault(ep_nm, []).append(threat)

            total_endpoints = len(all_endpoints)
            managed_count = 0
            clean_count = 0
            infected_or_issue = 0
            total_blocked_events = quarantine_count
            endpoint_rows: list[dict[str, Any]] = []

            for ep in all_endpoints:
                ep_id = str(ep.get("id") or "-")
                ep_name = str(ep.get("name") or ep.get("label") or "Endpoint").strip()
                ep_ip = str(ep.get("ip") or ep.get("ipAddress") or "-")

                is_managed = bool(ep.get("isManaged", True))
                if is_managed:
                    managed_count += 1

                state = str(ep.get("state", "")).lower()
                malware = ep.get("malwareStatus", {})
                has_active_malware = (
                    bool(malware.get("infected")) if isinstance(malware, dict) else False
                )

                # Quantidade de bloqueios/ameaças interceptadas neste endpoint
                ep_threats = blocks_by_id.get(ep_id, []) or blocks_by_name.get(ep_name.lower(), [])
                blocked_count = len(ep_threats)
                if isinstance(malware, dict):
                    blocked_count = max(
                        blocked_count,
                        int(malware.get("blockedItems") or malware.get("quarantinedItems") or 0),
                    )

                is_clean = not has_active_malware and state in (
                    "",
                    "ok",
                    "clean",
                    "protected",
                    "0",
                    "online",
                )
                if is_clean:
                    clean_count += 1
                else:
                    infected_or_issue += 1

                if blocked_count > 0 and is_clean:
                    remediation_status = "Mitigado / Corrigido"
                elif blocked_count > 0 and not is_clean:
                    remediation_status = "Ação Pendente"
                elif is_clean:
                    remediation_status = "Sem Ameaças (Limpo)"
                else:
                    remediation_status = "Verificar Agente"

                endpoint_rows.append(
                    {
                        "endpoint_id": ep_id,
                        "name": ep_name,
                        "ip": ep_ip,
                        "blocked_count": blocked_count,
                        "remediation_status": remediation_status,
                        "is_protected": is_clean,
                        "status": "Protegido" if is_clean else "Verificar",
                        "threats_detail": ", ".join(ep_threats[:3]) if ep_threats else "",
                    }
                )

            endpoint_rows.sort(key=lambda x: x["name"].lower())
            total_blocked_events = max(
                quarantine_count,
                sum(int(r["blocked_count"]) for r in endpoint_rows),
            )

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
                "total_blocked_events": total_blocked_events,
                "security_health_percent": health_score,
                "total_seats": total_seats,
                "used_seats": used_seats,
                "expiration_date": license_meta["expiration_date"],
                "product_name": license_meta["product_name"],
                "endpoints": endpoint_rows,
            }
        except Exception as exc:
            logger.exception("Erro ao coletar auditoria Bitdefender para %s: %s", company_id, exc)
            return {
                "total_endpoints": 0,
                "managed_endpoints": 0,
                "clean_endpoints": 0,
                "endpoints_with_issues": 0,
                "quarantine_items": 0,
                "total_blocked_events": 0,
                "security_health_percent": 0.0,
                "total_seats": 0,
                "used_seats": 0,
                "expiration_date": "Não informada",
                "product_name": "GravityZone",
                "endpoints": [],
                "error": str(exc),
            }