"""add illnesses

Revision ID: 20260526_0004
Revises: 20260526_0003
Create Date: 2026-05-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260526_0004"
down_revision: Union[str, None] = "20260526_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employee_illnesses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "temp_room_id",
            sa.Integer(),
            sa.ForeignKey("rooms.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_illnesses_employee_id", "employee_illnesses", ["employee_id"])
    op.create_index("idx_illnesses_end_date", "employee_illnesses", ["end_date"])

    op.create_table(
        "illness_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "illness_id",
            sa.Integer(),
            sa.ForeignKey("employee_illnesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_id",
            sa.Integer(),
            sa.ForeignKey("admins.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_illness_notes_illness_id", "illness_notes", ["illness_id"])


def downgrade() -> None:
    op.drop_index("idx_illness_notes_illness_id", table_name="illness_notes")
    op.drop_table("illness_notes")
    op.drop_index("idx_illnesses_end_date", table_name="employee_illnesses")
    op.drop_index("idx_illnesses_employee_id", table_name="employee_illnesses")
    op.drop_table("employee_illnesses")
