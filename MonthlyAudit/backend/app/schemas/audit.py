from pydantic import BaseModel, Field, field_validator


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., min_length=10)


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|user)$")


class ClientMappingCreate(BaseModel):
    glpi_entity_id: int
    display_name: str = Field(..., min_length=2, max_length=255)
    bitdefender_company_id: str | None = None
    zabbix_host_slug: str | None = None
    is_cartorio: bool = True

    @field_validator("bitdefender_company_id", "zabbix_host_slug", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: str | None) -> str | None:
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v


class ReportTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: str | None = None
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True
    default_executive_summary: str | None = None


class EditableAuditPayload(BaseModel):
    client_mapping_id: int
    client_name: str
    reference_month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    template_name: str = "Padrão Softlan TI"
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True
    executive_summary: str = ""
    glpi_summary: dict
    provimento_cnj: dict | None = None
    bitdefender_summary: dict | None = None
    backup_summary: dict | None = None