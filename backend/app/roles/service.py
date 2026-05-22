from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import write_audit
from app.core.errors import IsSystemRole, RoleInUse, RoleNotFound
from app.roles.models import Role


async def get_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role).order_by(Role.label))
    return list(result.scalars().all())


async def get_role_by_id(db: AsyncSession, role_id: int) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise RoleNotFound()
    return role


async def create_role(
    db: AsyncSession,
    *,
    name: str,
    label: str,
    description: str,
    permissions: list[str],
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> Role:
    role = Role(name=name, label=label, description=description, permissions=permissions)
    db.add(role)
    await db.flush()

    await write_audit(
        db,
        "role.created",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="role",
        target_id=role.id,
    )
    await db.commit()

    result = await db.execute(select(Role).where(Role.id == role.id))
    return result.scalar_one()


async def update_role(
    db: AsyncSession,
    role_id: int,
    *,
    label: str | None,
    description: str | None,
    permissions: list[str] | None,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> Role:
    role = await get_role_by_id(db, role_id)

    if role.is_system:
        raise IsSystemRole()

    if label is not None:
        role.label = label
    if description is not None:
        role.description = description
    if permissions is not None:
        old_set = set(role.permissions or [])
        new_set = set(permissions)
        added = sorted(new_set - old_set)
        removed = sorted(old_set - new_set)
        role.permissions = permissions
        if added or removed:
            await write_audit(
                db,
                "role.permissions_changed",
                actor_id=actor_id,
                actor_username=actor_username,
                ip=ip,
                request_id=request_id,
                target_type="role",
                target_id=role_id,
                details={"added": added, "removed": removed},
            )

    await write_audit(
        db,
        "role.updated",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="role",
        target_id=role_id,
    )
    await db.commit()

    result = await db.execute(select(Role).where(Role.id == role_id))
    return result.scalar_one()


async def delete_role(
    db: AsyncSession,
    role_id: int,
    *,
    actor_id: int,
    actor_username: str,
    ip: str | None,
    request_id: str | None,
) -> None:
    role = await get_role_by_id(db, role_id)

    if role.is_system:
        raise IsSystemRole()

    # Import here to avoid circular import
    from app.admins.models import Admin  # noqa: PLC0415

    count_result = await db.execute(
        select(func.count()).select_from(Admin).where(Admin.role_id == role_id)
    )
    if count_result.scalar_one() > 0:
        raise RoleInUse()

    await write_audit(
        db,
        "role.deleted",
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type="role",
        target_id=role_id,
    )
    await db.delete(role)
    await db.commit()
