from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date, datetime
from decimal import Decimal


# ── Signal Schemas ──────────────────────────────────────────────────────────

class SignalBase(BaseModel):
    ticker: str
    signal: str
    confidence: Optional[int] = None
    price_direction_3d: Optional[str] = None
    price_direction_7d: Optional[str] = None
    price_direction_14d: Optional[str] = None
    entry_zone_low: Optional[Decimal] = None
    entry_zone_high: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None
    key_reason: Optional[str] = None
    risk_factors: Optional[List[str]] = None
    summary: Optional[str] = None
    raw_indicators: Optional[Any] = None


class SignalCreate(SignalBase):
    pass


class SignalResponse(SignalBase):
    id: int
    generated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Position Schemas ─────────────────────────────────────────────────────────

class PositionCreate(BaseModel):
    ticker: str
    entry_price: Decimal
    entry_date: date
    quantity: int
    stop_loss: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    notes: Optional[str] = None


class PositionClose(BaseModel):
    exit_price: Decimal
    exit_reason: Optional[str] = None


class PositionResponse(BaseModel):
    id: int
    ticker: str
    entry_price: Decimal
    entry_date: date
    quantity: int
    stop_loss: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    notes: Optional[str] = None
    status: str
    exit_price: Optional[Decimal] = None
    exit_date: Optional[date] = None
    exit_reason: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Journal Schemas ───────────────────────────────────────────────────────────

class JournalResponse(BaseModel):
    id: int
    ticker: str
    direction: Optional[str] = None
    entry_price: Optional[Decimal] = None
    exit_price: Optional[Decimal] = None
    quantity: Optional[int] = None
    entry_date: Optional[date] = None
    exit_date: Optional[date] = None
    pnl: Optional[Decimal] = None
    pnl_percent: Optional[Decimal] = None
    hold_days: Optional[int] = None
    outcome: Optional[str] = None
    notes: Optional[str] = None
    signal_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JournalAnalytics(BaseModel):
    total_trades: int
    wins: int
    losses: int
    breakeven: int
    win_rate: float
    total_pnl: float
    avg_pnl_per_trade: float
    avg_hold_days: float
    best_trade: Optional[float] = None
    worst_trade: Optional[float] = None


# ── Dashboard Schema ──────────────────────────────────────────────────────────

class DashboardResponse(BaseModel):
    signals_today: List[SignalResponse]
    open_positions: List[PositionResponse]
    total_pnl: float
    win_rate: float
