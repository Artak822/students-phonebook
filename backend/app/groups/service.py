from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import GroupHasStudents, GroupNotFound
from app.employees.models import Employee
from app.groups.models import Group
from app.groups.schemas import GroupCreate, GroupUpdate


async def search_groups(db: AsyncSession, search: str | None = None) -> list[Group]:
    q = select(Group).order_by(Group.name)
    if search:
        q = q.where(Group.name.ilike(f"%{search}%"))
    q = q.limit(50)
    result = await db.execute(q)
    return list(result.scalars().all())


async def create_group(db: AsyncSession, data: GroupCreate) -> Group:
    group = Group(name=data.name)
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return group


async def update_group(db: AsyncSession, group_id: int, data: GroupUpdate) -> Group:
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise GroupNotFound()
    group.name = data.name
    await db.flush()
    await db.refresh(group)
    return group


async def delete_group(db: AsyncSession, group_id: int) -> None:
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise GroupNotFound()
    count_result = await db.execute(
        select(func.count()).where(Employee.group_id == group_id, Employee.deleted_at.is_(None))
    )
    if count_result.scalar() > 0:
        raise GroupHasStudents()
    await db.delete(group)
    await db.flush()
