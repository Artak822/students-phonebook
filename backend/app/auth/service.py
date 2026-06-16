import json
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import write_audit
from app.config import settings
from app.core.errors import InvalidCredentials, NotAuthenticated, RateLimitExceeded, SamePassword
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

_RATE_LIMIT_WINDOW = 5 * 60  # секунды
_RATE_LIMIT_MAX = 10


async def login(
    db: AsyncSession,
    redis: Redis,
    *,
    ip: str,
    user_agent: str | None,
    request_id: str | None,
    username: str,
    password: str,
) -> tuple[str, str, bool]:
    """Возвращает (access_token, refresh_token_raw, must_change_password)."""
    from app.admins.models import Admin

    # Rate limit
    rate_key = f"rate_limit:login:{ip}"
    count = await redis.incr(rate_key)
    if count == 1:
        await redis.expire(rate_key, _RATE_LIMIT_WINDOW)
    if count > _RATE_LIMIT_MAX:
        await write_audit(db, "auth.login.rate_limited", actor_username=username, ip=ip, request_id=request_id)
        await db.commit()
        raise RateLimitExceeded()

    result = await db.execute(
        select(Admin).options(selectinload(Admin.role)).where(Admin.username == username)
    )
    admin = result.scalar_one_or_none()

    credentials_ok = (
        admin is not None
        and admin.is_active
        and verify_password(password, admin.password_hash)
    )

    if not credentials_ok:
        await write_audit(
            db,
            "auth.login.failed",
            actor_id=admin.id if admin else None,
            actor_username=username,
            ip=ip,
            request_id=request_id,
        )
        await db.commit()
        raise InvalidCredentials()

    access_token = create_access_token(admin.id, admin.password_changed)
    refresh_raw, refresh_hash = create_refresh_token()
    await _store_refresh(redis, admin.id, refresh_hash, user_agent=user_agent)

    await write_audit(
        db,
        "auth.login.success",
        actor_id=admin.id,
        actor_username=admin.username,
        ip=ip,
        request_id=request_id,
    )
    await db.commit()

    return access_token, refresh_raw, not admin.password_changed


async def logout(
    db: AsyncSession,
    redis: Redis,
    admin,
    *,
    refresh_token_raw: str | None,
    ip: str | None,
    request_id: str | None,
) -> None:
    if refresh_token_raw:
        token_hash = hash_refresh_token(refresh_token_raw)
        await redis.delete(f"refresh:{token_hash}")
        await redis.srem(f"admin_refresh:{admin.id}", token_hash)

    await write_audit(
        db,
        "auth.logout",
        actor_id=admin.id,
        actor_username=admin.username,
        ip=ip,
        request_id=request_id,
    )
    await db.commit()


async def refresh_access(
    db: AsyncSession,
    redis: Redis,
    *,
    refresh_token_raw: str | None,
    ip: str | None,
    user_agent: str | None,
    request_id: str | None,
) -> str:
    """Возвращает новый access_token."""
    from app.admins.models import Admin

    if not refresh_token_raw:
        raise NotAuthenticated()

    token_hash = hash_refresh_token(refresh_token_raw)
    data = await redis.get(f"refresh:{token_hash}")

    if data is None:
        await write_audit(db, "auth.refresh.invalid", ip=ip, request_id=request_id)
        await db.commit()
        raise NotAuthenticated()

    info = json.loads(data)
    admin_id = info["admin_id"]

    # Проверяем device fingerprint — логируем аномалию при расхождении
    stored_ua = info.get("user_agent")
    if stored_ua and user_agent and stored_ua != user_agent:
        await write_audit(
            db,
            "auth.refresh.ua_mismatch",
            actor_id=admin_id,
            ip=ip,
            request_id=request_id,
            details={"stored_ua": stored_ua[:120], "current_ua": (user_agent or "")[:120]},
        )

    result = await db.execute(
        select(Admin)
        .options(selectinload(Admin.role))
        .where(Admin.id == admin_id, Admin.is_active.is_(True))
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        await redis.delete(f"refresh:{token_hash}")
        raise NotAuthenticated()

    return create_access_token(admin.id, admin.password_changed)


async def change_password(
    db: AsyncSession,
    redis: Redis,
    admin,
    *,
    old_password: str,
    new_password: str,
    current_refresh_raw: str | None,
) -> str:
    """Возвращает новый access_token."""
    if not verify_password(old_password, admin.password_hash):
        raise InvalidCredentials()

    if verify_password(new_password, admin.password_hash):
        raise SamePassword()

    admin.password_hash = hash_password(new_password)
    admin.password_changed = True
    admin.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Инвалидируем все refresh-токены кроме текущей сессии
    current_hash = hash_refresh_token(current_refresh_raw) if current_refresh_raw else None
    members = await redis.smembers(f"admin_refresh:{admin.id}")
    for h in members:
        if h != current_hash:
            await redis.delete(f"refresh:{h}")
            await redis.srem(f"admin_refresh:{admin.id}", h)

    return create_access_token(admin.id, True)


# ---------- helpers ----------

async def _store_refresh(
    redis: Redis,
    admin_id: int,
    token_hash: str,
    *,
    user_agent: str | None = None,
) -> None:
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    expires_at = (datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
    data = json.dumps({
        "admin_id": admin_id,
        "expires_at": expires_at,
        "user_agent": (user_agent or "")[:256],  # обрезаем до разумной длины
    })
    await redis.set(f"refresh:{token_hash}", data, ex=ttl)
    await redis.sadd(f"admin_refresh:{admin_id}", token_hash)
    await redis.expire(f"admin_refresh:{admin_id}", ttl)
