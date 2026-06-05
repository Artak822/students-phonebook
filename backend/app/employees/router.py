from fastapi import APIRouter, Depends, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.admins.models import Admin
from app.core.dependencies import get_db, require_permission
from app.core.s3 import delete_object, make_photo_key, stream_object, upload_object
from app.employees import schemas, service
from app.employees.photo import MAX_SIZE, process_image

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=schemas.EmployeeListResponse)
async def list_employees(
    search: str | None = None,
    group_id: int | None = None,
    building: int | None = None,
    room_id: int | None = None,
    sick: bool | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.list_employees(db, search=search, group_id=group_id, building=building, room_id=room_id, sick=sick, page=page, limit=limit)


@router.post("", response_model=schemas.EmployeeRead, status_code=201)
async def create_employee(
    data: schemas.EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    emp = await service.create_employee(db, data, admin.id)
    await db.commit()
    return emp


@router.get("/export")
async def export_employees(
    search: str | None = None,
    group_id: int | None = None,
    building: int | None = None,
    entrance: int | None = None,
    room_id: int | None = None,
    sick: bool | None = None,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:view")),
):
    from urllib.parse import quote
    from datetime import date

    buf = await service.export_employees_xlsx(
        db,
        search=search,
        group_id=group_id,
        building=building,
        entrance=entrance,
        room_id=room_id,
        sick=sick,
        exported_by_id=admin.id,
        exported_by_fio=admin.fio,
    )

    # Логируем факт скачивания в историю изменений
    await service.log_export(db, admin_id=admin.id)
    await db.commit()

    filename = f"students_{date.today().isoformat()}.xlsx"
    encoded = quote(filename)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.get("/{emp_id}", response_model=schemas.EmployeeRead)
async def get_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.get_employee(db, emp_id)


@router.patch("/{emp_id}", response_model=schemas.EmployeeRead)
async def update_employee(
    emp_id: int,
    data: schemas.EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    emp = await service.update_employee(db, emp_id, data, admin.id)
    await db.commit()
    return emp


@router.delete("/{emp_id}", status_code=204)
async def delete_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:delete")),
):
    await service.soft_delete(db, emp_id, admin.id)
    await db.commit()


@router.delete("/{emp_id}/hard", status_code=204)
async def hard_delete_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:hard_delete")),
):
    """Полное удаление ПДн субъекта (ст. 21 ФЗ-152). Действие необратимо. Только super_admin."""
    await service.hard_delete_and_anonymize(db, emp_id, admin.id)
    await db.commit()


@router.patch("/{emp_id}/room", response_model=schemas.EmployeeRead)
async def assign_room(
    emp_id: int,
    data: schemas.RoomAssign,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:assign_room")),
):
    emp = await service.assign_room(db, emp_id, data.room_id, admin.id)
    await db.commit()
    return emp


@router.get("/{emp_id}/roommates", response_model=list[schemas.EmployeeRead])
async def get_roommates(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.get_roommates(db, emp_id)


@router.get("/{emp_id}/history", response_model=schemas.HistoryResponse)
async def get_history(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    items = await service.get_history(db, emp_id)
    return {"items": items}


# --- Statement endpoints ---

@router.get("/{emp_id}/statements", response_model=list[schemas.StatementRead])
async def list_statements(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.list_statements(db, emp_id)


@router.post("/{emp_id}/statements", response_model=schemas.StatementRead, status_code=201)
async def create_statement(
    emp_id: int,
    data: schemas.StatementCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    stmt = await service.create_statement(db, emp_id, data)
    await db.commit()
    return stmt


@router.delete("/{emp_id}/statements/{stmt_id}", status_code=204)
async def delete_statement(
    emp_id: int,
    stmt_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    await service.delete_statement(db, emp_id, stmt_id)
    await db.commit()


# --- Photo endpoints ---

@router.get("/{emp_id}/photo")
async def get_photo(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    emp = await service.get_employee(db, emp_id)
    if not emp.photo_url:
        from app.core.errors import EmployeeNotFound
        raise EmployeeNotFound(message="У студента нет фото")

    # MinIO закрыт снаружи — стримим через бэкенд с проверкой прав.
    # Доступ контролируется через require_permission("employees:view").
    async def _iter():
        async for chunk in stream_object(emp.photo_url):
            yield chunk

    return StreamingResponse(
        _iter(),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post("/{emp_id}/photo", status_code=204)
async def upload_photo(
    emp_id: int,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    from app.core.errors import APIError as _APIError

    raw = await file.read()
    if len(raw) > MAX_SIZE:
        raise _APIError(message="Файл превышает 5 МБ")

    try:
        jpeg_data = process_image(raw)
    except ValueError as e:
        if "UNSUPPORTED_FORMAT" in str(e):
            raise _APIError(message="Неподдерживаемый формат. Сохраните изображение как JPEG, PNG или WebP")
        raise

    emp = await service.get_employee(db, emp_id)

    # Delete old photo
    if emp.photo_url:
        await delete_object(emp.photo_url)

    key = make_photo_key(emp_id)
    await upload_object(key, jpeg_data)

    emp.photo_url = key
    from datetime import datetime, timezone
    emp.updated_at = datetime.now(timezone.utc)
    await db.commit()


@router.delete("/{emp_id}/photo", status_code=204)
async def delete_photo(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    emp = await service.get_employee(db, emp_id)
    if emp.photo_url:
        await delete_object(emp.photo_url)
        emp.photo_url = None
        from datetime import datetime, timezone
        emp.updated_at = datetime.now(timezone.utc)
        await db.commit()


# ── Illness endpoints ─────────────────────────────────────────────────────────

@router.get("/{emp_id}/illnesses", response_model=list[schemas.IllnessRead])
async def list_illnesses(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:view")),
):
    return await service.list_illnesses(db, emp_id)


@router.patch("/{emp_id}/illnesses/{illness_id}", response_model=schemas.IllnessRead)
async def update_illness(
    emp_id: int,
    illness_id: int,
    data: schemas.IllnessUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    illness = await service.update_illness(db, emp_id, illness_id, data)
    await db.commit()
    return illness


@router.post("/{emp_id}/illnesses", response_model=schemas.IllnessRead, status_code=201)
async def create_illness(
    emp_id: int,
    data: schemas.IllnessCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    illness = await service.create_illness(db, emp_id, data, admin.id)
    await db.commit()
    return illness


@router.post("/{emp_id}/illnesses/{illness_id}/notes", response_model=schemas.IllnessNoteRead, status_code=201)
async def add_illness_note(
    emp_id: int,
    illness_id: int,
    data: schemas.IllnessNoteCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    note = await service.add_illness_note(db, emp_id, illness_id, data, admin.id)
    await db.commit()
    return note


@router.delete("/{emp_id}/illnesses/{illness_id}", status_code=204)
async def delete_illness(
    emp_id: int,
    illness_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permission("employees:edit")),
):
    await service.delete_illness(db, emp_id, illness_id)
    await db.commit()


@router.patch("/{emp_id}/illnesses/{illness_id}/recover", response_model=schemas.IllnessRead)
async def recover_illness(
    emp_id: int,
    illness_id: int,
    data: schemas.IllnessRecover,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(require_permission("employees:edit")),
):
    illness = await service.recover_illness(db, emp_id, illness_id, data, admin.id)
    await db.commit()
    return illness
