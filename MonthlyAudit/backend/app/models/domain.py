from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserAccount(Base):
    """Gerenciamento de usuários e permissões (admin vs user) sincronizado com o PostgreSQL."""

    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    picture: Mapped[str | None] = mapped_column(String(512), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)  # "admin" | "user"
    last_login: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ClientMapping(Base):
    """Mapeia a identidade unificada do cliente entre GLPI, Bitdefender e Zabbix."""

    __tablename__ = "client_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    glpi_entity_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bitdefender_company_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    zabbix_host_slug: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_cartorio: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportTemplate(Base):
    """Padrões reutilizáveis de relatórios (ex: Completo CNJ, Executivo Corporativo, Apenas Backups)."""

    __tablename__ = "report_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    show_glpi_tickets: Mapped[bool] = mapped_column(Boolean, default=True)
    show_glpi_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    show_provimento_cnj: Mapped[bool] = mapped_column(Boolean, default=True)
    show_bitdefender: Mapped[bool] = mapped_column(Boolean, default=True)
    show_backups: Mapped[bool] = mapped_column(Boolean, default=True)
    default_executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditReportHistory(Base):
    """Histórico imutável de auditorias geradas e exportadas."""

    __tablename__ = "audit_report_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_mapping_id: Mapped[int] = mapped_column(ForeignKey("client_mappings.id"), nullable=False)
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reference_month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    template_name: Mapped[str] = mapped_column(String(150), nullable=False)
    snapshot_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_by: Mapped[str] = mapped_column(String(255), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())