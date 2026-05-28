from sqlalchemy.ext.asyncio import AsyncSession

from app.employees.models import EmployeeChangeHistory

# Fields tracked in diff; photo_url excluded per spec
TRACKED_FIELDS = ("fio", "phone", "group_id", "birth_date", "room_id", "notes", "contacts")


async def record_create(db: AsyncSession, employee_id: int, admin_id: int) -> None:
    db.add(EmployeeChangeHistory(employee_id=employee_id, admin_id=admin_id, action="create"))


async def record_delete(db: AsyncSession, employee_id: int, admin_id: int) -> None:
    db.add(EmployeeChangeHistory(employee_id=employee_id, admin_id=admin_id, action="delete"))


async def record_update(
    db: AsyncSession,
    employee_id: int,
    admin_id: int,
    old_values: dict,
    new_values: dict,
) -> None:
    for field in TRACKED_FIELDS:
        if field not in new_values:
            continue
        old = old_values.get(field)
        new = new_values[field]
        if old != new:
            db.add(
                EmployeeChangeHistory(
                    employee_id=employee_id,
                    admin_id=admin_id,
                    action="update",
                    field_name=field,
                    old_value=str(old) if old is not None else None,
                    new_value=str(new) if new is not None else None,
                )
            )
