from typing import AsyncGenerator, Callable

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    from app.admins.models import Admin
    from app.core.errors import NotAuthenticated
    from app.core.security import decode_access_token

    token = request.cookies.get("access_token")
    if not token:
        raise NotAuthenticated()
    try:
        payload = decode_access_token(token)
        admin_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise NotAuthenticated()

    result = await db.execute(
        select(Admin)
        .options(selectinload(Admin.role))
        .where(Admin.id == admin_id, Admin.is_active.is_(True))
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        raise NotAuthenticated()
    return admin


def require_permission(permission: str) -> Callable:
    async def _check(admin=Depends(get_current_admin)):
        from app.core.errors import PermissionDenied

        permissions = admin.role.permissions if admin.role else []
        if permission not in permissions:
            raise PermissionDenied()
        return admin

    return _check
