import asyncio
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_session_jwt,
    get_current_user,
    verify_google_workspace_token,
)
from app.models.domain import AuditReportHistory, ClientMapping, ReportTemplate
from app.schemas.audit import (
    ClientMappingCreate,
    EditableAuditPayload,
    GoogleLoginRequest,
    ReportTemplateCreate,
)
from app.services.bitdefender_service import BitdefenderService
from app.services.glpi_service import GLPIService
from app.services.pdf_service import generate_softlan_audit_pdf
from app.services.zabbix_service import ZabbixService

router = APIRouter(prefix="/api/v1")


@router.post("/auth/google")
async def login_with_google(body: GoogleLoginRequest, response: Response):
    user_info = verify_google_workspace_token(body.credential)
    token = create_session_jwt(user_info)
    response.set_cookie(
        key="softlan_session",
        value=token,
        httponly=True,
        secure=settings.APP_ENV == "production",
        samesite="lax",
        max_age=43200,
    )
    return {"authenticated": True, "user": user_info}


@router.post("/auth/dev-login")
async def login_dev_mock(response: Response):
    """Disponível exclusivamente quando DEV_MOCK_MODE=true em ambiente local."""
    if not settings.DEV_MOCK_MODE:
        raise HTTPException(status_code=403, detail="Modo de simulação desabilitado em produção.")
    mock_user = {
        "email": "engenharia@softlanti.com.br",
        "name": "Analista Softlan TI (Modo Local)",
        "picture": "",
    }
    token = create_session_jwt(mock_user)
    response.set_cookie(
        key="softlan_session",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=43200,
    )
    return {"authenticated": True, "user": {"sub": mock_user["email"], "name": mock_user["name"]}}


@router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@router.post("/auth/logout")
async def auth_logout(response: Response):
    response.delete_cookie("softlan_session")
    return {"authenticated": False}


@router.get("/discovery/sources")
async def discover_external_sources(user: dict = Depends(get_current_user)):
    """Busca entidades do GLPI, empresas do Bitdefender e hosts de backup do Zabbix."""
    if settings.DEV_MOCK_MODE and not settings.GLPI_APP_TOKEN:
        return {
            "glpi_entities": [
                {
                    "id": 77,
                    "name": "4º Registro de Imóveis de Curitiba",
                    "completename": "Softlan TI > 4º Registro de Imóveis de Curitiba",
                },
                {
                    "id": 80,
                    "name": "5º Tabelionato de Notas de Curitiba",
                    "completename": "Softlan TI > 5º Tabelionato de Notas de Curitiba",
                },
                {
                    "id": 99,
                    "name": "Coval Automação Ltda",
                    "completename": "Softlan TI > Coval Automação Ltda",
                },
            ],
            "bitdefender_companies": [
                {"id": "bd-001", "name": "4º Registro de Imóveis de Curitiba"},
                {"id": "bd-002", "name": "5º Tabelionato de Notas de Curitiba"},
            ],
            "zabbix_hosts": [
                {"hostid": "101", "slug": "4ri", "name": "4º Registro de Imóveis de Curitiba"},
                {"hostid": "102", "slug": "5notas", "name": "5º Tabelionato de Notas de Curitiba"},
            ],
        }

    glpi = GLPIService()
    bd = BitdefenderService()
    zbx = ZabbixService()

    entities, companies, zbx_hosts = await asyncio.gather(
        glpi.list_entities(),
        bd.list_companies(),
        zbx.list_backup_hosts(),
        return_exceptions=True,
    )
    return {
        "glpi_entities": entities if isinstance(entities, list) else [],
        "bitdefender_companies": companies if isinstance(companies, list) else [],
        "zabbix_hosts": zbx_hosts if isinstance(zbx_hosts, list) else [],
    }


@router.get("/clients")
async def list_client_mappings(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(select(ClientMapping).order_by(ClientMapping.display_name))
    return res.scalars().all()


@router.post("/clients")
async def upsert_client_mapping(
    payload: ClientMappingCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(
        select(ClientMapping).where(ClientMapping.glpi_entity_id == payload.glpi_entity_id)
    )
    existing = res.scalar_one_or_none()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        await db.commit()
        await db.refresh(existing)
        return existing

    new_map = ClientMapping(**payload.model_dump())
    db.add(new_map)
    await db.commit()
    await db.refresh(new_map)
    return new_map


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(select(ReportTemplate).order_by(ReportTemplate.name))
    return res.scalars().all()


@router.post("/templates")
async def create_template(
    payload: ReportTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    tpl = ReportTemplate(**payload.model_dump(), created_by=user["sub"])
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


@router.get("/audit/collect/{client_id}")
async def collect_audit_preview(
    client_id: int,
    month: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(select(ClientMapping).where(ClientMapping.id == client_id))
    client_map = res.scalar_one_or_none()
    if not client_map:
        raise HTTPException(status_code=404, detail="Cliente não mapeado.")

    if settings.DEV_MOCK_MODE and not settings.GLPI_APP_TOKEN:
        return {
            "client_mapping_id": client_map.id,
            "client_name": client_map.display_name,
            "reference_month": month,
            "template_name": "Padrão Completo Softlan TI",
            "show_glpi_tickets": True,
            "show_glpi_inventory": True,
            "show_provimento_cnj": client_map.is_cartorio,
            "show_bitdefender": True,
            "show_backups": True,
            "executive_summary": (
                f"Durante a competência {month}, a engenharia da Softlan TI conduziu o monitoramento "
                f"preventivo, a sustentação técnica e a auditoria de continuidade de {client_map.display_name}."
            ),
            "glpi_summary": {
                "total_opened": 18,
                "total_resolved": 16,
                "total_in_progress": 2,
                "top_incidences": [
                    {"category": "Certificação Digital / Token A3", "count": 6},
                    {"category": "Impressoras & Spooler", "count": 5},
                    {"category": "Sistema Cartorário / Banco de Dados", "count": 4},
                ],
                "recent_tickets": [],
                "inventory": {
                    "has_agent_data": True,
                    "total_machines": 14,
                    "machines": [
                        {
                            "name": "SRV-DADOS-01",
                            "os": "Windows Server 2022 Standard",
                            "last_sync": "Hoje 08:15",
                        },
                        {
                            "name": "BALCAO-01",
                            "os": "Windows 11 Pro 24H2",
                            "last_sync": "Hoje 08:12",
                        },
                    ],
                    "note": "14 ativos inventariados via GLPI Agent.",
                },
            },
            "provimento_cnj": {
                "has_project": client_map.is_cartorio,
                "ticket_id": 7421,
                "project_title": "ADEQUAÇÃO TECNOLÓGICA — PROVIMENTO CNJ",
                "progress_percent": 75.0,
                "completed_tasks": 6,
                "total_tasks": 8,
                "tasks": [
                    {
                        "id": 1,
                        "title": "Inventário de Ativos e Classificação da Serventia",
                        "completed": True,
                        "date": "2026-11-10",
                    },
                    {
                        "id": 2,
                        "title": "Implantação de Backup Imutável em Nuvem (Backblaze B2)",
                        "completed": True,
                        "date": "2026-11-14",
                    },
                    {
                        "id": 3,
                        "title": "Gestão Centralizada de Endpoints (Bitdefender GravityZone)",
                        "completed": True,
                        "date": "2026-11-18",
                    },
                    {
                        "id": 4,
                        "title": "Elaboração da Política de Segurança da Informação (PSI) e PCN",
                        "completed": False,
                        "date": "2026-11-26",
                    },
                ],
            }
            if client_map.is_cartorio
            else None,
            "bitdefender_summary": {
                "total_endpoints": 14,
                "managed_endpoints": 14,
                "clean_endpoints": 14,
                "endpoints_with_issues": 0,
                "quarantine_items": 2,
                "security_health_percent": 100.0,
            },
            "backup_summary": {
                "host_slug": client_map.zabbix_host_slug or "cliente-b2",
                "overall_sla_percent": 99.4,
                "active_channels": [
                    {
                        "channel": "Backup Nuvem (Backblaze B2)",
                        "status": "Operante",
                        "is_healthy": True,
                        "sla_30d_percent": 100.0,
                        "last_check": "26/11/2026 04:30",
                    },
                    {
                        "channel": "Replica Local",
                        "status": "Operante",
                        "is_healthy": True,
                        "sla_30d_percent": 98.8,
                        "last_check": "26/11/2026 04:15",
                    },
                ],
                "disk_usage": [{"volume": "Espaço Replica (/dados)", "used_percent": 41.0}],
                "analyst_note": "Rotinas de cópia de segurança auditadas e íntegras conforme política de retenção.",
            },
        }

    glpi = GLPIService()
    bd = BitdefenderService()
    zbx = ZabbixService()

    glpi_data, bd_data, zbx_data = await asyncio.gather(
        glpi.collect_client_audit(client_map.glpi_entity_id, month),
        bd.collect_security_audit(client_map.bitdefender_company_id),
        zbx.collect_backup_audit(client_map.zabbix_host_slug),
    )

    provimento = glpi_data.pop("provimento_cnj", None)

    return {
        "client_mapping_id": client_map.id,
        "client_name": client_map.display_name,
        "reference_month": month,
        "template_name": "Padrão Completo Softlan TI",
        "show_glpi_tickets": True,
        "show_glpi_inventory": True,
        "show_provimento_cnj": bool(provimento and provimento.get("has_project")),
        "show_bitdefender": bool(bd_data),
        "show_backups": bool(zbx_data),
        "executive_summary": (
            f"Durante a competência {month}, a equipe de engenharia da Softlan TI executou o acompanhamento "
            f"proativo da infraestrutura, rotinas de continuidade e controles de segurança de {client_map.display_name}."
        ),
        "glpi_summary": glpi_data,
        "provimento_cnj": provimento,
        "bitdefender_summary": bd_data,
        "backup_summary": zbx_data,
    }


@router.post("/audit/export-pdf")
async def export_audit_pdf(
    payload: EditableAuditPayload,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    data_dict = payload.model_dump()
    pdf_bytes, sha256_hash = generate_softlan_audit_pdf(data_dict, generated_by=user["name"])

    history_entry = AuditReportHistory(
        client_mapping_id=payload.client_mapping_id,
        client_name=payload.client_name,
        reference_month=payload.reference_month,
        template_name=payload.template_name,
        snapshot_payload=data_dict,
        sha256_hash=sha256_hash,
        generated_by=user["sub"],
    )
    db.add(history_entry)
    await db.commit()

    safe_filename = f"Auditoria_SoftlanTI_{payload.reference_month}_{payload.client_mapping_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.get("/audit/history")
async def list_audit_history(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(
        select(AuditReportHistory).order_by(desc(AuditReportHistory.generated_at)).limit(100)
    )
    return res.scalars().all()


@router.get("/audit/history/{history_id}/reprint")
async def reprint_history_pdf(
    history_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    res = await db.execute(
        select(AuditReportHistory).where(AuditReportHistory.id == history_id)
    )
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Relatório histórico não encontrado.")

    pdf_bytes, _ = generate_softlan_audit_pdf(
        record.snapshot_payload, generated_by=record.generated_by
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Auditoria_{record.reference_month}_{record.id}.pdf"'
        },
    )