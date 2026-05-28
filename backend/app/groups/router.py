from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_permission
from app.groups import schemas, service

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=list[schemas.GroupRead])
async def list_groups(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.search_groups(db, search=search)


@router.post("", response_model=schemas.GroupRead, status_code=201)
async def create_group(
    data: schemas.GroupCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    group = await service.create_group(db, data)
    await db.commit()
    return group


@router.patch("/{group_id}", response_model=schemas.GroupRead)
async def update_group(
    group_id: int,
    data: schemas.GroupUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    group = await service.update_group(db, group_id, data)
    await db.commit()
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    await service.delete_group(db, group_id)
    await db.commit()
