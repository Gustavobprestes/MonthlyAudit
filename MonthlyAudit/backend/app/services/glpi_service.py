import asyncio
import calendar
import html
import re
from collections import Counter
from typing import Any
import bleach
import httpx
from app.core.config import settings


def _strip_all_html_and_css(raw_content: str) -> str:
    """Desescapa entidades HTML múltiplas vezes e remove todas as tags/estilos."""
    text = raw_content
    for _ in range(3):
        unescaped = html.unescape(text)
        if unescaped == text:
            break
        text = unescaped
    # Substitui quebras HTML por nova linha antes de limpar
    text = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", text, flags=re.IGNORECASE)
    cleaned = bleach.clean(text, tags=[], strip=True)
    # Remove eventuais resquícios de entidades numéricas ou espaços excessivos
    cleaned = html.unescape(cleaned)
    lines = [re.sub(r"\s+", " ", line).strip() for line in cleaned.splitlines()]
    non_empty = [line for line in lines if line]
    return non_empty[0][:160] if non_empty else ""


class GLPIService:
    def __init__(self) -> None:
        self.base_url = settings.GLPI_API_URL.rstrip("/")
        self.app_token = settings.GLPI_APP_TOKEN.strip()
        self.user_token = settings.GLPI_USER_TOKEN.strip()

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
        """Lista rapidamente todas as entidades ativas do GLPI para vínculo."""
        if not self.app_token or not self.user_token:
            return []
        async with httpx.AsyncClient(timeout=20.0) as client:
            token = await self._init_session(client)
            try:
                headers = {"App-Token": self.app_token, "Session-Token": token}
                resp = await client.get(
                    f"{self.base_url}/Entity",
                    headers=headers,
                    params={"range": "0-500", "only_id": "false"},
                )
                resp.raise_for_status()
                entities = resp.json()
                result = [
                    {
                        "id": int(e["id"]),
                        "name": e.get("name", f"Entidade #{e['id']}"),
                        "completename": e.get("completename", e.get("name", "")),
                    }
                    for e in entities
                    if isinstance(e, dict) and "id" in e
                ]
                return sorted(result, key=lambda x: x["name"].lower())
            finally:
                await self._kill_session(client, token)

    async def _fetch_machine_hardware(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        comp: dict[str, Any],
        sem: asyncio.Semaphore,
    ) -> dict[str, str]:
        """Coleta CPU, Memória RAM, Placa de Vídeo (GPU), Sistema Operacional e Antivírus."""
        comp_id = comp.get("id")
        comp_name = str(comp.get("name") or f"ID-{comp_id}")
        last_sync = str(comp.get("date_mod") or comp.get("last_inventory_update") or "-")

        async with sem:
            # 1. Sistema Operacional (Versão do Windows / Linux)
            os_name = "Não identificado"
            try:
                os_resp = await client.get(
                    f"{self.base_url}/Computer/{comp_id}/Item_OperatingSystem",
                    headers=headers,
                    params={"expand_dropdowns": "true"},
                )
                if os_resp.status_code == 200:
                    os_list = os_resp.json()
                    if isinstance(os_list, list) and os_list:
                        base_os = str(os_list[0].get("operatingsystems_id") or "").strip()
                        ver_os = str(os_list[0].get("operatingsystemversions_id") or "").strip()
                        if base_os and ver_os and ver_os not in base_os:
                            os_name = f"{base_os} ({ver_os})"
                        elif base_os:
                            os_name = base_os
            except Exception:
                pass

            # 2. Processador (CPU)
            cpu_name = "Não informado"
            try:
                cpu_resp = await client.get(
                    f"{self.base_url}/Computer/{comp_id}/Item_DeviceProcessor",
                    headers=headers,
                    params={"expand_dropdowns": "true"},
                )
                if cpu_resp.status_code == 200:
                    cpu_list = cpu_resp.json()
                    if isinstance(cpu_list, list) and cpu_list:
                        raw_cpu = str(cpu_list[0].get("deviceprocessors_id") or "")
                        if raw_cpu:
                            cpu_name = re.sub(r"\s+", " ", raw_cpu).strip()
            except Exception:
                pass

            # 3. Memória RAM (Soma todos os módulos em MB -> GB)
            ram_label = "Não informada"
            try:
                ram_resp = await client.get(
                    f"{self.base_url}/Computer/{comp_id}/Item_DeviceMemory",
                    headers=headers,
                    params={"expand_dropdowns": "true"},
                )
                if ram_resp.status_code == 200:
                    ram_list = ram_resp.json()
                    if isinstance(ram_list, list) and ram_list:
                        total_mb = 0
                        for stick in ram_list:
                            try:
                                total_mb += int(stick.get("size") or 0)
                            except (ValueError, TypeError):
                                pass
                        if total_mb > 0:
                            gb = round(total_mb / 1024)
                            ram_label = f"{gb} GB"
            except Exception:
                pass

            # 4. Placa de Vídeo (GPU)
            gpu_name = "Integrada / Padrão"
            try:
                gpu_resp = await client.get(
                    f"{self.base_url}/Computer/{comp_id}/Item_DeviceGraphicCard",
                    headers=headers,
                    params={"expand_dropdowns": "true"},
                )
                if gpu_resp.status_code == 200:
                    gpu_list = gpu_resp.json()
                    if isinstance(gpu_list, list) and gpu_list:
                        gpus = [
                            str(g.get("devicegraphiccards_id")).strip()
                            for g in gpu_list
                            if g.get("devicegraphiccards_id")
                        ]
                        if gpus:
                            gpu_name = " / ".join(dict.fromkeys(gpus))
            except Exception:
                pass

            # 5. Antivírus Instalado
            av_name = "Não detectado"
            try:
                av_resp = await client.get(
                    f"{self.base_url}/Computer/{comp_id}/ComputerAntivirus",
                    headers=headers,
                    params={"expand_dropdowns": "true"},
                )
                if av_resp.status_code == 200:
                    av_list = av_resp.json()
                    if isinstance(av_list, list) and av_list:
                        avs = [
                            str(a.get("name")).strip()
                            for a in av_list
                            if a.get("name")
                        ]
                        if avs:
                            av_name = ", ".join(dict.fromkeys(avs))
            except Exception:
                pass

            return {
                "name": comp_name,
                "cpu": cpu_name,
                "ram": ram_label,
                "gpu": gpu_name,
                "os": os_name,
                "antivirus": av_name,
                "last_sync": last_sync,
            }

    async def collect_client_audit(self, entity_id: int, reference_month: str) -> dict[str, Any]:
        """Coleta volumetria mensal, incidências, Provimento CNJ e inventário recursivo."""
        if not self.app_token or not self.user_token:
            return {
                "total_opened": 0,
                "total_resolved": 0,
                "total_in_progress": 0,
                "top_incidences": [],
                "recent_tickets": [],
                "provimento_cnj": None,
                "inventory": {"has_agent_data": False, "total_machines": 0, "machines": []},
            }

        year, month = map(int, reference_month.split("-"))
        last_day = calendar.monthrange(year, month)[1]
        start_dt = f"{year:04d}-{month:02d}-01 00:00:00"
        end_dt = f"{year:04d}-{month:02d}-{last_day:02d} 23:59:59"

        async with httpx.AsyncClient(timeout=40.0) as client:
            token = await self._init_session(client)
            try:
                headers = {"App-Token": self.app_token, "Session-Token": token}

                # 1. Chamados da entidade e subentidades (searchtype=under)
                tickets_resp = await client.get(
                    f"{self.base_url}/search/Ticket",
                    headers=headers,
                    params={
                        "criteria[0][field]": "80",
                        "criteria[0][searchtype]": "under",
                        "criteria[0][value]": str(entity_id),
                        "forcedisplay[0]": "1",
                        "forcedisplay[1]": "2",
                        "forcedisplay[2]": "7",
                        "forcedisplay[3]": "12",
                        "forcedisplay[4]": "15",
                        "forcedisplay[5]": "16",
                        "range": "0-500",
                    },
                )
                tickets_resp.raise_for_status()
                raw_tickets = tickets_resp.json().get("data", [])

                monthly_tickets = []
                category_counter: Counter[str] = Counter()
                resolved_count = 0
                in_progress_count = 0
                implantacao_ticket = None

                for t in raw_tickets:
                    t_date = str(t.get("15", ""))
                    cat_name = str(t.get("7") or "Suporte Geral")
                    status_code = int(t.get("12") or 1)
                    title = str(t.get("1") or "")

                    if (
                        settings.GLPI_IMPLANTACAO_CATEGORY_NAME.lower() in cat_name.lower()
                        or "provimento" in title.lower()
                        or "cnj" in title.lower()
                    ):
                        if implantacao_ticket is None or int(t["2"]) > int(implantacao_ticket["2"]):
                            implantacao_ticket = t

                    if start_dt <= t_date <= end_dt:
                        monthly_tickets.append(
                            {
                                "id": int(t["2"]),
                                "title": title,
                                "category": cat_name,
                                "status": status_code,
                                "opened_at": t_date,
                            }
                        )
                        category_counter[cat_name] += 1
                        if status_code in (5, 6):
                            resolved_count += 1
                        else:
                            in_progress_count += 1

                # 2. Tarefas do Projeto Provimento CNJ (com sanitização dupla de HTML/CSS)
                provimento_data = None
                if implantacao_ticket:
                    ticket_id = int(implantacao_ticket["2"])
                    tasks_resp = await client.get(
                        f"{self.base_url}/Ticket/{ticket_id}/TicketTask",
                        headers=headers,
                    )
                    tasks_raw = tasks_resp.json() if tasks_resp.status_code == 200 else []
                    parsed_tasks = []
                    done_tasks = 0
                    for idx, task in enumerate(tasks_raw, start=1):
                        if not isinstance(task, dict):
                            continue
                        clean_title = _strip_all_html_and_css(str(task.get("content", "")))
                        if not clean_title:
                            clean_title = f"Etapa #{idx}"
                        is_done = int(task.get("state", 0)) == 2
                        if is_done:
                            done_tasks += 1
                        parsed_tasks.append(
                            {
                                "id": int(task.get("id", idx)),
                                "title": clean_title,
                                "completed": is_done,
                                "date": str(task.get("date", "")),
                            }
                        )

                    total_t = len(parsed_tasks)
                    progress_pct = round((done_tasks / total_t) * 100, 1) if total_t > 0 else 0.0
                    provimento_data = {
                        "has_project": True,
                        "ticket_id": ticket_id,
                        "project_title": str(implantacao_ticket.get("1", "Implantação Novo Cliente")),
                        "progress_percent": progress_pct,
                        "completed_tasks": done_tasks,
                        "total_tasks": total_t,
                        "tasks": parsed_tasks,
                    }

                # 3. Busca Recursiva de Computadores na Entidade e Subentidades (/search/Computer)
                entity_computers: list[dict[str, Any]] = []
                search_comp_resp = await client.get(
                    f"{self.base_url}/search/Computer",
                    headers=headers,
                    params={
                        "criteria[0][field]": "80",
                        "criteria[0][searchtype]": "under",
                        "criteria[0][value]": str(entity_id),
                        "forcedisplay[0]": "1",   # Nome
                        "forcedisplay[1]": "2",   # ID
                        "forcedisplay[2]": "19",  # Última modificação
                        "range": "0-200",
                    },
                )
                if search_comp_resp.status_code == 200:
                    search_rows = search_comp_resp.json().get("data", [])
                    for row in search_rows:
                        if isinstance(row, dict) and row.get("2"):
                            entity_computers.append(
                                {
                                    "id": int(row["2"]),
                                    "name": str(row.get("1") or f"PC-{row['2']}"),
                                    "date_mod": str(row.get("19") or "-"),
                                }
                            )

                # Fallback caso /search/Computer retorne vazio
                if not entity_computers:
                    comp_resp = await client.get(
                        f"{self.base_url}/Computer",
                        headers=headers,
                        params={"range": "0-1000", "only_id": "false"},
                    )
                    computers = comp_resp.json() if comp_resp.status_code == 200 else []
                    entity_computers = [
                        c
                        for c in computers
                        if isinstance(c, dict)
                        and int(c.get("entities_id", -1)) == entity_id
                        and int(c.get("is_deleted", 0)) == 0
                    ]

                sem = asyncio.Semaphore(10)
                machines = await asyncio.gather(
                    *[
                        self._fetch_machine_hardware(client, headers, comp, sem)
                        for comp in entity_computers[:45]
                    ]
                )
                machines_sorted = sorted(machines, key=lambda m: m["name"].lower())

                return {
                    "total_opened": len(monthly_tickets),
                    "total_resolved": resolved_count,
                    "total_in_progress": in_progress_count,
                    "top_incidences": [
                        {"category": k, "count": v} for k, v in category_counter.most_common(5)
                    ],
                    "recent_tickets": monthly_tickets[:15],
                    "provimento_cnj": provimento_data,
                    "inventory": {
                        "has_agent_data": len(entity_computers) > 0,
                        "total_machines": len(entity_computers),
                        "machines": machines_sorted,
                        "note": (
                            f"{len(entity_computers)} ativos inventariados via GLPI Agent com especificações de CPU, RAM, GPU, SO e antivírus."
                            if entity_computers
                            else "Parque em fase de implantação do agente de inventário automatizado."
                        ),
                    },
                }
            finally:
                await self._kill_session(client, token)