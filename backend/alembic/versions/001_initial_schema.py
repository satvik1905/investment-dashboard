"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-27

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "signals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column("signal", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("price_direction_3d", sa.String(10), nullable=True),
        sa.Column("price_direction_7d", sa.String(10), nullable=True),
        sa.Column("price_direction_14d", sa.String(10), nullable=True),
        sa.Column("entry_zone_low", sa.Numeric(10, 2), nullable=True),
        sa.Column("entry_zone_high", sa.Numeric(10, 2), nullable=True),
        sa.Column("target_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("stop_loss", sa.Numeric(10, 2), nullable=True),
        sa.Column("key_reason", sa.Text(), nullable=True),
        sa.Column("risk_factors", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("raw_indicators", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signals_id", "signals", ["id"])
    op.create_index("ix_signals_ticker", "signals", ["ticker"])

    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column("entry_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("stop_loss", sa.Numeric(10, 2), nullable=True),
        sa.Column("target_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(10), nullable=True),
        sa.Column("exit_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("exit_date", sa.Date(), nullable=True),
        sa.Column("exit_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_positions_id", "positions", ["id"])
    op.create_index("ix_positions_ticker", "positions", ["ticker"])

    op.create_table(
        "journal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column("direction", sa.String(10), nullable=True),
        sa.Column("entry_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("exit_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("entry_date", sa.Date(), nullable=True),
        sa.Column("exit_date", sa.Date(), nullable=True),
        sa.Column("pnl", sa.Numeric(10, 2), nullable=True),
        sa.Column("pnl_percent", sa.Numeric(6, 2), nullable=True),
        sa.Column("hold_days", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(10), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("signal_id", sa.Integer(), sa.ForeignKey("signals.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_id", "journal", ["id"])
    op.create_index("ix_journal_ticker", "journal", ["ticker"])

    op.create_table(
        "research_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("candidates_found", sa.Integer(), nullable=True),
        sa.Column("top_picks", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("market_summary", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_sessions_id", "research_sessions", ["id"])
    op.create_index("ix_research_sessions_session_date", "research_sessions", ["session_date"])


def downgrade() -> None:
    op.drop_table("research_sessions")
    op.drop_table("journal")
    op.drop_table("positions")
    op.drop_table("signals")
