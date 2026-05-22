from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)

from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True)
    fio = Column(Text, nullable=False)
    phone = Column(Text, nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="RESTRICT"), nullable=False)
    birth_date = Column(Date, nullable=False)
    photo_url = Column(Text)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="RESTRICT"))
    notes = Column(Text, nullable=False, server_default="")
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        CheckConstraint(r"phone ~ '^\+7\d{10}$'", name="ck_employees_phone_format"),
        CheckConstraint(
            "birth_date <= CURRENT_DATE AND birth_date >= CURRENT_DATE - INTERVAL '100 years'",
            name="ck_employees_birth_date_range",
        ),
        Index("idx_employees_room_id", "room_id", postgresql_where=text("deleted_at IS NULL")),
        Index("idx_employees_group_id", "group_id", postgresql_where=text("deleted_at IS NULL")),
        Index("idx_employees_fio", "fio", postgresql_where=text("deleted_at IS NULL")),
        Index("idx_employees_deleted_at", "deleted_at"),
    )


class EmployeeChangeHistory(Base):
    __tablename__ = "employee_change_history"

    id = Column(BigInteger, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    admin_id = Column(Integer, ForeignKey("admins.id", ondelete="SET NULL"))
    action = Column(Text, nullable=False)
    field_name = Column(Text)
    old_value = Column(Text)
    new_value = Column(Text)
    changed_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        CheckConstraint("action IN ('create', 'update', 'delete')", name="ck_ech_action"),
        Index("idx_ech_admin_id", "admin_id"),
    )
