from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., min_length=20)


class UserRoleUpdate(BaseModel):
    role: Literal["admin", "user"]


class UserAccountOut(BaseModel):
    id: int
    email: str
    name: str
    picture: str
    role: str
    is_env_locked: bool = False
    last_login: datetime | None = None

    class Config:
        from_attributes = True


class ClientMappingCreate(BaseModel):
    glpi_entity_id: int
    display_name: str = Field(..., min_length=2, max_length=255)
    bitdefender_company_id: str | None = None
    zabbix_host_slug: str | None = None
    is_cartorio: bool = False


class ClientMappingOut(ClientMappingCreate):
    id: int

    class Config:
        from_attributes = True


class ReportTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True
    default_executive_summary: str = ""


class ReportTemplateOut(ReportTemplateCreate):
    id: int

    class Config:
        from_attributes = True


class EditableAuditPayload(BaseModel):
    client_mapping_id: int
    client_name: str
    reference_month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    template_name: str = "Padrão Completo Softlan TI"
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_plantao_obito: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True
    executive_summary: str = ""
    glpi_summary: dict[str, Any] = {}
    provimento_cnj: dict[str, Any] | None = None
    plantao_obito: list[dict[str, Any]] = []
    bitdefender_summary: dict[str, Any] | None = None
    backup_summary: dict[str, Any] | None = None
    unified_assets: list[dict[str, Any]] = []