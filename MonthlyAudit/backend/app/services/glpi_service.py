import re
from collections import Counter
import httpx
from app.core.config import settings


class GLPIService:
    def __init__(self) -> None:
        self.base_url = settings.GLPI_API_URL.rstrip("/")
        self.app_token = settings.GLPI_APP_TOKEN
        self.user_token = settings.GLPI_USER_TOKEN

    async def _init_session(self, client: httpx.AsyncClient) -> str:
        resp = await client.get(
            f"{self.base_url}/initSession",
            headers={
                "App-Token": self.app_token,
                "Authorization": f"user_token {self.user_token}",
            },
        )
        resp.raise_for_status()
        return resp.json()["session_token"]

    async def _kill_session(self, client: httpx.AsyncClient, session_token: str) -> None:
        try:
            await client.get(
                f"{self.base_url}/killSession",
                headers={"App-Token": self.app_token, "Session-Token": session_token},
            )
        except Exception:
            pass

    async def list_entities(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token = await self._init_session(client)
            try:
                resp = await client.get(
                    f"{self.base_url}/Entity",
                    params={"range": "0-500"},
                    headers={"App-Token": self.app_token, "Session-Token": token},
                )
                resp.raise_for_status()
                return [
                    {"id": e["id"], "name": e["name"], "completename": e.get("completename", e["name"])}
                    for e in resp.json()
                    if e.get("id", 0) > 0
                ]
            finally:
                await self._kill_session(client, token)

    async def collect_client_audit(self, entity_id: int, reference_month: str) -> dict:
        """
        Coleta:
        1. Chamados da entidade no mês (abertos, resolvidos, top incidências por categoria)
        2. Inventário de computadores/servidores (quando disponível via GLPI Agent)
        3. Chamado de Implantação (Provimento CNJ) e progresso das TicketTasks
        """
        year, month = reference_month.split("-")
        start_date = f"{year}-{month}-01 00:00:00"
        end_date = f"{year}-{month}-31 23:59:59"

        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._init_session(client)
            headers = {"App-Token": self.app_token, "Session-Token": token}
            try:
                # 1. Busca chamados da entidade via Search API do GLPI
                search_params = {
                    "criteria[0][field]": 80,  # entities_id
                    "criteria[0][searchtype]": "equals",
                    "criteria[0][value]": entity_id,
                    "forcedisplay[0]": 2,   # ID
                    "forcedisplay[1]": 1,   # Título
                    "forcedisplay[2]": 12,  # Status
                    "forcedisplay[3]": 7,   # Categoria ITIL
                    "forcedisplay[4]": 15,  # Data abertura
                    "forcedisplay[5]": 16,  # Data fechamento
                    "range": "0-500",
                }
                tickets_resp = await client.get(
                    f"{self.base_url}/search/Ticket",
                    params=search_params,
                    headers=headers,
                )
                tickets_resp.raise_for_status()
                rows = tickets_resp.json().get("data", [])

                monthly_tickets = []
                categories_counter: Counter = Counter()
                implantacao_ticket_id: int | None = None
                implantacao_title: str = ""

                for row in rows:
                    t_id = row.get("2")
                    title = str(row.get("1", ""))
                    status_code = int(row.get("12", 1))
                    category = str(row.get("7") or "Suporte Geral")
                    opened_at = str(row.get("15", ""))

                    # Detecta chamado de implantação (Provimento CNJ)
                    if (
                        settings.GLPI_IMPLANTACAO_CATEGORY_NAME.lower() in category.lower()
                        or "PROVIMENTO" in title.upper()
                        or "IMPLANTAÇÃO" in title.upper()
                    ):
                        implantacao_ticket_id = int(t_id)
                        implantacao_title = title

                    if start_date <= opened_at <= end_date:
                        monthly_tickets.append(
                            {
                                "id": t_id,
                                "title": title,
                                "status": self._map_status(status_code),
                                "category": category.split(">")[-1].strip(),
                                "opened_at": opened_at,
                            }
                        )
                        categories_counter[category.split(">")[-1].strip()] += 1

                # 2. Inventário de Computadores na Entidade
                comp_resp = await client.get(
                    f"{self.base_url}/search/Computer",
                    params={
                        "criteria[0][field]": 80,
                        "criteria[0][searchtype]": "equals",
                        "criteria[0][value]": entity_id,
                        "forcedisplay[0]": 1,   # Nome
                        "forcedisplay[1]": 45,  # SO
                        "forcedisplay[2]": 19,  # Última atualização inventário
                        "range": "0-300",
                    },
                    headers=headers,
                )
                computers_raw = comp_resp.json().get("data", []) if comp_resp.status_code == 200 else []
                computers = [
                    {
                        "name": c.get("1", "N/D"),
                        "os": c.get("45") or "Sem agente GLPI",
                        "last_sync": c.get("19") or "Manual",
                    }
                    for c in computers_raw
                ]

                # 3. Detalhes do Chamado de Implantação (Provimento CNJ) + TicketTasks
                provimento_data = None
                if implantacao_ticket_id:
                    t_detail = await client.get(
                        f"{self.base_url}/Ticket/{implantacao_ticket_id}",
                        headers=headers,
                    )
                    tasks_resp = await client.get(
                        f"{self.base_url}/Ticket/{implantacao_ticket_id}/TicketTask",
                        headers=headers,
                    )
                    tasks_raw = tasks_resp.json() if tasks_resp.status_code == 200 else []
                    parsed_tasks = []
                    done_count = 0
                    for tk in tasks_raw:
                        # state == 2 no GLPI significa Tarefa Concluída (Done)
                        is_done = int(tk.get("state", 1)) == 2
                        if is_done:
                            done_count += 1
                        clean_text = re.sub(r"<[^>]+>", "", str(tk.get("content", ""))).strip()
                        parsed_tasks.append(
                            {
                                "id": tk.get("id"),
                                "title": clean_text[:140] or f"Etapa #{tk.get('id')}",
                                "completed": is_done,
                                "date": tk.get("date_mod") or tk.get("date"),
                            }
                        )

                    total_tasks = len(parsed_tasks)
                    progress_pct = round((done_count / total_tasks) * 100, 1) if total_tasks > 0 else 0.0

                    provimento_data = {
                        "has_project": True,
                        "ticket_id": implantacao_ticket_id,
                        "project_title": implantacao_title,
                        "progress_percent": progress_pct,
                        "completed_tasks": done_count,
                        "total_tasks": total_tasks,
                        "tasks": parsed_tasks,
                        "ticket_status": self._map_status(
                            int(t_detail.json().get("status", 2))
                        )
                        if t_detail.status_code == 200
                        else "Em Andamento",
                    }

                resolved_count = sum(
                    1 for t in monthly_tickets if t["status"] in ("Solucionado", "Fechado")
                )

                return {
                    "total_opened": len(monthly_tickets),
                    "total_resolved": resolved_count,
                    "total_in_progress": len(monthly_tickets) - resolved_count,
                    "top_incidences": [
                        {"category": cat, "count": cnt}
                        for cat, cnt in categories_counter.most_common(5)
                    ],
                    "recent_tickets": monthly_tickets[:12],
                    "inventory": {
                        "has_agent_data": len(computers) > 0,
                        "total_machines": len(computers),
                        "machines": computers[:25],
                        "note": (
                            f"{len(computers)} ativos inventariados via GLPI Agent."
                            if computers
                            else "Inventário automatizado em fase de implantação do agente GLPI."
                        ),
                    },
                    "provimento_cnj": provimento_data,
                }
            finally:
                await self._kill_session(client, token)

    @staticmethod
    def _map_status(code: int) -> str:
        return {
            1: "Novo",
            2: "Em Atendimento",
            3: "Planejado",
            4: "Pendente",
            5: "Solucionado",
            6: "Fechado",
        }.get(code, "Em Atendimento")