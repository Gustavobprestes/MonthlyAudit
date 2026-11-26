from pydantic import BaseModel, Field


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., min_length=20)


class ClientMappingCreate(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=255)
    cnpj: str | None = None
    cns: str | None = None
    is_cartorio: bool = False
    cnj_class: str | None = None
    glpi_entity_id: int
    glpi_entity_name: str
    bitdefender_company_id: str | None = None
    bitdefender_company_name: str | None = None
    zabbix_host_slug: str | None = None
    default_template_id: int | None = None


class ReportTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = ""
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True
    default_executive_note: str = ""


class EditableAuditPayload(BaseModel):
    client_mapping_id: int
    client_name: str
    reference_month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    template_name: str = "Padrão Completo Softlan TI"

    # Flags de visibilidade por seção
    show_glpi_tickets: bool = True
    show_glpi_inventory: bool = True
    show_provimento_cnj: bool = True
    show_bitdefender: bool = True
    show_backups: bool = True

    # Dados editáveis pelo analista antes de exportar o PDF
    executive_summary: str = ""
    glpi_summary: dict
    provimento_cnj: dict | None = None
    bitdefender_summary: dict | None = None
    backup_summary: dict | None = None