from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.api.routes import router
from app.core.config import settings
from app.core.database import AsyncSessionLocal, init_db
from app.models.domain import ReportTemplate


async def _seed_default_templates() -> None:
    """Garante que os modelos padrão de relatório da Softlan TI existam no PostgreSQL."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ReportTemplate).limit(1))
        if res.scalar_one_or_none() is None:
            defaults = [
                ReportTemplate(
                    name="Padrão Completo Softlan TI (CNJ + Segurança + Backups)",
                    description="Relatório executivo completo para serventias extrajudiciais e empresas.",
                    show_glpi_tickets=True,
                    show_glpi_inventory=True,
                    show_provimento_cnj=True,
                    show_bitdefender=True,
                    show_backups=True,
                    created_by="system@softlanti.com.br",
                ),
                ReportTemplate(
                    name="Executivo Corporativo (Sem Provimento CNJ)",
                    description="Focado em empresas privadas: chamados, inventário, Bitdefender e backups.",
                    show_glpi_tickets=True,
                    show_glpi_inventory=True,
                    show_provimento_cnj=False,
                    show_bitdefender=True,
                    show_backups=True,
                    created_by="system@softlanti.com.br",
                ),
            ]
            db.add_all(defaults)
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _seed_default_templates()
    yield


app = FastAPI(
    title="Softlan TI - Monthly Audit API",
    version="2.6.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"https://{settings.DOMAIN}", "http://localhost:8080", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "softlan-monthly-audit"}