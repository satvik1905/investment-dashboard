from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Text, JSON, Boolean, ForeignKey
from sqlalchemy.sql import func
from .database import Base


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    signal = Column(String(20), nullable=False)  # STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
    confidence = Column(Integer)  # 0-100
    price_direction_3d = Column(String(10))   # UP, DOWN, NEUTRAL
    price_direction_7d = Column(String(10))
    price_direction_14d = Column(String(10))
    entry_zone_low = Column(Numeric(10, 2))
    entry_zone_high = Column(Numeric(10, 2))
    target_price = Column(Numeric(10, 2))
    stop_loss = Column(Numeric(10, 2))
    key_reason = Column(Text)
    risk_factors = Column(JSON)   # array of strings
    summary = Column(Text)        # plain English explanation
    raw_indicators = Column(JSON) # all indicator values
    generated_at = Column(DateTime(timezone=True), server_default=func.now())


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    entry_price = Column(Numeric(10, 2), nullable=False)
    entry_date = Column(Date, nullable=False)
    quantity = Column(Integer, nullable=False)
    stop_loss = Column(Numeric(10, 2))
    target_price = Column(Numeric(10, 2))
    notes = Column(Text)
    status = Column(String(10), default="OPEN")  # OPEN, CLOSED
    exit_price = Column(Numeric(10, 2))
    exit_date = Column(Date)
    exit_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Journal(Base):
    __tablename__ = "journal"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    direction = Column(String(10))  # LONG, SHORT
    entry_price = Column(Numeric(10, 2))
    exit_price = Column(Numeric(10, 2))
    quantity = Column(Integer)
    entry_date = Column(Date)
    exit_date = Column(Date)
    pnl = Column(Numeric(10, 2))
    pnl_percent = Column(Numeric(6, 2))
    hold_days = Column(Integer)
    outcome = Column(String(10))  # WIN, LOSS, BREAKEVEN
    notes = Column(Text)
    signal_id = Column(Integer, ForeignKey("signals.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ScannerResult(Base):
    __tablename__ = "scanner_results"

    id = Column(Integer, primary_key=True, index=True)
    scan_date = Column(Date, nullable=False, index=True)
    ticker = Column(String(10), nullable=False)
    company_name = Column(String(100))
    candle_type = Column(String(10), nullable=False)  # RED or YELLOW
    prior_candle_count = Column(Integer)              # how many cyan/blue candles before
    current_price = Column(Numeric(10, 2))
    weekly_change_pct = Column(Numeric(6, 2))
    volume_ratio = Column(Numeric(6, 2))
    ema13 = Column(Numeric(10, 2))
    ema34 = Column(Numeric(10, 2))
    rsi = Column(Numeric(6, 2))
    macd_hist = Column(Numeric(10, 4))
    is_volume_spike = Column(Boolean, default=False)  # volume_ratio > 1.5
    monthly_candle_color = Column(String(10))          # RED, YELLOW, or null
    monthly_prior_candle_count = Column(Integer)       # months in prior trend (legacy)
    monthly_months_since_flip = Column(Integer)        # 0 = this month, 1 = last month, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
