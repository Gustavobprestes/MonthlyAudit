from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ClientMapping(Base):
    """Correlação De-Para entre GLPI Entity, Bitdefender Company e Zabbix Host."""
    __tablename__ = "client_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cns: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_cartorio: Mapped[bool] = mapped_column(Boolean, default=False)
    cnj_class: Mapped[str | None] = mapped_column(String(64), nullable=True)

    glpi_entity_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    glpi_entity_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bitdefender_company_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bitdefender_company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    zabbix_host_slug: Mapped[str | None] = mapped_column(String(128), nullable=True)

    default_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ReportTemplate(Base):
    """Padrões de envio salvos (ex: Completo, Sem Bitdefender, Somente Backups)."""
    __tablename__ = "report_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="")
    show_glpi_tickets: Mapped[bool] = mapped_column(Boolean, default=True)
    show_glpi_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    show_provimento_cnj: Mapped[bool] = mapped_column(Boolean, default=True)
    show_bitdefender: Mapped[bool] = mapped_column(Boolean, default=True)
    show_backups: Mapped[bool] = mapped_column(Boolean, default=True)
    default_executive_note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(180), nullable=False)


class AuditReportHistory(Base):
    """Histórico imutável de relatórios PDF gerados."""
    __tablename__ = "audit_report_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_mapping_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reference_month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    template_name: Mapped[str] = mapped_column(String(120), nullable=False)
    snapshot_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_by: Mapped[str] = mapped_column(String(180), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )