from datetime import datetime

from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    building: int = Field(gt=0)
    entrance: int = Field(gt=0)
    room_number: int = Field(gt=0)
    capacity: int = Field(gt=0)


class RoomUpdate(BaseModel):
    building: int | None = Field(default=None, gt=0)
    entrance: int | None = Field(default=None, gt=0)
    room_number: int | None = Field(default=None, gt=0)
    capacity: int | None = Field(default=None, gt=0)


class RoomRead(BaseModel):
    id: int
    building: int
    entrance: int
    room_number: int
    capacity: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BulkCreateItem(BaseModel):
    room_number: int = Field(gt=0)
    capacity: int = Field(gt=0)


class BulkCreateRequest(BaseModel):
    building: int = Field(gt=0)
    entrance: int = Field(gt=0)
    items: list[BulkCreateItem] = Field(min_length=1)


class BulkCreateResult(BaseModel):
    created: int
    skipped: int
    skipped_numbers: list[int]
