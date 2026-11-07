"""scope signals, positions and journal to a user

Each row gets the Supabase user id (JWT `sub`) of its owner. Rows that
existed before this migration keep user_id NULL and are assigned to the
admin (ADMIN_EMAIL) on their first authenticated request — see
app/auth.py:_claim_orphans.

Revision ID: 006
Revises: 005
Create Date: 2026-11-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("signals", "positions", "journal")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("user_id", sa.String(64), nullable=True))
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_column(table, "user_id")
