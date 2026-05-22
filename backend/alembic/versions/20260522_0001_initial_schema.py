"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # roles
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("permissions", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )
    op.create_index("idx_roles_name", "roles", ["name"])

    # admins
    op.create_table(
        "admins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.Text, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("fio", sa.Text, nullable=False),
        sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("password_changed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("username", name="uq_admins_username"),
    )
    op.create_index("idx_admins_username", "admins", ["username"])
    op.create_index("idx_admins_role_id", "admins", ["role_id"])

    # rooms
    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("building", sa.Integer, nullable=False),
        sa.Column("entrance", sa.Integer, nullable=False),
        sa.Column("room_number", sa.Integer, nullable=False),
        sa.Column("capacity", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("building", "entrance", "room_number", name="uq_rooms_address"),
        sa.CheckConstraint("building > 0", name="ck_rooms_building_positive"),
        sa.CheckConstraint("entrance > 0", name="ck_rooms_entrance_positive"),
        sa.CheckConstraint("room_number > 0", name="ck_rooms_room_number_positive"),
        sa.CheckConstraint("capacity > 0", name="ck_rooms_capacity_positive"),
    )

    # groups
    op.create_table(
        "groups",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("name", name="uq_groups_name"),
    )
    op.create_index("idx_groups_name", "groups", ["name"])

    # employees
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("fio", sa.Text, nullable=False),
        sa.Column("phone", sa.Text, nullable=False),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("groups.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("birth_date", sa.Date, nullable=False),
        sa.Column("photo_url", sa.Text),
        sa.Column("room_id", sa.Integer, sa.ForeignKey("rooms.id", ondelete="RESTRICT")),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint(r"phone ~ '^\+7\d{10}$'", name="ck_employees_phone_format"),
        sa.CheckConstraint(
            "birth_date <= CURRENT_DATE AND birth_date >= CURRENT_DATE - INTERVAL '100 years'",
            name="ck_employees_birth_date_range",
        ),
    )
    op.create_index(
        "idx_employees_room_id", "employees", ["room_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_employees_group_id", "employees", ["group_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_employees_fio", "employees", ["fio"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("idx_employees_deleted_at", "employees", ["deleted_at"])

    # employee_change_history
    op.create_table(
        "employee_change_history",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("employee_id", sa.Integer, sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("admin_id", sa.Integer, sa.ForeignKey("admins.id", ondelete="SET NULL")),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("field_name", sa.Text),
        sa.Column("old_value", sa.Text),
        sa.Column("new_value", sa.Text),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("action IN ('create', 'update', 'delete')", name="ck_ech_action"),
    )
    op.execute(
        "CREATE INDEX idx_ech_employee_id ON employee_change_history (employee_id, changed_at DESC)"
    )
    op.create_index("idx_ech_admin_id", "employee_change_history", ["admin_id"])

    # audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("event", sa.Text, nullable=False),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("admins.id", ondelete="SET NULL")),
        sa.Column("actor_username", sa.Text),
        sa.Column("target_type", sa.Text),
        sa.Column("target_id", sa.Integer),
        sa.Column("ip", sa.Text),
        sa.Column("request_id", sa.Text),
        sa.Column("details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.execute("CREATE INDEX idx_audit_log_actor_ts ON audit_log (actor_id, timestamp DESC)")
    op.execute("CREATE INDEX idx_audit_log_ts ON audit_log (timestamp DESC)")
    op.create_index("idx_audit_log_event", "audit_log", ["event"])

    # Seed системных ролей
    op.execute("""
        INSERT INTO roles (name, label, description, permissions, is_system) VALUES
        (
            'super_admin',
            'Суперадминистратор',
            'Полные права во всей системе',
            '["employees:view","employees:edit","employees:delete","employees:assign_room","rooms:view","rooms:manage","admins:manage","roles:manage","history:view"]'::jsonb,
            TRUE
        ),
        (
            'tutor',
            'Воспитатель',
            'Работает со студентами и просматривает комнаты',
            '["employees:view","employees:edit","employees:assign_room","rooms:view","history:view"]'::jsonb,
            TRUE
        ),
        (
            'placement',
            'Сотрудник размещения',
            'Управляет комнатами и заселением',
            '["employees:view","employees:assign_room","rooms:view","rooms:manage","history:view"]'::jsonb,
            TRUE
        )
    """)


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("employee_change_history")
    op.drop_table("employees")
    op.drop_table("groups")
    op.drop_table("rooms")
    op.drop_table("admins")
    op.drop_table("roles")
