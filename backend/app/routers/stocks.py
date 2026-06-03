import asyncio
import logging
import os
import shutil
import subprocess

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import yfinance as yf
import pandas as pd
import ta

from ..database import get_db
from ..models import Signal as SignalModel
from ..services import market_data, indicators as ind_service
from ..routers.news import _fetch_vix, _fetch_news_for_ticker

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Resolve claude CLI binary once at import time ─────────────────────────────

_CLAUDE_BIN: str | None = shutil.which("claude")


@router.get("/search")
def search_tickers(q: str = Query(..., min_length=1)):
    """Search for tickers by symbol or company name via Yahoo Finance."""
    try:
        results = yf.Search(q, max_results=8).quotes
        equities = [
            {"symbol": r["symbol"], "name": r.get("longname") or r.get("shortname", r["symbol"])}
            for r in results
            if r.get("quoteType") == "EQUITY" and "." not in r["symbol"]
        ]
        return equities[:8]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/quote")
def get_quote(ticker: str):
    """Current price and basic stock info."""
    try:
        return market_data.get_quote(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/chart")
def get_chart_data(
    ticker: str,
    period: str = Query("6mo", description="yfinance period: 1mo, 3mo, 6mo, 1y"),
    interval: str = Query("1d", description="yfinance interval: 1d, 1h, 5m"),
):
    """
    OHLCV data + time-series indicators for the chart page.
    Returns candles, SMA20/50/200, RSI series, volume_avg, support, resistance.
    """
    try:
        ticker = ticker.upper()
        df = market_data.get_ohlcv(ticker, period=period, interval=interval)
        close = df["close"]

        # ── Candles ────────────────────────────────────────────────────────
        dates = [
            dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
            for dt in df.index
        ]
        candles = [
            {
                "time": dates[i],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
            for i, (_, row) in enumerate(df.iterrows())
            if pd.notna(row["open"]) and pd.notna(row["close"])
        ]

        # ── Helper: series → [{time, value}] dropping NaN ──────────────────
        def to_series(s: pd.Series) -> list[dict]:
            out = []
            for dt, val in zip(dates, s):
                if not pd.isna(val):
                    out.append({"time": dt, "value": round(float(val), 4)})
            return out

        # ── SMA periods depend on timeframe ────────────────────────────────
        # Monthly = SMA 6/12/24 (≈ 6mo/1yr/2yr); Weekly = 10/20/50; Daily = 20/50/200
        if interval == "1mo":
            sma_periods = [6, 12, 24]
            vol_window  = 6
        elif interval == "1wk":
            sma_periods = [10, 20, 50]
            vol_window  = 10
        else:
            sma_periods = [20, 50, 200]
            vol_window  = 20

        sma_series = [
            to_series(ta.trend.SMAIndicator(close=close, window=p).sma_indicator())
            for p in sma_periods
        ]

        # ── RSI series ─────────────────────────────────────────────────────
        rsi = to_series(ta.momentum.RSIIndicator(close=close, window=14).rsi())

        # ── Volume average ──────────────────────────────────────────────────
        volume_avg = (
            float(df["volume"].rolling(vol_window).mean().iloc[-1])
            if len(df) >= vol_window else None
        )

        # ── Support / Resistance ────────────────────────────────────────────
        scalars = ind_service.compute_all(df)

        danny = ind_service.compute_danny_cheng(df)

        return {
            "candles":               candles,
            "sma_a":                 sma_series[0],
            "sma_b":                 sma_series[1],
            "sma_c":                 sma_series[2],
            "sma_labels":            [f"SMA {p}" for p in sma_periods],
            "rsi":                   rsi,
            "volume_avg":            volume_avg,
            "support":               scalars.get("support"),
            "resistance":            scalars.get("resistance"),
            "danny_colors":          danny["color_series"],
            "current_color":         danny["current_color"],
            "vol_holes":             danny["vol_holes"],
            "vol_hole_active":       danny["vol_hole_active"],
            "trend_sequence":        danny["trend_sequence"],
            "current_trend":         danny["current_trend"],
            "last_signal_color":     danny["last_signal_color"],
            "last_signal_date":      danny["last_signal_date"],
            "candles_since_signal":  danny["candles_since_signal"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Claude context read (on-demand only) ──────────────────────────────────────

def _vix_regime(value: float) -> str:
    if value < 18:
        return "calm"
    if value <= 25:
        return "elevated"
    return "fear"


def _build_context_prompt(ticker: str, signal_row, vix_data, headlines: list[str]) -> str:
    sig = signal_row
    sig_text = sig.signal if sig else "missing"
    conf_text = str(sig.confidence) if sig and sig.confidence is not None else "missing"
    reason_text = sig.key_reason if sig and sig.key_reason else "missing"

    if vix_data and vix_data.get("current") is not None:
        vix_val = vix_data["current"]
        vix_text = f"{vix_val} ({_vix_regime(vix_val)})"
    else:
        vix_text = "missing"

    headlines_text = "\n".join(f"- {h}" for h in headlines) if headlines else "none available"

    return (
        f"You are a neutral market narrator. Given these facts about {ticker}, "
        "write 2-3 sentences that connect them into a coherent situational read. "
        "Do NOT invent or restate any price, number, target, or confidence score. "
        "Do NOT give a buy, sell, or hold recommendation. "
        "Only describe how the provided facts relate to each other. "
        "If a fact is listed as missing, acknowledge it - do not fill it in.\n\n"
        f"Signal: {sig_text}\n"
        f"Confidence: {conf_text}\n"
        f"Key reason: {reason_text}\n"
        f"VIX: {vix_text}\n"
        f"Recent headlines:\n{headlines_text}"
    )


def _call_claude_cli(prompt: str) -> str | None:
    if not _CLAUDE_BIN:
        logger.warning("claude CLI binary not found — context unavailable")
        return None
    try:
        result = subprocess.run(
            [_CLAUDE_BIN, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if result.returncode != 0 or not result.stdout.strip():
            logger.warning("claude CLI returned rc=%d, stdout=%r", result.returncode, result.stdout[:200])
            return None
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        logger.warning("claude CLI timed out (20s)")
        return None
    except Exception as e:
        logger.error("claude CLI error: %s", e)
        return None


@router.post("/{ticker}/context")
async def get_context_read(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()

    # 1. Latest signal from DB
    signal_row = (
        db.query(SignalModel)
        .filter(SignalModel.ticker == ticker)
        .order_by(SignalModel.generated_at.desc())
        .first()
    )

    # 2. VIX + 3. News — fetch concurrently
    vix_data, news_raw = await asyncio.gather(
        asyncio.to_thread(_fetch_vix, "30d"),
        asyncio.to_thread(_fetch_news_for_ticker, ticker),
    )

    headlines: list[str] = []
    for item in (news_raw or [])[:5]:
        content = item.get("content", {})
        title = content.get("title", "") or item.get("title", "")
        if title:
            headlines.append(title)

    prompt = _build_context_prompt(ticker, signal_row, vix_data, headlines)
    context = await asyncio.to_thread(_call_claude_cli, prompt)

    return {"context": context}


# ── Claude chart analysis (on-demand only) ────────────────────────────────────

def _danny_for_timeframe(ticker: str, period: str, interval: str) -> dict | None:
    """Fetch OHLCV and run Danny Cheng for one timeframe. Returns None on failure."""
    try:
        df = market_data.get_ohlcv(ticker, period=period, interval=interval)
        if len(df) < 30:
            return None
        danny = ind_service.compute_danny_cheng(df)
        return {
            "color": danny["current_color"],
            "trend": danny["current_trend"],
            "candles_since": danny["candles_since_signal"],
        }
    except Exception as e:
        logger.warning("Danny %s/%s failed for %s: %s", period, interval, ticker, e)
        return None


def _fmt_danny(label: str, d: dict | None) -> str:
    if d is None:
        return f"  {label}: unavailable"
    return f"  {label}: {d['color']} ({d['trend']}), signal {d['candles_since']} candle(s) ago"


def _fmt_sma(label: str, above: bool | None) -> str:
    if above is None:
        return f"unavailable vs {label}"
    return f"{'above' if above else 'below'} {label}"


def _build_chart_analysis_prompt(
    ticker: str,
    daily_danny: dict | None,
    weekly_danny: dict | None,
    monthly_danny: dict | None,
    ind: dict | None,
    data_warnings: list[str] | None,
) -> str:
    # Data-integrity warning block
    if data_warnings:
        warn_block = (
            f"\nWARNING: This ticker's data may be incomplete or unreliable "
            f"({'; '.join(data_warnings)}). Note this in your narrative - "
            "do not narrate degraded data as a confident read.\n"
        )
    else:
        warn_block = ""

    # Danny Cheng lines
    danny_block = (
        "Danny Cheng candle state:\n"
        f"{_fmt_danny('Daily', daily_danny)}\n"
        f"{_fmt_danny('Weekly', weekly_danny)}\n"
        f"{_fmt_danny('Monthly', monthly_danny)}"
    )

    # Indicators block
    if ind:
        rsi_val = ind.get("rsi_14")
        rsi_text = f"{rsi_val:.1f} ({ind.get('rsi_signal', 'unknown')})" if rsi_val is not None else "unavailable"
        macd_text = ind.get("macd_crossover") or "unavailable"
        vr = ind.get("volume_ratio")
        vol_text = f"{vr:.1f}x avg ({ind.get('volume_signal', 'unknown')})" if vr is not None else "unavailable"
        obv_text = ind.get("obv_trend") or "unavailable"
        bb_text = ind.get("bb_signal") or "unavailable"
        stoch_text = ind.get("stoch_signal") or "unavailable"
        sma_text = ", ".join([
            _fmt_sma("SMA20", ind.get("above_sma20")),
            _fmt_sma("SMA50", ind.get("above_sma50")),
            _fmt_sma("SMA200", ind.get("above_sma200")),
        ])
        ind_block = (
            "Daily indicators:\n"
            f"  RSI(14): {rsi_text}\n"
            f"  MACD crossover: {macd_text}\n"
            f"  Volume: {vol_text}\n"
            f"  OBV trend: {obv_text}\n"
            f"  Bollinger: {bb_text}\n"
            f"  Stochastic: {stoch_text}\n"
            f"  Price vs SMAs: {sma_text}"
        )
    else:
        ind_block = "Daily indicators: unavailable"

    return (
        f"You are a neutral chart narrator for {ticker}. "
        "Write 2-4 sentences describing how the technical picture below fits together across timeframes. "
        "Rules you MUST follow:\n"
        "- Reference ONLY the metrics listed below. Do NOT invent any metric, indicator, or data point.\n"
        "- Describe OBV trend as a volume-flow direction indicator. "
        "NEVER call it \"whale accumulation\" or \"institutional buying\" - "
        "it is simply on-balance volume trending up or down.\n"
        "- Do NOT give a buy, sell, or hold recommendation.\n"
        "- Do NOT state or invent any price level, price target, entry point, or stop loss.\n"
        "- If a timeframe or metric is listed as \"unavailable\", say so - do not guess or fill it in.\n"
        f"{warn_block}\n"
        f"{danny_block}\n\n"
        f"{ind_block}"
    )


@router.post("/{ticker}/chart-analysis")
async def get_chart_analysis(ticker: str):
    ticker = ticker.upper()

    # Data-integrity check
    ticker_status = market_data.validate_ticker(ticker)
    data_warnings: list[str] | None = None
    if not ticker_status.is_valid or ticker_status.is_suspicious:
        data_warnings = ticker_status.warnings

    # Fetch daily + weekly + monthly concurrently
    daily_result, weekly_danny, monthly_danny = await asyncio.gather(
        asyncio.to_thread(lambda: _danny_daily_plus_indicators(ticker)),
        asyncio.to_thread(_danny_for_timeframe, ticker, "2y", "1wk"),
        asyncio.to_thread(_danny_for_timeframe, ticker, "5y", "1mo"),
    )

    daily_danny = daily_result[0]
    ind = daily_result[1]

    # If daily failed entirely, flag it
    if daily_danny is None and data_warnings is None:
        data_warnings = ["Daily OHLCV data unavailable"]

    prompt = _build_chart_analysis_prompt(
        ticker, daily_danny, weekly_danny, monthly_danny, ind, data_warnings,
    )
    analysis = await asyncio.to_thread(_call_claude_cli, prompt)

    return {"analysis": analysis}


# ── Claude setup review (on-demand, combines everything) ─────────────────────

def _build_setup_review_prompt(
    ticker: str,
    signal_row,
    daily_danny: dict | None,
    weekly_danny: dict | None,
    monthly_danny: dict | None,
    ind: dict | None,
    vix_data,
    headlines: list[str],
    data_warnings: list[str] | None,
) -> str:
    if data_warnings:
        warn_block = (
            f"\nWARNING: This ticker's data may be incomplete or unreliable "
            f"({'; '.join(data_warnings)}). Factor this uncertainty into your "
            "recommendation - do not present degraded data as a confident setup.\n"
        )
    else:
        warn_block = ""

    # Engine signal
    if signal_row:
        sig_text = f"{signal_row.signal} (confidence {signal_row.confidence}%)"
        reason_text = signal_row.key_reason or "none"
    else:
        sig_text = "none generated"
        reason_text = "none"

    # Danny block
    danny_block = (
        "Danny Cheng candle state:\n"
        f"{_fmt_danny('Daily', daily_danny)}\n"
        f"{_fmt_danny('Weekly', weekly_danny)}\n"
        f"{_fmt_danny('Monthly', monthly_danny)}"
    )

    # Indicators block
    if ind:
        rsi_val = ind.get("rsi_14")
        rsi_text = f"{rsi_val:.1f} ({ind.get('rsi_signal', 'unknown')})" if rsi_val is not None else "unavailable"
        macd_text = ind.get("macd_crossover") or "unavailable"
        vr = ind.get("volume_ratio")
        vol_text = f"{vr:.1f}x avg ({ind.get('volume_signal', 'unknown')})" if vr is not None else "unavailable"
        obv_text = ind.get("obv_trend") or "unavailable"
        bb_text = ind.get("bb_signal") or "unavailable"
        stoch_text = ind.get("stoch_signal") or "unavailable"
        sma_text = ", ".join([
            _fmt_sma("SMA20", ind.get("above_sma20")),
            _fmt_sma("SMA50", ind.get("above_sma50")),
            _fmt_sma("SMA200", ind.get("above_sma200")),
        ])
        ind_block = (
            "Daily indicators:\n"
            f"  RSI(14): {rsi_text}\n"
            f"  MACD crossover: {macd_text}\n"
            f"  Volume: {vol_text}\n"
            f"  OBV trend: {obv_text}\n"
            f"  Bollinger: {bb_text}\n"
            f"  Stochastic: {stoch_text}\n"
            f"  Price vs SMAs: {sma_text}"
        )
    else:
        ind_block = "Daily indicators: unavailable"

    # VIX
    if vix_data and vix_data.get("current") is not None:
        vix_val = vix_data["current"]
        vix_text = f"{vix_val} ({_vix_regime(vix_val)})"
    else:
        vix_text = "unavailable"

    # Headlines
    headlines_text = "\n".join(f"  - {h}" for h in headlines) if headlines else "  none available"

    return (
        f"You are SwingIQ, an expert swing trading analyst. Given ALL of the data below for {ticker}, provide:\n"
        "1. Your recommendation: BUY, SELL, or HOLD\n"
        "2. A 3-5 sentence rationale explaining why, connecting the technical setup, market environment, and any relevant news\n\n"
        "Rules:\n"
        "- Base your recommendation ONLY on the data provided below. Do NOT invent any metric or data point.\n"
        "- Describe OBV trend as a volume-flow direction indicator. "
        "NEVER call it \"whale accumulation\" or \"institutional buying.\"\n"
        "- Do NOT invent price targets, entry points, or stop losses - the engine computes those separately.\n"
        "- If data is marked \"unavailable\" or \"missing\", factor that uncertainty into your recommendation.\n"
        "- Be direct and opinionated. Take a clear stance - never say \"it could go either way.\"\n"
        "- Start your response with \"BUY:\", \"SELL:\", or \"HOLD:\" followed by your rationale.\n"
        f"{warn_block}\n"
        f"Engine signal: {sig_text}\n"
        f"Key reason: {reason_text}\n\n"
        f"{danny_block}\n\n"
        f"{ind_block}\n\n"
        f"Market environment:\n"
        f"  VIX: {vix_text}\n\n"
        f"Recent headlines:\n{headlines_text}"
    )


@router.post("/{ticker}/setup-review")
async def get_setup_review(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()

    # Data-integrity check
    ticker_status = market_data.validate_ticker(ticker)
    data_warnings: list[str] | None = None
    if not ticker_status.is_valid or ticker_status.is_suspicious:
        data_warnings = ticker_status.warnings

    # Latest signal from DB
    signal_row = (
        db.query(SignalModel)
        .filter(SignalModel.ticker == ticker)
        .order_by(SignalModel.generated_at.desc())
        .first()
    )

    # Fetch all data concurrently
    daily_result, weekly_danny, monthly_danny, vix_data, news_raw = await asyncio.gather(
        asyncio.to_thread(lambda: _danny_daily_plus_indicators(ticker)),
        asyncio.to_thread(_danny_for_timeframe, ticker, "2y", "1wk"),
        asyncio.to_thread(_danny_for_timeframe, ticker, "5y", "1mo"),
        asyncio.to_thread(_fetch_vix, "30d"),
        asyncio.to_thread(_fetch_news_for_ticker, ticker),
    )

    daily_danny = daily_result[0]
    ind = daily_result[1]

    if daily_danny is None and data_warnings is None:
        data_warnings = ["Daily OHLCV data unavailable"]

    headlines: list[str] = []
    for item in (news_raw or [])[:5]:
        content = item.get("content", {})
        title = content.get("title", "") or item.get("title", "")
        if title:
            headlines.append(title)

    prompt = _build_setup_review_prompt(
        ticker, signal_row, daily_danny, weekly_danny, monthly_danny,
        ind, vix_data, headlines, data_warnings,
    )
    review = await asyncio.to_thread(_call_claude_cli, prompt)

    return {"review": review}


def _danny_daily_plus_indicators(ticker: str) -> tuple[dict | None, dict | None]:
    """Fetch daily OHLCV once, run both Danny Cheng and compute_all."""
    try:
        df = market_data.get_ohlcv(ticker, period="6mo", interval="1d")
        if len(df) < 30:
            return None, None
        danny = ind_service.compute_danny_cheng(df)
        ind = ind_service.compute_all(df)
        daily_d = {
            "color": danny["current_color"],
            "trend": danny["current_trend"],
            "candles_since": danny["candles_since_signal"],
        }
        return daily_d, ind
    except Exception as e:
        logger.warning("Daily data failed for %s: %s", ticker, e)
        return None, None
