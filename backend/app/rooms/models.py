from sqlalchemy import CheckConstraint, Column, DateTime, Integer, UniqueConstraint, text

from app.database import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True)
    building = Column(Integer, nullable=False)
    entrance = Column(Integer, nullable=False)
    room_number = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        UniqueConstraint("building", "entrance", "room_number", name="uq_rooms_address"),
        CheckConstraint("building > 0", name="ck_rooms_building_positive"),
        CheckConstraint("entrance > 0", name="ck_rooms_entrance_positive"),
        CheckConstraint("room_number > 0", name="ck_rooms_room_number_positive"),
        CheckConstraint("capacity > 0", name="ck_rooms_capacity_positive"),
    )
