from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import ta
from ..services import market_data, indicators as ind_service

router = APIRouter()


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
