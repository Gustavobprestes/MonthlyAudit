from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ADMIN_EMAILS = {
    "gustavo@softlanti.com.br",
    "gbonaguraprestes@gmail.com",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    DEV_MOCK_MODE: bool = False
    DOMAIN: str = "localhost"
    SECRET_KEY: str
    ALLOWED_GOOGLE_DOMAIN: str = "softlanti.com.br"
    GOOGLE_CLIENT_ID: str = ""
    ADMIN_EMAILS: str = "gustavo@softlanti.com.br,gbonaguraprestes@gmail.com"

    DATABASE_URL: str

    GLPI_API_URL: str
    GLPI_APP_TOKEN: str
    GLPI_USER_TOKEN: str
    GLPI_IMPLANTACAO_CATEGORY_NAME: str = "Implantação"

    BITDEFENDER_API_URL: str
    BITDEFENDER_API_KEY: str

    ZABBIX_API_URL: str = "https://zabbix.softmonitora.com.br/zabbix/api_jsonrpc.php"
    ZABBIX_API_TOKEN: str = ""
    ZABBIX_USER: str = ""
    ZABBIX_PASSWORD: str = ""
    ZABBIX_BACKUP_GROUP: str = "LogsBackups"

    @property
    def root_admin_set(self) -> set[str]:
        env_admins = {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}
        return ROOT_ADMIN_EMAILS | env_admins


settings = Settings()