from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.admins import schemas, service
from app.core.dependencies import get_db, require_permission
from app.core.redis import get_redis

router = APIRouter(prefix="/api/admins", tags=["admins"])


@router.get("", response_model=schemas.AdminListResponse)
async def list_admins(
    search: str | None = Query(None),
    role_id: int | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("admins:manage")),
):
    items, total = await service.get_admins(
        db, search=search, role_id=role_id, is_active=is_active, page=page, limit=limit
    )
    return schemas.AdminListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=service.total_pages(total, limit),
    )


@router.post("", response_model=schemas.AdminCreateResponse, status_code=201)
async def create_admin(
    body: schemas.AdminCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("admins:manage")),
):
    admin, password = await service.create_admin(
        db,
        username=body.username,
        fio=body.fio,
        role_id=body.role_id,
        is_active=body.is_active,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )
    return schemas.AdminCreateResponse(
        **schemas.AdminRead.model_validate(admin).model_dump(),
        generated_password=password,
    )


@router.get("/{admin_id}", response_model=schemas.AdminRead)
async def get_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("admins:manage")),
):
    return await service.get_admin_by_id(db, admin_id)


@router.patch("/{admin_id}", response_model=schemas.AdminRead)
async def update_admin(
    admin_id: int,
    body: schemas.AdminUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("admins:manage")),
):
    return await service.update_admin(
        db,
        admin_id,
        fio=body.fio,
        role_id=body.role_id,
        is_active=body.is_active,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.delete("/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("admins:manage")),
):
    await service.delete_admin(
        db,
        admin_id,
        current_admin_id=current_admin.id,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.post("/{admin_id}/reset-password", response_model=schemas.GeneratedPasswordResponse)
async def reset_admin_password(
    admin_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("admins:manage")),
    redis=Depends(get_redis),
):
    password = await service.reset_admin_password(
        db,
        admin_id,
        redis=redis,
        actor_id=current_admin.id,
        actor_username=current_admin.username,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )
    return schemas.GeneratedPasswordResponse(generated_password=password)
