from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    DEV_MOCK_MODE: bool = True
    DOMAIN: str = "localhost"
    SECRET_KEY: str = "dev-secret-key-softlan-audit-local-only-2026"
    ALLOWED_GOOGLE_DOMAIN: str = "softlanti.com.br"
    GOOGLE_CLIENT_ID: str = ""

    DATABASE_URL: str = "postgresql+asyncpg://softlan_audit:softlan_local_pass@db:5432/monthly_audit"

    GLPI_API_URL: str = "https://suporte.softmonitora.com.br/apirest.php"
    GLPI_APP_TOKEN: str = ""
    GLPI_USER_TOKEN: str = ""
    GLPI_IMPLANTACAO_CATEGORY_NAME: str = "Implantação Novo Cliente"

    BITDEFENDER_API_URL: str = "https://cloud.gravityzone.bitdefender.com/api/v1.0/jsonrpc"
    BITDEFENDER_API_KEY: str = ""

    ZABBIX_API_URL: str = "http://host.docker.internal/zabbix/api_jsonrpc.php"
    ZABBIX_API_TOKEN: str = ""
    ZABBIX_BACKUP_GROUP: str = "LogsBackups"


settings = Settings()