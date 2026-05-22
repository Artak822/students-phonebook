from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_permission
from app.roles import schemas, service

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("", response_model=list[schemas.RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("roles:manage")),
):
    return await service.get_roles(db)


@router.post("", response_model=schemas.RoleRead, status_code=201)
async def create_role(
    body: schemas.RoleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("roles:manage")),
):
    return await service.create_role(
        db,
        name=body.name,
        label=body.label,
        description=body.description,
        permissions=body.permissions,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.get("/{role_id}", response_model=schemas.RoleRead)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("roles:manage")),
):
    return await service.get_role_by_id(db, role_id)


@router.patch("/{role_id}", response_model=schemas.RoleRead)
async def update_role(
    role_id: int,
    body: schemas.RoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("roles:manage")),
):
    return await service.update_role(
        db,
        role_id,
        label=body.label,
        description=body.description,
        permissions=body.permissions,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("roles:manage")),
):
    await service.delete_role(
        db,
        role_id,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )
