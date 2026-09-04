import json
import logging
import os
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta

import yfinance as yf
import pandas as pd
import redis as redis_lib

logger = logging.getLogger(__name__)


# ── Ticker validation ──────────────────────────────────────────────────────────

VALIDATION_CACHE_TTL = 6 * 3600  # 6 hours

# Thresholds
_DIVERGENCE_PCT = 0.25   # 25% — info.previousClose vs history[-1].close
                         # Tuned up from 10%: intraday moves can push history[-1]
                         # 10-15% past info.previousClose on volatile days.
                         # Renamed/merged tickers diverge by 50-100%+.
_FRESHNESS_DAYS = 7      # calendar days since last candle
_GAP_DAYS = 10           # calendar days gap in last 60 days of history


@dataclass
class TickerStatus:
    is_valid: bool
    is_suspicious: bool
    warnings: list[str]
    info_short_name: str | None
    last_candle_date: date | None
    last_history_close: float | None
    info_previous_close: float | None


def _validation_redis():
    try:
        r = redis_lib.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True,
        )
        r.ping()
        return r
    except Exception:
        return None


def validate_ticker(ticker: str) -> TickerStatus:
    """
    Run data-quality checks on a ticker before using it in the pipeline.
    Results are cached in Redis for 6 hours to avoid hammering yfinance info.
    """
    ticker = ticker.strip().upper()

    # ── Check cache ──
    r = _validation_redis()
    cache_key = f"ticker_validation:{ticker}"
    if r:
        cached = r.get(cache_key)
        if cached:
            d = json.loads(cached)
            # Deserialize last_candle_date back to date
            lcd = d.get("last_candle_date")
            d["last_candle_date"] = date.fromisoformat(lcd) if lcd else None
            return TickerStatus(**d)

    warnings: list[str] = []
    is_valid = True
    is_suspicious = False
    info_short_name: str | None = None
    info_previous_close: float | None = None
    last_candle_date: date | None = None
    last_history_close: float | None = None

    # ── Check 1: info fetch reachability ──
    info: dict = {}
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        pass

    if not info or info.get("trailingPegRatio") is None and info.get("shortName") is None:
        # Truly empty info — ticker is likely invalid
        is_valid = False
        warnings.append("Ticker info unavailable — may be delisted.")
        result = TickerStatus(
            is_valid=is_valid,
            is_suspicious=True,
            warnings=warnings,
            info_short_name=None,
            last_candle_date=None,
            last_history_close=None,
            info_previous_close=None,
        )
        _cache_validation(r, cache_key, result)
        return result

    info_short_name = info.get("shortName")
    info_previous_close = info.get("previousClose")
    if info_previous_close is not None:
        info_previous_close = float(info_previous_close)

    # ── Check 2: regularMarketPrice presence ──
    if info.get("regularMarketPrice") is None:
        is_suspicious = True
        warnings.append(
            "No regular market price — ticker may not be actively trading."
        )

    # ── Fetch short history for checks 3-5 ──
    hist = pd.DataFrame()
    try:
        hist = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
        if isinstance(hist.columns, pd.MultiIndex):
            hist.columns = [col[0] for col in hist.columns]
    except Exception:
        pass

    if hist.empty:
        is_suspicious = True
        warnings.append("No recent price history available.")
        result = TickerStatus(
            is_valid=is_valid,
            is_suspicious=is_suspicious,
            warnings=warnings,
            info_short_name=info_short_name,
            last_candle_date=None,
            last_history_close=None,
            info_previous_close=info_previous_close,
        )
        _cache_validation(r, cache_key, result)
        return result

    last_candle_dt = hist.index[-1]
    last_candle_date = last_candle_dt.date() if hasattr(last_candle_dt, "date") else last_candle_dt
    last_history_close = float(hist["Close"].iloc[-1])

    # ── Check 3: previousClose vs history divergence (THE KEY CHECK) ──
    if info_previous_close is not None and info_previous_close > 0:
        divergence = abs(last_history_close - info_previous_close) / info_previous_close
        if divergence > _DIVERGENCE_PCT:
            is_suspicious = True
            warnings.append(
                f"Price discrepancy detected: info reports ${info_previous_close:.2f}, "
                f"history shows ${last_history_close:.2f} — "
                f"ticker may have been renamed or merged."
            )

    # ── Check 4: history freshness ──
    today = date.today()
    days_since = (today - last_candle_date).days
    if days_since > _FRESHNESS_DAYS:
        is_suspicious = True
        warnings.append(f"Last price update was {days_since} days ago.")

    # ── Check 5: continuity — gaps in last 60 days ──
    cutoff = today - timedelta(days=60)
    recent = hist[hist.index >= pd.Timestamp(cutoff)]
    if len(recent) > 1:
        dates = sorted(recent.index)
        for i in range(1, len(dates)):
            gap = (dates[i] - dates[i - 1]).days
            if gap > _GAP_DAYS:
                gap_date = dates[i - 1].strftime("%Y-%m-%d")
                warnings.append(
                    f"Data continuity issue: {gap}-day gap detected around {gap_date}."
                )
                break  # report first gap only

    result = TickerStatus(
        is_valid=is_valid,
        is_suspicious=is_suspicious,
        warnings=warnings,
        info_short_name=info_short_name,
        last_candle_date=last_candle_date,
        last_history_close=last_history_close,
        info_previous_close=info_previous_close,
    )
    _cache_validation(r, cache_key, result)
    return result


def _cache_validation(r, cache_key: str, status: TickerStatus) -> None:
    if not r:
        return
    try:
        d = asdict(status)
        # date is not JSON-serializable
        lcd = d.get("last_candle_date")
        d["last_candle_date"] = lcd.isoformat() if lcd else None
        r.setex(cache_key, VALIDATION_CACHE_TTL, json.dumps(d))
    except Exception:
        pass


# ── Market data ────────────────────────────────────────────────────────────────

def get_ohlcv(ticker: str, period: str = "3mo", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV data via yfinance."""
    df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    # yfinance >= 1.x returns a MultiIndex (Price, Ticker) — flatten to single level
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0].lower() for col in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    df.index.name = "date"
    return df


def get_quote(ticker: str) -> dict:
    """
    Get current price, change %, and market status.
    Cached in Redis for 9 seconds to avoid hammering yfinance on every poll.
    """
    import json, os
    from zoneinfo import ZoneInfo
    from datetime import datetime
    import redis as redis_lib

    # ── Redis cache ────────────────────────────────────────────────────────────
    _redis = None
    cache_key = f"quote:{ticker}"
    try:
        _redis = redis_lib.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True
        )
        cached = _redis.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        _redis = None

    # ── Market status (US Eastern time) ───────────────────────────────────────
    et = ZoneInfo("America/New_York")
    now = datetime.now(et)
    hhmm = now.hour * 100 + now.minute   # e.g. 935, 1600
    weekday = now.weekday()               # 0=Mon … 6=Sun

    if weekday >= 5 or hhmm < 400:
        market_status = "CLOSED"
        price_label   = "Closed"
    elif hhmm < 930:
        market_status = "PRE_MARKET"
        price_label   = "Pre-Market"
    elif hhmm <= 1600:
        market_status = "OPEN"
        price_label   = "Live"
    else:
        market_status = "AFTER_HOURS"
        price_label   = "After Hours"

    # ── Fetch prices ───────────────────────────────────────────────────────────
    stock = yf.Ticker(ticker)
    current_price: float | None = None
    prev_close:    float | None = None

    # fast_info is lightweight (no heavy info dict call)
    try:
        fi = stock.fast_info
        prev_close    = float(fi.previous_close) if fi.previous_close else None
        current_price = float(fi.last_price)     if fi.last_price     else None
    except Exception:
        pass

    # During market hours, override with latest 1-minute bar for freshest price
    if market_status == "OPEN":
        try:
            m1 = stock.history(period="1d", interval="1m")
            if not m1.empty:
                current_price = float(m1["Close"].iloc[-1])
        except Exception:
            pass

    # Fallback: daily history
    if current_price is None or prev_close is None:
        try:
            hist = stock.history(period="5d", interval="1d")
            if not hist.empty:
                current_price = current_price or float(hist["Close"].iloc[-1])
                prev_close    = prev_close    or (float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current_price)
        except Exception:
            pass

    change     = round(current_price - prev_close, 4) if current_price and prev_close else 0.0
    change_pct = round(change / prev_close * 100, 2)  if prev_close else 0.0

    # ── Company name ─────────────────────────────────────────────────────────
    company_name: str | None = None
    try:
        company_name = stock.info.get("shortName") or stock.info.get("longName")
    except Exception:
        pass

    result = {
        "ticker":         ticker,
        "company_name":   company_name,
        "current_price":  round(current_price, 2) if current_price else None,
        "prev_close":     round(prev_close,    2) if prev_close    else None,
        "change":         round(change,        2),
        "change_pct":     change_pct,
        "market_status":  market_status,   # OPEN | PRE_MARKET | AFTER_HOURS | CLOSED
        "price_label":    price_label,
    }

    # Attach data quality warnings (uses cached validation — cheap)
    ticker_status = validate_ticker(ticker)
    if ticker_status.is_suspicious or not ticker_status.is_valid:
        result["data_warning"] = ticker_status.warnings

    # Cache 9 s (frontend polls every 10 s, so almost every hit is served from cache)
    if _redis:
        try:
            _redis.setex(cache_key, 9, json.dumps(result))
        except Exception:
            pass

    return result


def get_chart_data(ticker: str, period: str = "3mo", interval: str = "1d") -> list[dict]:
    """Return OHLCV list suitable for TradingView Lightweight Charts."""
    df = get_ohlcv(ticker, period=period, interval=interval)
    records = []
    for dt, row in df.iterrows():
        records.append({
            "time": dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10],
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["volume"]),
        })
    return records
