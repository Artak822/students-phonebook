"""add export action to employee_change_history

Revision ID: 20260605_0005
Revises: 20260526_0004_add_illnesses
Create Date: 2026-06-05
"""

from alembic import op

revision = "20260605_0005"
down_revision = "20260526_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE employee_change_history DROP CONSTRAINT IF EXISTS ck_ech_action")
    op.execute(
        "ALTER TABLE employee_change_history ADD CONSTRAINT ck_ech_action "
        "CHECK (action IN ('create', 'update', 'delete', 'export'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE employee_change_history DROP CONSTRAINT IF EXISTS ck_ech_action")
    op.execute(
        "ALTER TABLE employee_change_history ADD CONSTRAINT ck_ech_action "
        "CHECK (action IN ('create', 'update', 'delete'))"
    )
