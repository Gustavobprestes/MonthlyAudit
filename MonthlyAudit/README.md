# Softlan TI • MonthlyAudit Portal - Gustavo Prestes

Plataforma web corporativa (SPA) para consolidação automatizada de auditorias técnicas mensais, governança de TI, conformidade com o **Provimento CNJ nº 213/243** e geração determinística de relatórios executivos em PDF padronizado.

---

## Arquitetura & Integrações

O sistema opera de forma **100% desacoplada do Grafana**, consumindo diretamente as APIs nativas das ferramentas de operação da **Softlan TI**:

1. **GLPI 10.0.18 (REST API):**
   * Coleta volumetria mensal de chamados abertos, solucionados e em tratamento por Entidade.
   * Identifica as maiores incidências por categoria ITIL.
   * Extrai o inventário de máquinas sincronizadas via GLPI Agent (quando disponível).
   * Monitora automaticamente o progresso percentual das tarefas (`TicketTask`) dos projetos na categoria **Implantação Novo Cliente** (*Adequação Tecnológica: Provimento CNJ*).
2. **Bitdefender GravityZone (JSON-RPC 2.0):**
   * Consulta o inventário de endpoints gerenciados, status de integridade de segurança e itens em quarentena por empresa filha (*Tenant MSP*).
3. **Zabbix 7.0.28 (JSON-RPC 2.0 — Pipeline Backblaze B2):**
   * Consulta o status atual, data da última verificação e disponibilidade real nos últimos 30 dias apenas dos canais de backup ativos (`Backup Nuvem`, `HD Externo 1`, `HD Externo 2`, `Replica`, `Storage`), omitindo rotinas não contratadas.
4. **Motor de PDF & Trilha Auditável (WeasyPrint + PostgreSQL):**
   * Permite edição de pareceres técnicos antes da emissão e aplicação de **Padrões de Envio** salvos (ex.: *Padrão Completo*, *Sem Bitdefender*).
   * Gera relatórios PDF padronizados com assinatura visual Softlan TI e grava snapshot imutável com **Hash SHA-256** no PostgreSQL.

---

## Stack Tecnológica

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Three.js (WebGL Shaders + Bloom).
* **Backend:** Python 3.12, FastAPI, SQLAlchemy Async, Pydantic v2, WeasyPrint, Bleach.
* **Banco de Dados:** PostgreSQL 16 (Alpine).
* **Autenticação & Segurança:** Google Workspace OAuth 2.0 (`@softlanti.com.br`), JWT assinado em cookie `HttpOnly` + `SameSite=Lax`, sanitização HTML estrita e cabeçalhos OWASP via Caddy.

---

## Estrutura do Repositório

```text
MonthlyAudit/
├── backend/                # API FastAPI, integrações GLPI/Bitdefender/Zabbix e motor PDF
├── frontend/               # SPA React + TypeScript + WebGL Shaders
├── Caddyfile               # Proxy reverso e cabeçalhos de segurança HTTP
├── docker-compose.yml      # Orquestração dos containers (db, backend, frontend, caddy)
├── .env.example            # Modelo de variáveis de ambiente (sem credenciais)
├── .gitignore              # Bloqueio estrito de segredos, caches e builds
└── README.md               # Documentação técnica do projeto