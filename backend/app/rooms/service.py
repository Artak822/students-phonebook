from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RoomHasStudents, RoomNotFound
from app.rooms.models import Room
from app.rooms.schemas import BulkCreateItem, BulkCreateResult, RoomCreate, RoomUpdate


async def get_rooms(
    db: AsyncSession,
    *,
    building: int | None = None,
    entrance: int | None = None,
) -> list[Room]:
    q = select(Room)
    if building is not None:
        q = q.where(Room.building == building)
    if entrance is not None:
        q = q.where(Room.entrance == entrance)
    q = q.order_by(Room.building, Room.entrance, Room.room_number)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_room_by_id(db: AsyncSession, room_id: int) -> Room:
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if room is None:
        raise RoomNotFound()
    return room


async def create_room(db: AsyncSession, data: RoomCreate) -> Room:
    room = Room(
        building=data.building,
        entrance=data.entrance,
        room_number=data.room_number,
        capacity=data.capacity,
    )
    db.add(room)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        from app.core.errors import APIError  # noqa: PLC0415

        class RoomDuplicate(APIError):
            code = "ROOM_DUPLICATE"
            http_status = 409
            message = "Комната с таким адресом уже существует"

        raise RoomDuplicate()
    await db.commit()
    result = await db.execute(select(Room).where(Room.id == room.id))
    return result.scalar_one()


async def update_room(db: AsyncSession, room_id: int, data: RoomUpdate) -> Room:
    room = await get_room_by_id(db, room_id)
    if data.building is not None:
        room.building = data.building
    if data.entrance is not None:
        room.entrance = data.entrance
    if data.room_number is not None:
        room.room_number = data.room_number
    if data.capacity is not None:
        room.capacity = data.capacity
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        from app.core.errors import APIError  # noqa: PLC0415

        class RoomDuplicate(APIError):
            code = "ROOM_DUPLICATE"
            http_status = 409
            message = "Комната с таким адресом уже существует"

        raise RoomDuplicate()
    await db.commit()
    result = await db.execute(select(Room).where(Room.id == room_id))
    return result.scalar_one()


async def delete_room(db: AsyncSession, room_id: int) -> None:
    room = await get_room_by_id(db, room_id)

    # Проверяем наличие студентов через подзапрос (employees ещё не импортируем напрямую)
    from app.employees.models import Employee  # noqa: PLC0415

    count_result = await db.execute(
        select(func.count())
        .select_from(Employee)
        .where(Employee.room_id == room_id, Employee.deleted_at.is_(None))
    )
    if count_result.scalar_one() > 0:
        raise RoomHasStudents()

    await db.delete(room)
    await db.commit()


async def get_room_students(db: AsyncSession, room_id: int):
    await get_room_by_id(db, room_id)
    from app.employees.models import Employee  # noqa: PLC0415

    result = await db.execute(
        select(Employee)
        .where(Employee.room_id == room_id, Employee.deleted_at.is_(None))
        .order_by(Employee.fio)
    )
    return list(result.scalars().all())


async def bulk_create_rooms(
    db: AsyncSession,
    *,
    building: int,
    entrance: int,
    items: list[BulkCreateItem],
) -> BulkCreateResult:
    created = 0
    skipped = 0
    skipped_numbers: list[int] = []

    for item in items:
        existing = await db.execute(
            select(Room).where(
                Room.building == building,
                Room.entrance == entrance,
                Room.room_number == item.room_number,
            )
        )
        if existing.scalar_one_or_none() is not None:
            skipped += 1
            skipped_numbers.append(item.room_number)
            continue

        room = Room(
            building=building,
            entrance=entrance,
            room_number=item.room_number,
            capacity=item.capacity,
        )
        db.add(room)
        created += 1

    await db.flush()
    await db.commit()

    return BulkCreateResult(created=created, skipped=skipped, skipped_numbers=skipped_numbers)
