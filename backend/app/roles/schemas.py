from datetime import datetime

from pydantic import BaseModel, Field


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-z_]+$")
    label: str = Field(min_length=1, max_length=128)
    description: str = ""
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    permissions: list[str] | None = None


class RoleRead(BaseModel):
    id: int
    name: str
    label: str
    description: str
    permissions: list[str]
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}
