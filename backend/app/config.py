from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_KNOWN_BAD_KEYS = frozenset({"change-me-in-production", "REPLACE_ME", "secret", ""})
_KNOWN_BAD_S3 = frozenset({"minioadmin", "REPLACE_ME"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    RATE_LIMIT_LOGIN: str = "10/5minutes"
    LOG_LEVEL: str = "INFO"

    # Допустимые форматы в .env:
    #   CORS_ORIGINS=                           ← пусто → []
    #   CORS_ORIGINS=http://localhost:3000       ← один origin
    #   CORS_ORIGINS=http://a.com,http://b.com  ← несколько через запятую
    #   CORS_ORIGINS=["http://a.com"]           ← JSON-массив
    CORS_ORIGINS: str = ""

    COOKIE_DOMAIN: str = ""  # пусто = не выставлять domain attribute (браузер определит сам)
    COOKIE_SAMESITE: str = "lax"
    COOKIE_SECURE: bool = True

    S3_ENDPOINT: str = "http://minio:9000"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "aspirs"

    BACKUP_S3_BUCKET: str = "aspirs-backups"
    BACKUP_LOCAL_KEEP: int = 7

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        if self.SECRET_KEY in _KNOWN_BAD_KEYS:
            raise ValueError(
                "SECRET_KEY не задан или использует небезопасное значение по умолчанию. "
                "Установите криптостойкий ключ (минимум 32 символа)."
            )
        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                f"SECRET_KEY слишком короткий ({len(self.SECRET_KEY)} симв.). Минимум 32 символа."
            )
        if (self.S3_ACCESS_KEY and self.S3_ACCESS_KEY in _KNOWN_BAD_S3) or \
                (self.S3_SECRET_KEY and self.S3_SECRET_KEY in _KNOWN_BAD_S3):
            raise ValueError(
                "S3_ACCESS_KEY / S3_SECRET_KEY используют дефолтные небезопасные значения. "
                "Смените учётные данные MinIO перед запуском."
            )
        return self

    @property
    def cors_origins(self) -> list[str]:
        v = self.CORS_ORIGINS.strip()
        if not v:
            return []
        if v.startswith("["):
            import json
            try:
                return json.loads(v)
            except Exception:
                pass
        return [s.strip() for s in v.split(",") if s.strip()]


settings = Settings()
