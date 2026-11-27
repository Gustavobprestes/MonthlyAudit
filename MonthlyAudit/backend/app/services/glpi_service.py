import calendar
import html
import re
from datetime import datetime
from typing import Any
import httpx
from app.core.config import settings

STATUS_MAP = {
    1: "Novo",
    2: "Em Atendimento (Atribuído)",
    3: "Em Atendimento (Planejado)",
    4: "Pendente",
    5: "Solucionado",
    6: "Fechado",
}


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
        return resp.json()["session_token"]

    async def _kill_session(self, client: httpx.AsyncClient, session_token: str) -> None:
        headers = {"App-Token": self.app_token, "Session-Token": session_token}
        try:
            await client.get(f"{self.base_url}/killSession", headers=headers)
        except Exception:
            pass

    async def list_entities(self) -> list[dict[str, Any]]:
        """Retorna todas as entidades cadastradas no GLPI."""
        async with httpx.AsyncClient(timeout=25.0) as client:
            token = await self._init_session(client)
            headers = {"App-Token": self.app_token, "Session-Token": token}
            try:
                resp = await client.get(
                    f"{self.base_url}/Entity",
                    headers=headers,
                    params={"range": "0-500"},
                )
                resp.raise_for_status()
                raw_entities = resp.json()
                entities = []
                for ent in raw_entities:
                    if isinstance(ent, dict) and "id" in ent:
                        entities.append(
                            {
                                "id": int(ent["id"]),
                                "name": str(ent.get("completename") or ent.get("name", "")),
                            }
                        )
                return sorted(entities, key=lambda x: x["name"].lower())
            finally:
                await self._kill_session(client, token)

    async def _resolve_user_name(
        self, client: httpx.AsyncClient, headers: dict[str, str], user_id: Any, cache: dict[int, str]
    ) -> str:
        try:
            uid = int(user_id)
        except (ValueError, TypeError):
            return "Equipe Técnica Softlan TI"
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
        tid = int(ticket["id"])
        title = str(ticket.get("name", f"Chamado #{tid}")).strip()
        opened_at = _format_br_datetime(ticket.get("date"))
        closed_raw = ticket.get("solvedate") or ticket.get("closedate")
        closed_at = _format_br_datetime(closed_raw) if closed_raw else "Em andamento / Aberto"
        status_code = int(ticket.get("status", 1))
        status_label = STATUS_MAP.get(status_code, "Em Atendimento")

        # 1. Busca técnico responsável atribuído (Ticket_User type=2)
        technician = "Equipe Técnica Softlan TI"
        try:
            tu_resp = await client.get(f"{self.base_url}/Ticket/{tid}/Ticket_User", headers=headers)
            if tu_resp.status_code == 200:
                tu_list = tu_resp.json()
                assigned = [
                    item for item in (tu_list if isinstance(tu_list, list) else [])
                    if int(item.get("type", 0)) == 2 and int(item.get("users_id", 0)) > 0
                ]
                if assigned:
                    technician = await self._resolve_user_name(
                        client, headers, assigned[-1]["users_id"], user_cache
                    )
        except Exception:
            pass

        # 2. Busca texto da solução (ITILSolution) como validação técnica
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
            # Fallback: último acompanhamento técnico (ITILFollowup)
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

        async with httpx.AsyncClient(timeout=35.0) as client:
            token = await self._init_session(client)
            headers = {"App-Token": self.app_token, "Session-Token": token}
            user_cache: dict[int, str] = {}

            try:
                # 1. Mapa de Categorias ITIL
                cat_resp = await client.get(
                    f"{self.base_url}/ITILCategory",
                    headers=headers,
                    params={"range": "0-1000"},
                )
                categories_map: dict[int, str] = {}
                if cat_resp.status_code == 200:
                    for c in cat_resp.json():
                        if isinstance(c, dict) and "id" in c:
                            categories_map[int(c["id"])] = str(
                                c.get("completename") or c.get("name", "Geral")
                            )

                # 2. Chamados da entidade
                tickets_resp = await client.get(
                    f"{self.base_url}/Ticket",
                    headers=headers,
                    params={"range": "0-1000", "is_deleted": 0},
                )
                tickets_resp.raise_for_status()
                all_tickets = tickets_resp.json()

                entity_tickets = [
                    t
                    for t in all_tickets
                    if isinstance(t, dict) and int(t.get("entities_id", -1)) == entity_id
                ]

                opened_in_month = []
                resolved_in_month = []
                category_counts: dict[str, int] = {}
                implantacao_ticket = None
                plantao_obito_tickets_raw: list[dict[str, Any]] = []
                seen_plantao_ids: set[int] = set()

                for t in entity_tickets:
                    t_date = str(t.get("date", ""))
                    t_solve = str(t.get("solvedate") or t.get("closedate") or "")
                    cat_id = int(t.get("itilcategories_id") or 0)
                    cat_name = categories_map.get(cat_id, "Suporte Geral")
                    cat_lower = cat_name.lower()
                    t_title_lower = str(t.get("name", "")).lower()

                    if (
                        settings.GLPI_IMPLANTACAO_CATEGORY_NAME.lower() in cat_lower
                        or "provimento" in t_title_lower
                        or "cnj" in t_title_lower
                    ):
                        if implantacao_ticket is None or int(t["id"]) > int(implantacao_ticket["id"]):
                            implantacao_ticket = t

                    is_opened_in_month = start_date <= t_date <= end_date
                    is_resolved_in_month = bool(t_solve and start_date <= t_solve <= end_date)

                    if is_opened_in_month:
                        opened_in_month.append(t)
                        category_counts[cat_name] = category_counts.get(cat_name, 0) + 1

                    if is_resolved_in_month:
                        resolved_in_month.append(t)

                    # Regra Plantão do Óbito: categoria contém "plantão do óbito" ou "plantão de óbito"
                    # e chamado foi aberto OU solucionado/fechado na competência
                    if (
                        "plantão do óbito" in cat_lower
                        or "plantao do obito" in cat_lower
                        or "plantão de óbito" in cat_lower
                        or "plantao de obito" in cat_lower
                    ) and (is_opened_in_month or is_resolved_in_month):
                        tid = int(t["id"])
                        if tid not in seen_plantao_ids:
                            seen_plantao_ids.add(tid)
                            plantao_obito_tickets_raw.append(t)

                # Extrai detalhes completos de cada chamado de Plantão do Óbito
                plantao_obito_list: list[dict[str, Any]] = []
                for pt in sorted(plantao_obito_tickets_raw, key=lambda x: str(x.get("date", ""))):
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
                    tid = implantacao_ticket["id"]
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
                        state = int(tk.get("state", 1))
                        is_done = state == 2
                        if is_done:
                            done_count += 1
                        clean_text = _strip_html(tk.get("content"))
                        parsed_tasks.append(
                            {
                                "id": tk.get("id"),
                                "title": clean_text[:180] or f"Etapa #{tk.get('id')}",
                                "completed": is_done,
                                "date": str(tk.get("date", ""))[:10],
                            }
                        )
                    total_tk = len(parsed_tasks)
                    progress = round((done_count / total_tk) * 100) if total_tk > 0 else 0
                    provimento_data = {
                        "has_project": True,
                        "ticket_id": tid,
                        "project_title": implantacao_ticket.get("name", "Adequação Provimento CNJ"),
                        "progress_percent": progress,
                        "tasks": parsed_tasks,
                    }

                # 4. Inventário Completo de Hardware & Antivírus
                os_map: dict[int, str] = {}
                os_resp = await client.get(
                    f"{self.base_url}/OperatingSystem",
                    headers=headers,
                    params={"range": "0-500"},
                )
                if os_resp.status_code == 200:
                    for o in os_resp.json():
                        if isinstance(o, dict) and "id" in o:
                            os_map[int(o["id"])] = str(o.get("name", "N/A"))

                cpu_map: dict[int, str] = {}
                cpu_resp = await client.get(
                    f"{self.base_url}/DeviceProcessor",
                    headers=headers,
                    params={"range": "0-500"},
                )
                if cpu_resp.status_code == 200:
                    for p in cpu_resp.json():
                        if isinstance(p, dict) and "id" in p:
                            cpu_map[int(p["id"])] = str(p.get("designation", "N/A"))

                gpu_map: dict[int, str] = {}
                gpu_resp = await client.get(
                    f"{self.base_url}/DeviceGraphicCard",
                    headers=headers,
                    params={"range": "0-500"},
                )
                if gpu_resp.status_code == 200:
                    for g in gpu_resp.json():
                        if isinstance(g, dict) and "id" in g:
                            gpu_map[int(g["id"])] = str(g.get("designation", "N/A"))

                comp_resp = await client.get(
                    f"{self.base_url}/Computer",
                    headers=headers,
                    params={"range": "0-1000", "is_deleted": 0},
                )
                all_computers = comp_resp.json() if comp_resp.status_code == 200 else []
                entity_computers = [
                    c
                    for c in all_computers
                    if isinstance(c, dict) and int(c.get("entities_id", -1)) == entity_id
                ]

                comp_cpu_links: dict[int, str] = {}
                icpu_resp = await client.get(
                    f"{self.base_url}/Item_DeviceProcessor",
                    headers=headers,
                    params={"range": "0-2000"},
                )
                if icpu_resp.status_code == 200:
                    for link in icpu_resp.json():
                        if isinstance(link, dict) and link.get("itemtype") == "Computer":
                            cid = int(link.get("items_id", 0))
                            did = int(link.get("deviceprocessors_id", 0))
                            if cid and did in cpu_map:
                                comp_cpu_links[cid] = cpu_map[did]

                comp_ram_links: dict[int, int] = {}
                iram_resp = await client.get(
                    f"{self.base_url}/Item_DeviceMemory",
                    headers=headers,
                    params={"range": "0-2000"},
                )
                if iram_resp.status_code == 200:
                    for link in iram_resp.json():
                        if isinstance(link, dict) and link.get("itemtype") == "Computer":
                            cid = int(link.get("items_id", 0))
                            size_mb = int(link.get("size") or 0)
                            if cid:
                                comp_ram_links[cid] = comp_ram_links.get(cid, 0) + size_mb

                comp_gpu_links: dict[int, str] = {}
                igpu_resp = await client.get(
                    f"{self.base_url}/Item_DeviceGraphicCard",
                    headers=headers,
                    params={"range": "0-2000"},
                )
                if igpu_resp.status_code == 200:
                    for link in igpu_resp.json():
                        if isinstance(link, dict) and link.get("itemtype") == "Computer":
                            cid = int(link.get("items_id", 0))
                            gid = int(link.get("devicegraphiccards_id", 0))
                            if cid and gid in gpu_map:
                                comp_gpu_links[cid] = gpu_map[gid]

                comp_av_links: dict[int, str] = {}
                iav_resp = await client.get(
                    f"{self.base_url}/ComputerAntivirus",
                    headers=headers,
                    params={"range": "0-1000"},
                )
                if iav_resp.status_code == 200:
                    for av in iav_resp.json():
                        if isinstance(av, dict):
                            cid = int(av.get("computers_id", 0))
                            av_name = str(av.get("name", "")).strip()
                            if cid and av_name:
                                comp_av_links[cid] = av_name

                os_breakdown: dict[str, int] = {}
                machine_details: list[dict[str, str]] = []

                for comp in entity_computers:
                    cid = int(comp.get("id", 0))
                    os_name = os_map.get(int(comp.get("operatingsystems_id") or 0), "Não informado")
                    os_breakdown[os_name] = os_breakdown.get(os_name, 0) + 1

                    cpu_name = comp_cpu_links.get(cid, "Não informado")
                    ram_label = _format_ram_mb(comp_ram_links.get(cid, 0))
                    gpu_name = comp_gpu_links.get(cid, "Integrada / Padrão")
                    av_name = comp_av_links.get(cid, "Bitdefender Endpoint")

                    machine_details.append(
                        {
                            "name": str(comp.get("name", "Estação")),
                            "serial": str(comp.get("serial") or "-"),
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
                        "title": t.get("name", ""),
                        "status": STATUS_MAP.get(int(t.get("status", 1)), "Em andamento"),
                        "category": categories_map.get(int(t.get("itilcategories_id") or 0), "Geral"),
                        "date": str(t.get("date", ""))[:10],
                    }
                    for t in sorted(opened_in_month, key=lambda x: str(x.get("date", "")), reverse=True)[:15]
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