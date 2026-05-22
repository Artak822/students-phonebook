import math
import secrets
import string
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.admins.models import Admin
from app.audit.service import write_audit
from app.core.errors import (
    AdminNotFound,
    LastSuperAdmin,
    RoleNotFound,
    SelfDeleteForbidden,
    UsernameAlreadyExists,
)
from app.core.security import hash_password
from app.roles.models import Role

_PASSWORD_ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*"


def _generate_password(length: int = 16) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


async def _require_role(db: AsyncSession, role_id: int) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise RoleNotFound()
    return role


async def _check_username_unique(db: AsyncSession, username: str, exclude_id: int | None = None) -> None:
    q = select(Admin).where(Admin.username == username)
    if exclude_id is not None:
        q = q.where(Admin.id != exclude_id)
    result = await db.execute(q)
    if result.scalar_one_or_none() is not None:
        raise UsernameAlreadyExists()


async def _check_not_last_super_admin(db: AsyncSession, exclude_id: int) -> None:
    """Raise LastSuperAdmin if excluding this admin leaves zero active super_admins."""
    result = await db.execute(select(Role).where(Role.name == "super_admin"))
    role = result.scalar_one_or_none()
    if role is None:
        return
    count = (
        await db.execute(
            select(func.count(Admin.id)).where(
                Admin.role_id == role.id,
                Admin.is_active.is_(True),
                Admin.id != exclude_id,
            )
        )
    ).scalar_one()
    if count == 0:
        raise LastSuperAdmin()


async def _load_admin(db: AsyncSession, admin_id: int) -> Admin:
    result = await db.execute(
        select(Admin).options(selectinload(Admin.role)).where(Admin.id == admin_id)
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        raise AdminNotFound()
    return admin


async def create_admin(
    db: AsyncSession,
    *,
    username: str,
    fio: str,
    role_id: int,
    is_active: bool,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> tuple[Admin, str]:
    await _check_username_unique(db, username)
    await _require_role(db, role_id)

    password = _generate_password()
    admin = Admin(
        username=username,
        fio=fio,
        role_id=role_id,
        is_active=is_active,
        password_hash=hash_password(password),
        password_changed=False,
    )
    db.add(admin)
    await db.flush()

    await write_audit(
        db,
        "admin.created",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="admin",
        target_id=admin.id,
    )
    await db.commit()

    return await _load_admin(db, admin.id), password


async def get_admins(
    db: AsyncSession,
    *,
    search: str | None,
    role_id: int | None,
    is_active: bool | None,
    page: int,
    limit: int,
) -> tuple[list[Admin], int]:
    filters = []
    if search:
        pattern = f"%{search}%"
        filters.append(or_(Admin.username.ilike(pattern), Admin.fio.ilike(pattern)))
    if role_id is not None:
        filters.append(Admin.role_id == role_id)
    if is_active is not None:
        filters.append(Admin.is_active == is_active)

    count_q = select(func.count(Admin.id))
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar_one()

    items_q = select(Admin).options(selectinload(Admin.role))
    if filters:
        items_q = items_q.where(*filters)
    items = (
        await db.execute(items_q.order_by(Admin.fio, Admin.id).offset((page - 1) * limit).limit(limit))
    ).scalars().all()

    return list(items), total


async def get_admin_by_id(db: AsyncSession, admin_id: int) -> Admin:
    return await _load_admin(db, admin_id)


async def update_admin(
    db: AsyncSession,
    admin_id: int,
    *,
    fio: str | None,
    role_id: int | None,
    is_active: bool | None,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> Admin:
    admin = await _load_admin(db, admin_id)

    if fio is not None:
        admin.fio = fio
    if is_active is not None:
        admin.is_active = is_active
    if role_id is not None and role_id != admin.role_id:
        await _require_role(db, role_id)
        old_role_id = admin.role_id
        admin.role_id = role_id
        await write_audit(
            db,
            "admin.role_changed",
            actor_id=actor_id,
            actor_username=actor_username,
            ip=ip,
            request_id=request_id,
            target_type="admin",
            target_id=admin_id,
            details={"from_role_id": old_role_id, "to_role_id": role_id},
        )

    admin.updated_at = datetime.now(timezone.utc)
    await db.commit()
    db.expire(admin)

    return await _load_admin(db, admin_id)


async def delete_admin(
    db: AsyncSession,
    admin_id: int,
    *,
    current_admin_id: int,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> None:
    if admin_id == current_admin_id:
        raise SelfDeleteForbidden()

    admin = await _load_admin(db, admin_id)

    if admin.role and admin.role.name == "super_admin":
        await _check_not_last_super_admin(db, admin_id)

    await write_audit(
        db,
        "admin.deleted",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="admin",
        target_id=admin_id,
    )
    await db.delete(admin)
    await db.commit()


async def reset_admin_password(
    db: AsyncSession,
    admin_id: int,
    *,
    redis,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> str:
    admin = await _load_admin(db, admin_id)

    password = _generate_password()
    admin.password_hash = hash_password(password)
    admin.password_changed = False
    admin.updated_at = datetime.now(timezone.utc)

    members = await redis.smembers(f"admin_refresh:{admin_id}")
    for token_hash in members:
        await redis.delete(f"refresh:{token_hash}")
    if members:
        await redis.delete(f"admin_refresh:{admin_id}")

    await write_audit(
        db,
        "admin.password_reset",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="admin",
        target_id=admin_id,
    )
    await db.commit()

    return password


def total_pages(total: int, limit: int) -> int:
    return math.ceil(total / limit) if total > 0 else 1
