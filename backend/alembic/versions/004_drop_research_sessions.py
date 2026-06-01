"""drop research_sessions table — AI scaffolding removed

Revision ID: 004
Revises: 003
Create Date: 2026-05-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_research_sessions_session_date", table_name="research_sessions")
    op.drop_index("ix_research_sessions_id", table_name="research_sessions")
    op.drop_table("research_sessions")


def downgrade() -> None:
    op.create_table(
        "research_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("candidates_found", sa.Integer()),
        sa.Column("top_picks", sa.JSON()),
        sa.Column("market_summary", sa.Text()),
        sa.Column("raw_response", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_research_sessions_id", "research_sessions", ["id"])
    op.create_index(
        "ix_research_sessions_session_date", "research_sessions", ["session_date"]
    )
