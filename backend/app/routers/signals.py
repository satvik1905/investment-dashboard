"""
Signal endpoints — pure math, zero AI calls.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from typing import List

from ..auth import current_user_id
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

    # ── 3 / 7 / 14-day momentum directions ─────────────────────────────────
    dir_3d  = _momentum_dir(close,  3, 0.5)
    dir_7d  = _momentum_dir(close,  7, 1.0)
    dir_14d = _momentum_dir(close, 14, 2.0)

    confidence = compute_confidence(signal, ind, danny)
    key_reason = generate_key_reason(signal, ind, danny)
    risk_factors = generate_risk_factors(signal, ind, danny)
    summary = generate_summary(signal, ind, danny, confidence, risk_factors)

    return {
        "signal":              signal,
        "confidence":          confidence,
        "price_direction_3d":  dir_3d,
        "price_direction_7d":  dir_7d,
        "price_direction_14d": dir_14d,
        "key_reason":          key_reason,
        "risk_factors":        risk_factors,
        "summary":             summary,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/latest", response_model=List[SignalResponse])
def get_latest_signals(user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
    """Return the most recent signal for each ticker in the watchlist."""
    subq = (
        db.query(Signal.ticker, func.max(Signal.generated_at).label("max_at"))
        .filter(Signal.user_id == user_id)
        .group_by(Signal.ticker)
        .subquery()
    )
    signals = (
        db.query(Signal)
        .join(
            subq,
            (Signal.ticker == subq.c.ticker) & (Signal.generated_at == subq.c.max_at),
        )
        .filter(Signal.user_id == user_id)
        .order_by(Signal.generated_at.desc())
        .all()
    )
    return signals


@router.get("/{ticker}/history", response_model=List[SignalResponse])
def get_signal_history(ticker: str, user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
    """Return all past signals for a specific ticker."""
    return (
        db.query(Signal)
        .filter(Signal.user_id == user_id, Signal.ticker == ticker.upper())
        .order_by(Signal.generated_at.desc())
        .limit(50)
        .all()
    )


@router.post("/generate", response_model=SignalResponse)
def generate_signal(ticker: str, user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
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
        # Danny Cheng is path-dependent — run it on the shared lookback so the
        # signal matches what the chart shows.
        df, danny_df = market_data.get_ohlcv_with_danny_history(ticker, "6mo")
        ind   = indicators.compute_all(df)
        danny = indicators.compute_danny_cheng(danny_df)

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
            .filter(Signal.user_id == user_id, Signal.ticker == ticker)
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
                user_id=user_id,
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


@router.post("/refresh")
def refresh_signal(ticker: str, user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
    """
    Refresh a signal for the modal: generate fresh if validation passes,
    fall back to the stale DB row with warnings if it doesn't.
    Always returns 200 — the frontend reads `refreshed` to decide UI.
    """
    ticker = ticker.upper()
    ticker_status = market_data.validate_ticker(ticker)

    # ── Validation failed — return stale row + warnings ───────────────────
    if not ticker_status.is_valid:
        stale = (
            db.query(Signal)
            .filter(Signal.user_id == user_id, Signal.ticker == ticker)
            .order_by(Signal.generated_at.desc())
            .first()
        )
        return {
            "refreshed": False,
            "validation_warnings": ticker_status.warnings,
            "signal": SignalResponse.model_validate(stale).model_dump(mode="json") if stale else None,
        }

    # ── Validation passed — generate fresh ────────────────────────────────
    try:
        df, danny_df = market_data.get_ohlcv_with_danny_history(ticker, "6mo")
        ind   = indicators.compute_all(df)
        danny = indicators.compute_danny_cheng(danny_df)

        ind["danny_current_color"]        = danny["current_color"]
        ind["danny_trend_sequence"]       = danny["trend_sequence"]
        ind["danny_vol_hole_active"]      = danny["vol_hole_active"]
        ind["danny_current_trend"]        = danny["current_trend"]
        ind["danny_last_signal_color"]    = danny["last_signal_color"]
        ind["danny_last_signal_date"]     = danny["last_signal_date"]
        ind["danny_candles_since_signal"] = danny["candles_since_signal"]

        if ticker_status.is_suspicious:
            ind["data_warning"] = ticker_status.warnings

        signal_data = _generate_signal_math(df, ind, danny)
        now = datetime.now(timezone.utc)

        db_signal = (
            db.query(Signal)
            .filter(Signal.user_id == user_id, Signal.ticker == ticker)
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
                user_id=user_id,
                ticker=ticker,
                raw_indicators=ind,
                generated_at=now,
                **signal_data,
            )
            db.add(db_signal)

        db.commit()
        db.refresh(db_signal)

        return {
            "refreshed": True,
            "validation_warnings": ticker_status.warnings if ticker_status.is_suspicious else None,
            "signal": SignalResponse.model_validate(db_signal).model_dump(mode="json"),
        }

    except Exception as e:
        logger.error("Signal refresh failed for %s: %s", ticker, e, exc_info=True)
        stale = (
            db.query(Signal)
            .filter(Signal.user_id == user_id, Signal.ticker == ticker)
            .order_by(Signal.generated_at.desc())
            .first()
        )
        return {
            "refreshed": False,
            "validation_warnings": [f"Refresh failed: {e}"],
            "signal": SignalResponse.model_validate(stale).model_dump(mode="json") if stale else None,
        }


@router.delete("/{ticker}")
def delete_signal(ticker: str, user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
    """Delete all signals for a ticker (remove from watchlist)."""
    ticker = ticker.upper()
    deleted = db.query(Signal).filter(Signal.user_id == user_id, Signal.ticker == ticker).delete()
    db.commit()
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"No signal found for {ticker}")
    return Response(status_code=200)
