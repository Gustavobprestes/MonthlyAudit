import asyncio
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_session_jwt,
    get_current_user,
    require_admin,
    verify_google_workspace_token,
)
from app.models.domain import AuditReportHistory, ClientMapping, ReportTemplate, UserAccount
from app.schemas.audit import (
    ClientMappingCreate,
    EditableAuditPayload,
    GoogleLoginRequest,
    ReportTemplateCreate,
    UserRoleUpdate,
)
from app.services.bitdefender_service import BitdefenderService
from app.services.glpi_service import GLPIService
from app.services.pdf_service import generate_softlan_audit_pdf
from app.services.zabbix_service import ZabbixService

router = APIRouter(prefix="/api/v1")


async def _sync_user_account(db: AsyncSession, user_info: dict) -> UserAccount:
    """Cria ou atualiza o registro do usuário no PostgreSQL e determina seu papel (admin vs user)."""
    email = user_info["email"].lower()
    res = await db.execute(select(UserAccount).where(UserAccount.email == email))
    account = res.scalar_one_or_none()
    is_env_admin = email in settings.admin_email_set

    if account:
        account.name = user_info.get("name") or account.name
        if user_info.get("picture"):
            account.picture = user_info["picture"]
        if is_env_admin and account.role != "admin":
            account.role = "admin"
        await db.commit()
        await db.refresh(account)
        return account

    account = UserAccount(
        email=email,
        name=user_info.get("name", email.split("@")[0]),
        picture=user_info.get("picture", ""),
        role="admin" if is_env_admin else "user",
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.post("/auth/google")
async def login_with_google(
    body: GoogleLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user_info = verify_google_workspace_token(body.credential)
    account = await _sync_user_account(db, user_info)
    token = create_session_jwt(user_info, role=account.role)
    response.set_cookie(
        key="softlan_session",
        value=token,
        httponly=True,
        secure=settings.APP_ENV == "production",
        samesite="lax",
        max_age=43200,
    )
    return {
        "authenticated": True,
        "user": {
            "sub": account.email,
            "name": account.name,
            "picture": account.picture,
            "role": account.role,
        },
    }


@router.post("/auth/dev-login")
async def login_dev_mock(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if not settings.DEV_MOCK_MODE:
        raise HTTPException(status_code=403, detail="Modo de simulação desabilitado em produção.")
    mock_email = next(iter(settings.admin_email_set), "engenharia@softlanti.com.br")
    mock_user = {
        "email": mock_email,
        "name": "Analista Softlan TI (Modo Local)",
        "picture": "",
    }
    account = await _sync_user_account(db, mock_user)
    token = create_session_jwt(mock_user, role=account.role)
    response.set_cookie(
        key="softlan_session",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=43200,
    )
    return {
        "authenticated": True,
        "user": {
            "sub": account.email,
            "name": account.name,
            "picture": account.picture,
            "role": account.role,
        },
    }


@router.get("/auth/me")
async def auth_me(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(UserAccount).where(UserAccount.email == user["sub"].lower()))
    account = res.scalar_one_or_none()
    if account:
        effective_role = (
            "admin" if account.email in settings.admin_email_set else account.role
        )
        user["role"] = effective_role
        user["name"] = account.name
        user["picture"] = account.picture
    return {"user": user}


@router.post("/auth/logout")
async def auth_logout(response: Response):
    response.delete_cookie("softlan_session")
    return {"authenticated": False}


# ==================== ROTAS DE ADMINISTRAÇÃO (RBAC ADMIN) ====================


@router.get("/admin/users")
async def list_registered_users(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    res = await db.execute(select(UserAccount).order_by(UserAccount.name))
    users = res.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "picture": u.picture,
            "role": "admin" if u.email in settings.admin_email_set else u.role,
            "is_env_locked": u.email in settings.admin_email_set,
            "last_login": u.last_login,
        }
        for u in users
    ]


@router.patch("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    res = await db.execute(select(UserAccount).where(UserAccount.id == user_id))
    account = res.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if account.email in settings.admin_email_set and payload.role != "admin":
        raise HTTPException(
            status_code=400,
            detail="Este usuário está definido como Administrador mestre no arquivo .env.",
        )
    account.role = payload.role
    await db.commit()
    await db.refresh(account)
    return {"id": account.id, "email": account.email, "role": account.role}


@router.get("/discovery/sources")
async def discover_external_sources(admin: dict = Depends(require_admin)):
    """Busca simultaneamente entidades GLPI, empresas Bitdefender e hosts Zabbix."""
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
async def create_or_upsert_client_mapping(
    payload: ClientMappingCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
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


@router.put("/clients/{client_id}")
async def update_client_mapping(
    client_id: int,
    payload: ClientMappingCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    res = await db.execute(select(ClientMapping).where(ClientMapping.id == client_id))
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Ecossistema não encontrado.")

    for k, v in payload.model_dump().items():
        setattr(existing, k, v)
    await db.commit()
    await db.refresh(existing)
    return existing


@router.delete("/clients/{client_id}")
async def delete_client_mapping(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    res = await db.execute(select(ClientMapping).where(ClientMapping.id == client_id))
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Ecossistema não encontrado.")

    await db.delete(existing)
    await db.commit()
    return {"deleted": True, "id": client_id}


# ==================== TEMPLATES E AUDITORIA (TODOS OS USUÁRIOS AUTENTICADOS) ====================


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
    admin: dict = Depends(require_admin),
):
    tpl = ReportTemplate(**payload.model_dump(), created_by=admin["sub"])
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

    glpi = GLPIService()
    bd = BitdefenderService()
    zbx = ZabbixService()

    glpi_data, bd_data, zbx_data = await asyncio.gather(
        glpi.collect_client_audit(client_map.glpi_entity_id, month),
        bd.collect_security_audit(client_map.bitdefender_company_id),
        zbx.collect_backup_audit(client_map.zabbix_host_slug),
    )

    provimento = glpi_data.pop("provimento_cnj", None)

    normalized_backup = None
    if zbx_data and isinstance(zbx_data, dict):
        normalized_backup = {
            "host_slug": zbx_data.get("host_slug", client_map.zabbix_host_slug or ""),
            "overall_sla_percent": zbx_data.get("overall_sla_percent", 100.0),
            "active_channels": zbx_data.get("active_channels") or [],
            "disk_usage": zbx_data.get("disk_usage") or [],
            "analyst_note": zbx_data.get(
                "analyst_note",
                "Rotinas de cópia de segurança auditadas via telemetria Zabbix / Backblaze B2.",
            ),
            "error": zbx_data.get("error"),
        }

    normalized_bd = None
    if bd_data and isinstance(bd_data, dict):
        normalized_bd = {
            "total_endpoints": bd_data.get("total_endpoints", 0),
            "managed_endpoints": bd_data.get("managed_endpoints", 0),
            "clean_endpoints": bd_data.get("clean_endpoints", 0),
            "endpoints_with_issues": bd_data.get("endpoints_with_issues", 0),
            "quarantine_items": bd_data.get("quarantine_items", 0),
            "security_health_percent": bd_data.get("security_health_percent", 100.0),
            "error": bd_data.get("error"),
        }

    return {
        "client_mapping_id": client_map.id,
        "client_name": client_map.display_name,
        "reference_month": month,
        "template_name": "Padrão Completo Softlan TI",
        "show_glpi_tickets": True,
        "show_glpi_inventory": True,
        "show_provimento_cnj": bool(provimento and provimento.get("has_project")),
        "show_bitdefender": bool(normalized_bd),
        "show_backups": bool(normalized_backup),
        "executive_summary": (
            f"Durante a competência {month}, a equipe de engenharia executou o acompanhamento "
            f"proativo da infraestrutura, rotinas de continuidade e controles de segurança de {client_map.display_name}."
        ),
        "glpi_summary": glpi_data,
        "provimento_cnj": provimento,
        "bitdefender_summary": normalized_bd,
        "backup_summary": normalized_backup,
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