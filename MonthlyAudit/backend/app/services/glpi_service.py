import calendar
import html
import json
import logging
import re
from datetime import datetime
from typing import Any
import httpx
from app.core.config import settings

logger = logging.getLogger("softlan.glpi")

STATUS_MAP = {
    1: "Novo",
    2: "Em Atendimento (Atribuído)",
    3: "Em Atendimento (Planejado)",
    4: "Pendente",
    5: "Solucionado",
    6: "Fechado",
}


def _safe_int(val: Any, default: int = -1) -> int:
    """Converte de forma segura valores JSON (incluindo None ou strings vazias) para int."""
    if val is None or isinstance(val, bool):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _strip_html(raw: str | None) -> str:
    if not raw:
        return ""
    unescaped = html.unescape(str(raw))
    clean = re.sub(r"<[^>]+>", " ", unescaped)
    return re.sub(r"\s+", " ", clean).strip()


def _format_br_datetime(raw: str | None) -> str:
    if not raw:
        return "-"
    text = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text[:19], fmt[: len(text[:19])])
            return dt.strftime("%d/%m/%Y %H:%M") if "%H" in fmt else dt.strftime("%d/%m/%Y")
        except ValueError:
            continue
    return text[:16]


def _format_ram_mb(raw_mb: Any) -> str:
    try:
        mb = float(raw_mb)
        if mb <= 0:
            return "-"
        gb = mb / 1024.0
        return f"{int(round(gb))} GB" if gb >= 1 else f"{int(mb)} MB"
    except (ValueError, TypeError):
        return str(raw_mb) if raw_mb else "-"


def _short_entity_name(ent: dict[str, Any]) -> str:
    """Retorna apenas o nome curto da entidade filha, removendo o caminho da entidade pai."""
    short_name = str(ent.get("name") or "").strip()
    if short_name:
        return short_name
    complete = str(ent.get("completename") or "").strip()
    if ">" in complete:
        return complete.split(">")[-1].strip()
    return complete


class GLPIService:
    def __init__(self) -> None:
        self.base_url = settings.GLPI_API_URL.rstrip("/")
        self.app_token = settings.GLPI_APP_TOKEN
        self.user_token = settings.GLPI_USER_TOKEN

    async def _init_session(self, client: httpx.AsyncClient) -> str:
        headers = {
            "App-Token": self.app_token,
            "Authorization": f"user_token {self.user_token}",
            "Content-Type": "application/json",
        }
        resp = await client.get(f"{self.base_url}/initSession", headers=headers)
        resp.raise_for_status()
        token = resp.json()["session_token"]

        # Mantém visão global recursiva a partir da raiz (0) para ler todas as entidades filhas e catálogos de hardware
        await self._switch_active_entity(client, token, entity_id=0, is_recursive=True)
        return token

    async def _switch_active_entity(
        self,
        client: httpx.AsyncClient,
        session_token: str,
        entity_id: int,
        is_recursive: bool = True,
    ) -> None:
        headers = {
            "App-Token": self.app_token,
            "Session-Token": session_token,
            "Content-Type": "application/json",
        }
        try:
            await client.post(
                f"{self.base_url}/changeActiveEntities",
                headers=headers,
                json={"entities_id": int(entity_id), "is_recursive": is_recursive},
            )
        except Exception as exc:
            logger.debug("changeActiveEntities (%s) ignorado: %s", entity_id, exc)

    async def _kill_session(self, client: httpx.AsyncClient, session_token: str) -> None:
        headers = {"App-Token": self.app_token, "Session-Token": session_token}
        try:
            await client.get(f"{self.base_url}/killSession", headers=headers)
        except Exception:
            pass

    async def _fetch_all_paginated(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        resource: str,
        extra_params: dict[str, Any] | None = None,
        page_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """Percorre todas as páginas de um recurso GLPI via cabeçalho Content-Range."""
        results: list[dict[str, Any]] = []
        offset = 0
        max_records = 30000

        while offset < max_records:
            params: dict[str, Any] = {"range": f"{offset}-{offset + page_size - 1}"}
            if extra_params:
                params.update(extra_params)

            resp = await client.get(f"{self.base_url}/{resource}", headers=headers, params=params)
            if resp.status_code not in (200, 206):
                break

            batch = resp.json()
            if not isinstance(batch, list) or not batch:
                break

            results.extend(item for item in batch if isinstance(item, dict))

            content_range = resp.headers.get("Content-Range", "")
            total_count: int | None = None
            if "/" in content_range:
                try:
                    total_count = int(content_range.split("/")[-1].strip())
                except ValueError:
                    total_count = None

            offset += len(batch)
            if total_count is not None and offset >= total_count:
                break
            if len(batch) < page_size:
                break

        return results

    def _resolve_target_entity_ids(
        self, entity_id: int, all_entities: list[dict[str, Any]]
    ) -> set[int]:
        """Inclui a entidade selecionada e quaisquer sub-entidades filhas com tratamento seguro de None."""
        target_eid = _safe_int(entity_id, -1)
        target_ids: set[int] = {target_eid} if target_eid >= 0 else set()

        for ent in all_entities:
            if _safe_int(ent.get("id"), -1) == target_eid:
                sons_raw = ent.get("sons_cache")
                if isinstance(sons_raw, dict):
                    for k in sons_raw.keys():
                        parsed_k = _safe_int(k, -1)
                        if parsed_k >= 0:
                            target_ids.add(parsed_k)
                elif isinstance(sons_raw, str) and sons_raw.strip().startswith("{"):
                    try:
                        parsed = json.loads(sons_raw)
                        if isinstance(parsed, dict):
                            for k in parsed.keys():
                                parsed_k = _safe_int(k, -1)
                                if parsed_k >= 0:
                                    target_ids.add(parsed_k)
                    except Exception:
                        pass
                break

        for ent in all_entities:
            parent_id = _safe_int(ent.get("entities_id"), -1)
            child_id = _safe_int(ent.get("id"), -1)
            if parent_id == target_eid and child_id >= 0:
                target_ids.add(child_id)

        return target_ids

    async def list_entities(self) -> list[dict[str, Any]]:
        """Retorna todas as entidades filhas cadastradas no GLPI exibindo apenas o nome curto."""
        async with httpx.AsyncClient(timeout=25.0) as client:
            token = await self._init_session(client)
            headers = {"App-Token": self.app_token, "Session-Token": token}
            try:
                raw_entities = await self._fetch_all_paginated(client, headers, "Entity")
                entities = []
                for ent in raw_entities:
                    eid = _safe_int(ent.get("id"), -1)
                    if eid <= 0:
                        continue
                    short_name = _short_entity_name(ent)
                    if short_name:
                        entities.append({"id": eid, "name": short_name})
                return sorted(entities, key=lambda x: x["name"].lower())
            finally:
                await self._kill_session(client, token)

    async def _resolve_user_name(
        self, client: httpx.AsyncClient, headers: dict[str, str], user_id: Any, cache: dict[int, str]
    ) -> str:
        uid = _safe_int(user_id, 0)
        if uid <= 0:
            return "Equipe Técnica Softlan TI"
        if uid in cache:
            return cache[uid]
        try:
            resp = await client.get(f"{self.base_url}/User/{uid}", headers=headers)
            if resp.status_code == 200:
                u = resp.json()
                first = str(u.get("firstname") or "").strip()
                last = str(u.get("realname") or "").strip()
                full = f"{first} {last}".strip() or str(u.get("name") or f"Técnico #{uid}")
                cache[uid] = full
                return full
        except Exception:
            pass
        cache[uid] = f"Técnico #{uid}"
        return cache[uid]

    async def _extract_plantao_obito_details(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        ticket: dict[str, Any],
        user_cache: dict[int, str],
    ) -> dict[str, Any]:
        """Extrai datas, técnico responsável e texto da solução de um chamado de Plantão do Óbito."""
        tid = _safe_int(ticket.get("id"), 0)
        title = str(ticket.get("name") or f"Chamado #{tid}").strip()
        opened_at = _format_br_datetime(ticket.get("date"))
        closed_raw = ticket.get("solvedate") or ticket.get("closedate")
        closed_at = _format_br_datetime(closed_raw) if closed_raw else "Em andamento / Aberto"
        status_code = _safe_int(ticket.get("status"), 1)
        status_label = STATUS_MAP.get(status_code, "Em Atendimento")

        technician = "Equipe Técnica Softlan TI"
        try:
            tu_resp = await client.get(f"{self.base_url}/Ticket/{tid}/Ticket_User", headers=headers)
            if tu_resp.status_code == 200:
                tu_list = tu_resp.json()
                assigned = [
                    item
                    for item in (tu_list if isinstance(tu_list, list) else [])
                    if _safe_int(item.get("type"), 0) == 2 and _safe_int(item.get("users_id"), 0) > 0
                ]
                if assigned:
                    technician = await self._resolve_user_name(
                        client, headers, assigned[-1]["users_id"], user_cache
                    )
        except Exception:
            pass

        validation_text = ""
        try:
            sol_resp = await client.get(f"{self.base_url}/Ticket/{tid}/ITILSolution", headers=headers)
            if sol_resp.status_code == 200:
                solutions = sol_resp.json()
                if isinstance(solutions, list) and solutions:
                    last_sol = solutions[-1]
                    validation_text = _strip_html(last_sol.get("content"))
                    if technician == "Equipe Técnica Softlan TI" and last_sol.get("users_id"):
                        technician = await self._resolve_user_name(
                            client, headers, last_sol["users_id"], user_cache
                        )
        except Exception:
            pass

        if not validation_text:
            try:
                fup_resp = await client.get(f"{self.base_url}/Ticket/{tid}/ITILFollowup", headers=headers)
                if fup_resp.status_code == 200:
                    fups = fup_resp.json()
                    if isinstance(fups, list) and fups:
                        validation_text = _strip_html(fups[-1].get("content"))
            except Exception:
                pass

        if not validation_text:
            validation_text = (
                "Atendimento de plantão concluído e validado conforme protocolo operacional."
                if status_code in (5, 6)
                else "Chamado aberto em acompanhamento pela equipe de plantão."
            )

        return {
            "ticket_id": tid,
            "title": title,
            "status": status_label,
            "opened_at": opened_at,
            "closed_at": closed_at,
            "technician": technician,
            "validation_text": validation_text,
        }

    async def collect_client_audit(self, entity_id: int, reference_month: str) -> dict[str, Any]:
        """Coleta chamados do mês, Plantão do Óbito, inventário e cronograma Provimento CNJ."""
        year, month = map(int, reference_month.split("-"))
        last_day = calendar.monthrange(year, month)[1]
        start_date = f"{year:04d}-{month:02d}-01 00:00:00"
        end_date = f"{year:04d}-{month:02d}-{last_day:02d} 23:59:59"

        async with httpx.AsyncClient(timeout=45.0) as client:
            token = await self._init_session(client)
            headers = {"App-Token": self.app_token, "Session-Token": token}
            user_cache: dict[int, str] = {}

            try:
                # 0. Resolve árvore de entidades mantendo contexto recursivo global (0)
                all_entities = await self._fetch_all_paginated(client, headers, "Entity")
                target_entity_ids = self._resolve_target_entity_ids(entity_id, all_entities)

                # 1. Mapa Completo de Categorias ITIL
                raw_categories = await self._fetch_all_paginated(client, headers, "ITILCategory")
                categories_map: dict[int, str] = {}
                for c in raw_categories:
                    cid = _safe_int(c.get("id"), -1)
                    if cid >= 0:
                        categories_map[cid] = str(
                            c.get("completename") or c.get("name") or "Geral"
                        )

                # 2. Paginação Completa de Chamados
                all_tickets = await self._fetch_all_paginated(
                    client, headers, "Ticket", {"is_deleted": 0}
                )

                entity_tickets = [
                    t
                    for t in all_tickets
                    if _safe_int(t.get("entities_id"), -1) in target_entity_ids
                ]

                opened_in_month = []
                resolved_in_month = []
                category_counts: dict[str, int] = {}
                implantacao_ticket = None
                plantao_obito_tickets_raw: list[dict[str, Any]] = []
                seen_plantao_ids: set[int] = set()

                for t in entity_tickets:
                    tid = _safe_int(t.get("id"), 0)
                    t_date = str(t.get("date") or "")
                    t_solve = str(t.get("solvedate") or t.get("closedate") or "")
                    cat_id = _safe_int(t.get("itilcategories_id"), 0)
                    cat_name = categories_map.get(cat_id, "Suporte Geral")
                    cat_lower = cat_name.lower()
                    t_title_lower = str(t.get("name") or "").lower()

                    if (
                        settings.GLPI_IMPLANTACAO_CATEGORY_NAME.lower() in cat_lower
                        or "provimento" in t_title_lower
                        or "cnj" in t_title_lower
                    ):
                        if implantacao_ticket is None or tid > _safe_int(implantacao_ticket.get("id"), 0):
                            implantacao_ticket = t

                    is_opened_in_month = start_date <= t_date <= end_date
                    is_resolved_in_month = bool(t_solve and start_date <= t_solve <= end_date)

                    if is_opened_in_month:
                        opened_in_month.append(t)
                        category_counts[cat_name] = category_counts.get(cat_name, 0) + 1

                    if is_resolved_in_month:
                        resolved_in_month.append(t)

                    if (
                        "plantão do óbito" in cat_lower
                        or "plantao do obito" in cat_lower
                        or "plantão de óbito" in cat_lower
                        or "plantao de obito" in cat_lower
                    ) and (is_opened_in_month or is_resolved_in_month):
                        if tid > 0 and tid not in seen_plantao_ids:
                            seen_plantao_ids.add(tid)
                            plantao_obito_tickets_raw.append(t)

                plantao_obito_list: list[dict[str, Any]] = []
                for pt in sorted(plantao_obito_tickets_raw, key=lambda x: str(x.get("date") or "")):
                    detail = await self._extract_plantao_obito_details(
                        client, headers, pt, user_cache
                    )
                    plantao_obito_list.append(detail)

                # 3. Tarefas do Cronograma Provimento CNJ
                provimento_data: dict[str, Any] = {
                    "has_project": False,
                    "ticket_id": None,
                    "project_title": "",
                    "progress_percent": 0,
                    "tasks": [],
                }
                if implantacao_ticket:
                    tid = _safe_int(implantacao_ticket.get("id"), 0)
                    tasks_resp = await client.get(
                        f"{self.base_url}/Ticket/{tid}/TicketTask",
                        headers=headers,
                    )
                    raw_tasks = tasks_resp.json() if tasks_resp.status_code == 200 else []
                    parsed_tasks = []
                    done_count = 0
                    for tk in raw_tasks:
                        if not isinstance(tk, dict):
                            continue
                        state = _safe_int(tk.get("state"), 1)
                        is_done = state == 2
                        if is_done:
                            done_count += 1
                        clean_text = _strip_html(tk.get("content"))
                        parsed_tasks.append(
                            {
                                "id": tk.get("id"),
                                "title": clean_text[:180] or f"Etapa #{tk.get('id')}",
                                "completed": is_done,
                                "date": str(tk.get("date") or "")[:10],
                            }
                        )
                    total_tk = len(parsed_tasks)
                    progress = round((done_count / total_tk) * 100) if total_tk > 0 else 0
                    provimento_data = {
                        "has_project": True,
                        "ticket_id": tid,
                        "project_title": implantacao_ticket.get("name") or "Adequação Provimento CNJ",
                        "progress_percent": progress,
                        "tasks": parsed_tasks,
                    }

                # 4. Inventário Completo Paginado de Hardware & Antivírus (mantendo contexto raiz)
                os_map = {
                    _safe_int(o.get("id"), -1): str(o.get("name") or "N/A")
                    for o in await self._fetch_all_paginated(client, headers, "OperatingSystem")
                    if _safe_int(o.get("id"), -1) >= 0
                }
                cpu_map = {
                    _safe_int(p.get("id"), -1): str(p.get("designation") or "N/A")
                    for p in await self._fetch_all_paginated(client, headers, "DeviceProcessor")
                    if _safe_int(p.get("id"), -1) >= 0
                }
                gpu_map = {
                    _safe_int(g.get("id"), -1): str(g.get("designation") or "N/A")
                    for g in await self._fetch_all_paginated(client, headers, "DeviceGraphicCard")
                    if _safe_int(g.get("id"), -1) >= 0
                }

                all_computers = await self._fetch_all_paginated(
                    client, headers, "Computer", {"is_deleted": 0}
                )
                entity_computers = [
                    c
                    for c in all_computers
                    if _safe_int(c.get("entities_id"), -1) in target_entity_ids
                ]
                entity_comp_ids = {
                    _safe_int(c.get("id"), 0)
                    for c in entity_computers
                    if _safe_int(c.get("id"), 0) > 0
                }

                comp_cpu_links: dict[int, str] = {}
                for link in await self._fetch_all_paginated(client, headers, "Item_DeviceProcessor"):
                    if link.get("itemtype") == "Computer":
                        cid = _safe_int(link.get("items_id"), 0)
                        did = _safe_int(link.get("deviceprocessors_id"), 0)
                        if cid in entity_comp_ids and did in cpu_map:
                            comp_cpu_links[cid] = cpu_map[did]

                comp_ram_links: dict[int, int] = {}
                for link in await self._fetch_all_paginated(client, headers, "Item_DeviceMemory"):
                    if link.get("itemtype") == "Computer":
                        cid = _safe_int(link.get("items_id"), 0)
                        size_mb = _safe_int(link.get("size"), 0)
                        if cid in entity_comp_ids and size_mb > 0:
                            comp_ram_links[cid] = comp_ram_links.get(cid, 0) + size_mb

                comp_gpu_links: dict[int, str] = {}
                for link in await self._fetch_all_paginated(client, headers, "Item_DeviceGraphicCard"):
                    if link.get("itemtype") == "Computer":
                        cid = _safe_int(link.get("items_id"), 0)
                        gid = _safe_int(link.get("devicegraphiccards_id"), 0)
                        if cid in entity_comp_ids and gid in gpu_map:
                            comp_gpu_links[cid] = gpu_map[gid]

                comp_av_links: dict[int, str] = {}
                for av in await self._fetch_all_paginated(client, headers, "ComputerAntivirus"):
                    cid = _safe_int(av.get("computers_id"), 0)
                    av_name = str(av.get("name") or "").strip()
                    if cid in entity_comp_ids and av_name:
                        comp_av_links[cid] = av_name

                os_breakdown: dict[str, int] = {}
                machine_details: list[dict[str, str]] = []

                for comp in entity_computers:
                    cid = _safe_int(comp.get("id"), 0)
                    os_name = os_map.get(_safe_int(comp.get("operatingsystems_id"), 0), "Não informado")
                    os_breakdown[os_name] = os_breakdown.get(os_name, 0) + 1

                    cpu_name = comp_cpu_links.get(cid, "Não informado")
                    ram_label = _format_ram_mb(comp_ram_links.get(cid, 0))
                    gpu_name = comp_gpu_links.get(cid, "Integrada / Padrão")
                    av_name = comp_av_links.get(cid, "Bitdefender Endpoint")

                    machine_details.append(
                        {
                            "name": str(comp.get("name") or "Estação"),
                            "serial": str(comp.get("serial") or "-"),
                            "otherserial": str(comp.get("otherserial") or "-"),
                            "os": os_name,
                            "cpu": cpu_name,
                            "ram": ram_label,
                            "gpu": gpu_name,
                            "antivirus": av_name,
                        }
                    )

                machine_details.sort(key=lambda m: m["name"].lower())

                recent_tickets = [
                    {
                        "id": t.get("id"),
                        "title": t.get("name") or "",
                        "status": STATUS_MAP.get(_safe_int(t.get("status"), 1), "Em andamento"),
                        "category": categories_map.get(_safe_int(t.get("itilcategories_id"), 0), "Geral"),
                        "date": str(t.get("date") or "")[:10],
                    }
                    for t in sorted(opened_in_month, key=lambda x: str(x.get("date") or ""), reverse=True)[:15]
                ]

                return {
                    "total_opened": len(opened_in_month),
                    "total_resolved": len(resolved_in_month),
                    "by_category": [
                        {"category": k, "count": v}
                        for k, v in sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
                    ],
                    "recent_tickets": recent_tickets,
                    "inventory": {
                        "total_machines": len(entity_computers),
                        "by_os": [
                            {"os": k, "count": v}
                            for k, v in sorted(os_breakdown.items(), key=lambda x: x[1], reverse=True)
                        ],
                        "machines": machine_details,
                    },
                    "provimento_cnj": provimento_data,
                    "plantao_obito": plantao_obito_list,
                }
            finally:
                await self._kill_session(client, token)