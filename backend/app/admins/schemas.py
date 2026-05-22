from datetime import datetime

from pydantic import BaseModel, Field


class RoleShort(BaseModel):
    id: int
    name: str
    label: str

    model_config = {"from_attributes": True}


class AdminCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    fio: str = Field(min_length=1, max_length=256)
    role_id: int
    is_active: bool = True


class AdminUpdate(BaseModel):
    fio: str | None = Field(None, min_length=1, max_length=256)
    role_id: int | None = None
    is_active: bool | None = None


class AdminRead(BaseModel):
    id: int
    username: str
    fio: str
    role: RoleShort
    is_active: bool
    password_changed: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminCreateResponse(AdminRead):
    generated_password: str


class AdminListResponse(BaseModel):
    items: list[AdminRead]
    total: int
    page: int
    limit: int
    total_pages: int


class GeneratedPasswordResponse(BaseModel):
    generated_password: str
