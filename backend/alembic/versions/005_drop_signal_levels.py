"""drop auto-generated entry/target/stop levels from signals

Signals are driven by Danny Cheng candle color flips; the formula-based
levels didn't fit that system. Positions keep their own user-entered
stop_loss / target_price.

Revision ID: 005
Revises: 2c467f9dc8ee
Create Date: 2026-11-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "2c467f9dc8ee"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = ("entry_zone_low", "entry_zone_high", "target_price", "stop_loss")


def upgrade() -> None:
    for col in _COLUMNS:
        op.drop_column("signals", col)


def downgrade() -> None:
    for col in _COLUMNS:
        op.add_column("signals", sa.Column(col, sa.Numeric(10, 2), nullable=True))
