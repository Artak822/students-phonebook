from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://aspirs:aspirs@db:5432/aspirs"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    RATE_LIMIT_LOGIN: str = "10/5minutes"
    LOG_LEVEL: str = "INFO"

    CORS_ORIGINS: list[str] = []
    COOKIE_DOMAIN: str = "localhost"
    COOKIE_SAMESITE: str = "lax"
    COOKIE_SECURE: bool = False

    S3_ENDPOINT: str = "http://minio:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "aspirs"

    BACKUP_S3_BUCKET: str = "aspirs-backups"
    BACKUP_LOCAL_KEEP: int = 7


settings = Settings()
