from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "production"
    DEV_MOCK_MODE: bool = False
    DOMAIN: str = "localhost"
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_GOOGLE_DOMAIN: str = "softlanti.com.br"
    GOOGLE_CLIENT_ID: str = ""
    ADMIN_EMAILS: str = "engenharia@softlanti.com.br"

    DATABASE_URL: str = "postgresql+asyncpg://softlan_audit:changeme@db:5432/monthly_audit"

    GLPI_API_URL: str = "https://suporte.softmonitora.com.br/apirest.php"
    GLPI_APP_TOKEN: str = ""
    GLPI_USER_TOKEN: str = ""
    GLPI_IMPLANTACAO_CATEGORY_NAME: str = "Implantação Novo Cliente"

    BITDEFENDER_API_URL: str = "https://cloud.gravityzone.bitdefender.com/api/v1.0/jsonrpc"
    BITDEFENDER_API_KEY: str = ""

    ZABBIX_API_URL: str = "https://zabbix.softmonitora.com.br/zabbix/api_jsonrpc.php"
    ZABBIX_API_TOKEN: str = ""
    ZABBIX_BACKUP_GROUP: str = "LogsBackups"

    @property
    def admin_email_set(self) -> set[str]:
        return {
            email.strip().lower()
            for email in self.ADMIN_EMAILS.split(",")
            if email.strip()
        }


settings = Settings()