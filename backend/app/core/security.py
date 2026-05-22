import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(admin_id: int, password_changed: bool) -> str:
    payload = {
        "sub": str(admin_id),
        "password_changed": password_changed,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError if token is invalid or expired."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])


def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash)."""
    raw = secrets.token_hex(32)
    return raw, _hash_token(raw)


def hash_refresh_token(raw: str) -> str:
    return _hash_token(raw)


def _hash_token(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
