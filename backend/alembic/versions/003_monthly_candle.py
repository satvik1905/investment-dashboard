"""add monthly candle columns to scanner_results

Revision ID: 003
Revises: 002
Create Date: 2026-04-05

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scanner_results",
        sa.Column("monthly_candle_color", sa.String(10), nullable=True),
    )
    op.add_column(
        "scanner_results",
        sa.Column("monthly_prior_candle_count", sa.Integer(), nullable=True),
    )
    op.create_index(
        "idx_scanner_monthly_candle",
        "scanner_results",
        ["scan_date", "monthly_candle_color"],
    )


def downgrade() -> None:
    op.drop_index("idx_scanner_monthly_candle", table_name="scanner_results")
    op.drop_column("scanner_results", "monthly_prior_candle_count")
    op.drop_column("scanner_results", "monthly_candle_color")
