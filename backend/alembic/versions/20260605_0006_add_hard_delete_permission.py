"""add employees:hard_delete permission to super_admin

Revision ID: 20260605_0006
Revises: 20260605_0005
Create Date: 2026-06-05
"""

from alembic import op

revision = "20260605_0006"
down_revision = "20260605_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем право только роли super_admin
    op.execute("""
        UPDATE roles
        SET permissions = permissions || '["employees:hard_delete"]'::jsonb
        WHERE name = 'super_admin'
          AND NOT (permissions @> '["employees:hard_delete"]'::jsonb)
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE roles
        SET permissions = (
            SELECT jsonb_agg(p)
            FROM jsonb_array_elements_text(permissions) AS p
            WHERE p != 'employees:hard_delete'
        )
        WHERE name = 'super_admin'
    """)
