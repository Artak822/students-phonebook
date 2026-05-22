from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_permission
from app.rooms import schemas, service

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.get("", response_model=list[schemas.RoomRead])
async def list_rooms(
    building: int | None = None,
    entrance: int | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:view")),
):
    return await service.get_rooms(db, building=building, entrance=entrance)


@router.post("", response_model=schemas.RoomRead, status_code=201)
async def create_room(
    body: schemas.RoomCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:manage")),
):
    return await service.create_room(db, body)


@router.post("/bulk", response_model=schemas.BulkCreateResult, status_code=201)
async def bulk_create_rooms(
    body: schemas.BulkCreateRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:manage")),
):
    return await service.bulk_create_rooms(
        db,
        building=body.building,
        entrance=body.entrance,
        items=body.items,
    )


@router.get("/{room_id}", response_model=schemas.RoomRead)
async def get_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:view")),
):
    return await service.get_room_by_id(db, room_id)


@router.patch("/{room_id}", response_model=schemas.RoomRead)
async def update_room(
    room_id: int,
    body: schemas.RoomUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:manage")),
):
    return await service.update_room(db, room_id, body)


@router.delete("/{room_id}", status_code=204)
async def delete_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:manage")),
):
    await service.delete_room(db, room_id)


@router.get("/{room_id}/students")
async def get_room_students(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("rooms:view")),
):
    students = await service.get_room_students(db, room_id)
    # Возвращаем минимальные поля — полная схема появится на этапе 5
    return [
        {
            "id": s.id,
            "fio": s.fio,
            "phone": s.phone,
        }
        for s in students
    ]
