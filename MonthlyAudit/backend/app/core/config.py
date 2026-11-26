from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "production"
    DOMAIN: str = "auditoria.softmonitora.com.br"
    SECRET_KEY: str
    ALLOWED_GOOGLE_DOMAIN: str = "softlanti.com.br"
    GOOGLE_CLIENT_ID: str

    DATABASE_URL: str

    GLPI_API_URL: str
    GLPI_APP_TOKEN: str
    GLPI_USER_TOKEN: str
    GLPI_IMPLANTACAO_CATEGORY_NAME: str = "Implantação Novo Cliente"

    BITDEFENDER_API_URL: str = "https://cloud.gravityzone.bitdefender.com/api/v1.0/jsonrpc"
    BITDEFENDER_API_KEY: str = ""

    ZABBIX_API_URL: str
    ZABBIX_API_TOKEN: str
    ZABBIX_BACKUP_GROUP: str = "LogsBackups"


settings = Settings()