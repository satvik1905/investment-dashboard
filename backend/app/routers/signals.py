"""
Signal endpoints — pure math, zero AI calls.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from typing import List

from ..database import get_db
from ..models import Signal
from ..schemas import SignalResponse
from ..services import market_data, indicators
from ..services.indicators import (
    compute_confidence, generate_key_reason, generate_risk_factors, generate_summary,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pure-math signal generation ────────────────────────────────────────────────

def _momentum_dir(close, days: int, threshold: float) -> str:
    if len(close) <= days:
        return "NEUTRAL"
    price_now = float(close.iloc[-1])
    price_ago = float(close.iloc[-(days + 1)])
    if price_ago == 0:
        return "NEUTRAL"
    mom = (price_now - price_ago) / price_ago * 100
    if mom > threshold:
        return "UP"
    if mom < -threshold:
        return "DOWN"
    return "NEUTRAL"


def _generate_signal_math(df, ind: dict, danny: dict) -> dict:
    """
    Pure math signal generation.

    Signal:     Danny Cheng candle color → BUY / SELL / HOLD
    Entry:      ±2% band around current price (or None for HOLD)
    Target:     Nearest resistance (BUY) or support (SELL)
    Stop:       Support − 0.5×ATR (BUY) or resistance + 0.5×ATR (SELL)
    Directions: Rolling momentum at 3 / 7 / 14 trading-day lookbacks
    """
    close = df["close"]
    current_price = float(ind.get("current_price") or 0)
    if not current_price:
        raise ValueError("No current price available")

    # ── Signal from Danny Cheng color ──────────────────────────────────────
    danny_color = danny.get("current_color", "BLUE")
    if danny_color == "RED":
        signal = "BUY"
    elif danny_color == "YELLOW":
        signal = "SELL"
    else:  # BLUE (uptrend) or CYAN (downtrend) → HOLD
        signal = "HOLD"

    # ── Entry zone ──────────────────────────────────────────────────────────
    if signal == "BUY":
        entry_low  = round(current_price * 0.98, 2)
        entry_high = round(current_price * 1.00, 2)
    elif signal == "SELL":
        entry_low  = round(current_price * 1.00, 2)
        entry_high = round(current_price * 1.02, 2)
    else:
        entry_low = entry_high = None

    # ── Target ──────────────────────────────────────────────────────────────
    resistance = ind.get("resistance")
    support    = ind.get("support")

    if signal == "BUY" and resistance and float(resistance) > current_price:
        target = round(float(resistance), 2)
    elif signal == "SELL" and support and float(support) < current_price:
        target = round(float(support), 2)
    else:
        target = None

    # ── Stop loss ───────────────────────────────────────────────────────────
    atr = ind.get("atr_14")
    if signal == "BUY" and support and atr:
        stop = round(float(support) - 0.5 * float(atr), 2)
    elif signal == "SELL" and resistance and atr:
        stop = round(float(resistance) + 0.5 * float(atr), 2)
    else:
        stop = None

    # ── 3 / 7 / 14-day momentum directions ─────────────────────────────────
    dir_3d  = _momentum_dir(close,  3, 0.5)
    dir_7d  = _momentum_dir(close,  7, 1.0)
    dir_14d = _momentum_dir(close, 14, 2.0)

    confidence = compute_confidence(signal, ind, danny)
    key_reason = generate_key_reason(signal, ind, danny)
    risk_factors = generate_risk_factors(signal, ind, danny, current_price, target, stop)
    summary = generate_summary(
        signal, ind, danny, entry_low, entry_high, target, stop,
        confidence, risk_factors,
    )

    return {
        "signal":              signal,
        "confidence":          confidence,
        "price_direction_3d":  dir_3d,
        "price_direction_7d":  dir_7d,
        "price_direction_14d": dir_14d,
        "entry_zone_low":      entry_low,
        "entry_zone_high":     entry_high,
        "target_price":        target,
        "stop_loss":           stop,
        "key_reason":          key_reason,
        "risk_factors":        risk_factors,
        "summary":             summary,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/latest", response_model=List[SignalResponse])
def get_latest_signals(db: Session = Depends(get_db)):
    """Return the most recent signal for each ticker in the watchlist."""
    subq = (
        db.query(Signal.ticker, func.max(Signal.generated_at).label("max_at"))
        .group_by(Signal.ticker)
        .subquery()
    )
    signals = (
        db.query(Signal)
        .join(
            subq,
            (Signal.ticker == subq.c.ticker) & (Signal.generated_at == subq.c.max_at),
        )
        .order_by(Signal.generated_at.desc())
        .all()
    )
    return signals


@router.get("/{ticker}/history", response_model=List[SignalResponse])
def get_signal_history(ticker: str, db: Session = Depends(get_db)):
    """Return all past signals for a specific ticker."""
    return (
        db.query(Signal)
        .filter(Signal.ticker == ticker.upper())
        .order_by(Signal.generated_at.desc())
        .limit(50)
        .all()
    )


@router.post("/generate", response_model=SignalResponse)
def generate_signal(ticker: str, db: Session = Depends(get_db)):
    """Generate a pure-math signal for one ticker and upsert into the watchlist."""
    ticker = ticker.upper()

    # ── Ticker validation — reject dead tickers, warn on suspicious ──
    ticker_status = market_data.validate_ticker(ticker)
    if not ticker_status.is_valid:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Cannot generate signal for {ticker}",
                "warnings": ticker_status.warnings,
            },
        )

    try:
        # Use 6mo to match the daily chart's period — Danny Cheng is path-dependent
        # and needs enough history to reach the same state as what the chart shows.
        df    = market_data.get_ohlcv(ticker, period="6mo")
        ind   = indicators.compute_all(df)
        danny = indicators.compute_danny_cheng(df)

        # Attach Danny Cheng fields to raw_indicators for chart use
        ind["danny_current_color"]        = danny["current_color"]
        ind["danny_trend_sequence"]       = danny["trend_sequence"]
        ind["danny_vol_hole_active"]      = danny["vol_hole_active"]
        ind["danny_current_trend"]        = danny["current_trend"]
        ind["danny_last_signal_color"]    = danny["last_signal_color"]
        ind["danny_last_signal_date"]     = danny["last_signal_date"]
        ind["danny_candles_since_signal"] = danny["candles_since_signal"]

        # Attach data quality warnings if suspicious
        if ticker_status.is_suspicious:
            ind["data_warning"] = ticker_status.warnings

        signal_data = _generate_signal_math(df, ind, danny)
        now = datetime.now(timezone.utc)

        # Upsert: update today's existing row or insert new
        db_signal = (
            db.query(Signal)
            .filter(Signal.ticker == ticker)
            .filter(func.date(Signal.generated_at) == now.date())
            .first()
        )
        if db_signal:
            for field, val in signal_data.items():
                setattr(db_signal, field, val)
            db_signal.raw_indicators = ind
            db_signal.generated_at   = now
        else:
            db_signal = Signal(
                ticker=ticker,
                raw_indicators=ind,
                generated_at=now,
                **signal_data,
            )
            db.add(db_signal)

        db.commit()
        db.refresh(db_signal)
        return db_signal

    except Exception as e:
        logger.error("Signal generation failed for %s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{ticker}")
def delete_signal(ticker: str, db: Session = Depends(get_db)):
    """Delete all signals for a ticker (remove from watchlist)."""
    ticker = ticker.upper()
    deleted = db.query(Signal).filter(Signal.ticker == ticker).delete()
    db.commit()
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"No signal found for {ticker}")
    return Response(status_code=200)
