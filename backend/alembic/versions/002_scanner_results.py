"""add scanner_results table

Revision ID: 002
Revises: 001
Create Date: 2026-04-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scanner_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_date", sa.Date(), nullable=False),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column("company_name", sa.String(100), nullable=True),
        sa.Column("candle_type", sa.String(10), nullable=False),
        sa.Column("prior_candle_count", sa.Integer(), nullable=True),
        sa.Column("current_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("weekly_change_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("volume_ratio", sa.Numeric(6, 2), nullable=True),
        sa.Column("ema13", sa.Numeric(10, 2), nullable=True),
        sa.Column("ema34", sa.Numeric(10, 2), nullable=True),
        sa.Column("rsi", sa.Numeric(6, 2), nullable=True),
        sa.Column("macd_hist", sa.Numeric(10, 4), nullable=True),
        sa.Column("is_volume_spike", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_scanner_date", "scanner_results", ["scan_date"])
    op.create_index("idx_scanner_candle", "scanner_results", ["scan_date", "candle_type"])


def downgrade() -> None:
    op.drop_index("idx_scanner_candle", table_name="scanner_results")
    op.drop_index("idx_scanner_date", table_name="scanner_results")
    op.drop_table("scanner_results")
