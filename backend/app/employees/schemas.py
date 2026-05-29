import re
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


def _normalize_phone(v: str) -> str:
    digits = re.sub(r"\D", "", v)
    if len(digits) == 11 and digits[0] in ("7", "8"):
        digits = "7" + digits[1:]
    if len(digits) != 11 or digits[0] != "7":
        raise ValueError("Номер телефона должен быть в формате +7XXXXXXXXXX")
    return "+" + digits


class EmployeeCreate(BaseModel):
    fio: str = Field(min_length=1, max_length=255)
    phone: str
    group_id: int
    birth_date: date
    notes: str = ""
    contacts: str = ""

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class EmployeeUpdate(BaseModel):
    fio: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    group_id: int | None = None
    birth_date: date | None = None
    notes: str | None = None
    contacts: str | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _normalize_phone(v)


class RoomAssign(BaseModel):
    room_id: int | None


class EmployeeRead(BaseModel):
    id: int
    fio: str
    phone: str
    group_id: int
    birth_date: date
    photo_url: str | None
    room_id: int | None
    notes: str
    contacts: str
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListResponse(BaseModel):
    items: list[EmployeeRead]
    total: int
    page: int
    limit: int
    total_pages: int


class StatementCreate(BaseModel):
    start_date: datetime
    end_date: datetime | None = None


class StatementRead(BaseModel):
    id: int
    employee_id: int
    start_date: datetime
    end_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class IllnessUpdate(BaseModel):
    temp_room_id: int | None = None


class IllnessNoteRead(BaseModel):
    id: int
    illness_id: int
    admin_id: int | None
    note: str
    date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class IllnessRead(BaseModel):
    id: int
    employee_id: int
    temp_room_id: int | None
    start_date: date
    end_date: date | None
    created_at: datetime
    notes: list[IllnessNoteRead] = []

    model_config = {"from_attributes": True}


class IllnessCreate(BaseModel):
    temp_room_id: int | None = None
    start_date: date
    first_note: str = ""


class IllnessNoteCreate(BaseModel):
    note: str = Field(min_length=1)
    date: date


class IllnessRecover(BaseModel):
    end_date: date
    final_note: str = ""


class HistoryEntry(BaseModel):
    id: int
    employee_id: int
    admin_id: int | None
    admin_fio: str | None = None
    action: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    changed_at: datetime

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    items: list[HistoryEntry]
