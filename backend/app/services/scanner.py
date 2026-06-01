"""
Danny Cheng Weekly Candle Scanner
"""

import logging
from typing import Callable, Optional

import pandas as pd
import yfinance as yf
import ta.trend as ta_trend
import ta.momentum as ta_momentum
from ta.trend import MACD as TaMACD

logger = logging.getLogger(__name__)

# ── Ticker Universe ────────────────────────────────────────────────────────────

# Extra tickers outside S&P 500 / NASDAQ 100 worth scanning:
# crypto miners, high-beta growth, and any personal watchlist additions.
EXTRA_TICKERS = [
    # Crypto miners / blockchain
    "CIFR", "MARA", "RIOT", "CLSK", "HUT", "BTBT", "IREN", "CORZ",
    # High-volatility growth / meme adjacent
    "COIN", "HOOD", "SOFI", "OPEN", "RKLB", "LUNR",
]

NDX_TICKERS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META",
    "GOOGL", "GOOG", "TSLA", "AVGO", "COST",
    "NFLX", "AMD", "ADBE", "QCOM", "INTC",
    "INTU", "AMAT", "MU", "LRCX", "PANW",
    "KLAC", "MRVL", "CDNS", "SNPS", "FTNT",
    "CRWD", "ORLY", "ABNB", "MELI", "DXCM",
    "ASML", "TEAM", "NXPI", "WDAY", "MNST",
    "CTAS", "PYPL", "ADP", "BKNG", "REGN",
    "VRTX", "GILD", "ISRG", "MDLZ", "ADI",
    "LULU", "PCAR", "ROST", "MRNA", "KDP",
    "GEHC", "ON", "FANG", "ODFL", "EXC",
    "CTSH", "IDXX", "BIIB", "ILMN", "ALGN",
    "DDOG", "ZS", "ANSS", "ENPH",
    "ZM", "LCID", "MTCH", "VRSK",
]

# Hardcoded fallback used when Wikipedia is unreachable.
# Covers most S&P 500 large/mid caps.
FALLBACK_SP500 = [
    "MMM", "AOS", "ABT", "ABBV", "ACN", "ADBE", "AMD", "AES", "AFL", "A",
    "APD", "AKAM", "ALB", "ARE", "ALGN", "ALLE", "LNT", "ALL", "GOOGL", "GOOG",
    "MO", "AMZN", "AMCR", "AEE", "AAL", "AEP", "AXP", "AIG", "AMT", "AWK",
    "AMP", "AME", "AMGN", "APH", "ADI", "ANSS", "AON", "APA", "AAPL", "AMAT",
    "APTV", "ACGL", "ADM", "ANET", "AJG", "AIZ", "T", "ATO", "ADSK", "ADP",
    "AVB", "AVY", "AXON", "BKR", "BALL", "BAC", "BK", "BBWI", "BAX", "BDX",
    "BRK-B", "BBY", "BIO", "TECH", "BIIB", "BLK", "BX", "BA", "BCR", "BSX",
    "BMY", "AVGO", "BR", "BRO", "BF-B", "BLDR", "BG", "CDNS", "CZR", "CPT",
    "CPB", "COF", "CAH", "KMX", "CCL", "CARR", "CTLT", "CAT", "CBOE", "CBRE",
    "CDW", "CE", "COR", "CNC", "CNX", "CDAY", "CF", "CRL", "SCHW", "CHTR",
    "CVX", "CMG", "CB", "CHD", "CI", "CINF", "CTAS", "CSCO", "C", "CFG",
    "CLX", "CME", "CMS", "KO", "CTSH", "CL", "CMCSA", "CMA", "CAG", "COP",
    "ED", "STZ", "CEG", "COO", "CPRT", "GLW", "CPAY", "CTVA", "CSGP", "COST",
    "CTRA", "CCI", "CSX", "CMI", "CVS", "DHR", "DRI", "DVA", "DAY", "DE",
    "DAL", "XRAY", "DVN", "DXCM", "FANG", "DLR", "DFS", "DG", "DLTR", "D",
    "DPZ", "DOV", "DOW", "DHI", "DTE", "DUK", "DD", "EMN", "ETN", "EBAY",
    "ECL", "EIX", "EW", "EA", "ELV", "LLY", "EMR", "ENPH", "ETR", "EOG",
    "EPAM", "EQT", "EFX", "EQIX", "EQR", "ESS", "EL", "ETSY", "EG", "EVRG",
    "ES", "EXC", "EXPE", "EXPD", "EXR", "XOM", "FFIV", "FDS", "FICO", "FAST",
    "FRT", "FDX", "FIS", "FITB", "FSLR", "FE", "FI", "FLT", "FMC", "F",
    "FTNT", "FTV", "FOXA", "FOX", "BEN", "FCX", "GRMN", "IT", "GE", "GEHC",
    "GEN", "GNRC", "GD", "GIS", "GM", "GPC", "GILD", "GPN", "GL", "GS",
    "HAL", "HIG", "HAS", "HCA", "DOC", "HSIC", "HSY", "HES", "HPE", "HLT",
    "HOLX", "HD", "HON", "HRL", "HST", "HWM", "HPQ", "HUBB", "HUM", "HBAN",
    "HII", "IBM", "IEX", "IDXX", "ITW", "ILMN", "INCY", "IR", "PODD", "INTC",
    "ICE", "IFF", "IP", "IPG", "INTU", "ISRG", "IVZ", "INVH", "IQV", "IRM",
    "JBHT", "JBL", "JKHY", "J", "JNJ", "JCI", "JPM", "JNPR", "K", "KVUE",
    "KDP", "KEY", "KEYS", "KMB", "KIM", "KMI", "KLAC", "KHC", "KR", "LHX",
    "LH", "LRCX", "LW", "LVS", "LDOS", "LEN", "LNC", "LIN", "LYV", "LKQ",
    "LMT", "L", "LOW", "LULU", "LYB", "MTB", "MRO", "MPC", "MKTX", "MAR",
    "MMC", "MLM", "MAS", "MA", "MTCH", "MKC", "MCD", "MCK", "MDT", "MRK",
    "META", "MET", "MTD", "MGM", "MCHP", "MU", "MSFT", "MAA", "MRNA", "MHK",
    "MOH", "TAP", "MDLZ", "MPWR", "MNST", "MCO", "MS", "MOS", "MSI", "MSCI",
    "NDAQ", "NTAP", "NFLX", "NEM", "NWSA", "NWS", "NEE", "NKE", "NI", "NDSN",
    "NSC", "NTRS", "NOC", "NCLH", "NRG", "NUE", "NVDA", "NVR", "NXPI", "ORLY",
    "OXY", "ODFL", "OMC", "ON", "OKE", "ORCL", "OTIS", "PCAR", "PKG", "PANW",
    "PARA", "PH", "PAYX", "PAYC", "PYPL", "PNR", "PEP", "PFE", "PCG", "PM",
    "PSX", "PNW", "PNC", "POOL", "PPG", "PPL", "PFG", "PG", "PGR", "PLD",
    "PRU", "PEG", "PTC", "PSA", "PHM", "QRVO", "QCOM", "PWR", "DGX", "RL",
    "RJF", "RTX", "O", "REG", "REGN", "RF", "RSG", "RMD", "RVTY", "ROK",
    "ROL", "ROP", "ROST", "RCL", "SPGI", "CRM", "SBAC", "SLB", "STX", "SRE",
    "NOW", "SHW", "SPG", "SWKS", "SJM", "SW", "SNA", "SOLV", "SO", "LUV",
    "SWK", "SBUX", "STT", "STLD", "STE", "SYK", "SMCI", "SYF", "SNPS", "SYY",
    "TMUS", "TROW", "TTWO", "TPR", "TRGP", "TGT", "TEL", "TDY", "TFX", "TER",
    "TSLA", "TXN", "TXT", "TMO", "TJX", "TSCO", "TT", "TDG", "TRV", "TRMB",
    "TFC", "TYL", "TSN", "USB", "UBER", "UDR", "ULTA", "UNP", "UAL", "UPS",
    "URI", "UNH", "UHS", "VLO", "VTR", "VLTO", "VRSN", "VRSK", "VZ", "VRTX",
    "VTRS", "VICI", "V", "VST", "VMC", "WRB", "WAB", "WBA", "WMT", "DIS",
    "WBD", "WM", "WAT", "WEC", "WFC", "WELL", "WST", "WDC", "WY", "WHR",
    "WMB", "WTW", "WYNN", "XEL", "XYL", "YUM", "ZBRA", "ZBH", "ZTS",
]


def get_sp500_tickers() -> list[str]:
    try:
        sp500 = pd.read_html(
            "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
            attrs={"id": "constituents"},
        )[0]
        tickers = sp500["Symbol"].tolist()
        tickers = [t.replace(".", "-") for t in tickers]
        logger.info(f"[Scanner] Fetched {len(tickers)} S&P 500 tickers from Wikipedia")
        return tickers
    except Exception as e:
        logger.warning(f"[Scanner] Wikipedia fetch failed: {e} — using hardcoded fallback")
        return FALLBACK_SP500


def get_all_tickers() -> list[str]:
    sp500 = get_sp500_tickers()
    combined = list(set(sp500 + NDX_TICKERS + EXTRA_TICKERS))
    logger.info(f"[Scanner] Total unique tickers: {len(combined)}")
    return combined


# ── Danny Cheng helpers ───────────────────────────────────────────────────────

def _dc_prior_count(color_series: list[str], current_color: str) -> int:
    """
    Count how many consecutive prior-trend candles preceded the current signal.
    For a RED candle: count consecutive CYAN candles immediately before it.
    For a YELLOW candle: count consecutive BLUE candles immediately before it.
    """
    prior_color = "CYAN" if current_color == "RED" else "BLUE"
    count = 0
    for c in reversed(color_series[:-1]):
        if c == prior_color:
            count += 1
        else:
            break
    return count


def _run_dc_on_df(df_upper: pd.DataFrame) -> tuple[str, list[str], int, list[str]]:
    """
    Run compute_danny_cheng (same algorithm as the chart) on a DataFrame with
    uppercase columns (Close/Open/High/Low/Volume).
    Returns (current_color, color_list, prior_candle_count, date_list).
    """
    from .indicators import compute_danny_cheng
    df_lc = df_upper.rename(columns=str.lower)
    danny = compute_danny_cheng(df_lc)
    current_color = danny["current_color"]
    colors = [e["color"] for e in danny["color_series"]]
    dates = [e["time"] for e in danny["color_series"]]
    prior = _dc_prior_count(colors, current_color) if current_color in ("RED", "YELLOW") else len(colors)
    return current_color, colors, prior, dates


# ── Monthly candle analysis (standalone, no display fields) ───────────────────

def _check_monthly_candle(monthly_df: pd.DataFrame) -> tuple[Optional[str], Optional[int]]:
    """
    Run Danny Cheng (same algo as chart) on monthly OHLCV.
    Returns (candle_color, months_since_flip) or (None, None) if no crossover.
    months_since_flip: 0 = flipped this month, 2 = two months ago.
    Filters out flips older than 3 months and stale data (last bar > 45 days old).
    """
    from datetime import date as _date

    df = monthly_df.dropna(subset=["Close"])
    if len(df) < 40:
        return None, None
    if float(df["Close"].iloc[-1]) < 1.0:
        return None, None

    current_color, colors, prior, dates = _run_dc_on_df(df)

    if current_color not in ("RED", "YELLOW"):
        return None, None
    if prior < 2:
        return None, None

    # Find the most recent RED/YELLOW signal candle
    signal_idx = None
    for i in range(len(colors) - 1, -1, -1):
        if colors[i] in ("RED", "YELLOW"):
            signal_idx = i
            break
    if signal_idx is None:
        return None, None

    months_since_flip = len(colors) - 1 - signal_idx

    # Staleness guard: if the last monthly bar is >45 days old, the data
    # itself is stale — "this month" would be misleading.
    last_bar_date = df.index[-1]
    if hasattr(last_bar_date, "date"):
        last_bar_date = last_bar_date.date()
    if (_date.today() - last_bar_date).days > 45:
        return None, None

    # Recency filter: only keep flips ≤3 months old
    if months_since_flip > 3:
        return None, None

    return current_color, months_since_flip


# ── Single-ticker analysis ─────────────────────────────────────────────────────

def _analyze_ticker(
    ticker: str,
    weekly_df: pd.DataFrame,
    monthly_df: Optional[pd.DataFrame] = None,
) -> Optional[dict]:
    """
    Run the Danny Cheng pipeline (same algorithm as the chart) on weekly OHLCV,
    plus an optional monthly check. Uses compute_danny_cheng from indicators.py
    so scanner and chart always agree on candle colors.
    A ticker is included if it has a weekly RED/YELLOW crossover OR a monthly one.
    candle_type = "NONE" when only a monthly crossover is present.
    """
    df = weekly_df.dropna(subset=["Close"])
    if len(df) < 40:
        return None

    close  = df["Close"]
    volume = df["Volume"]

    current_price = float(close.iloc[-1])
    if current_price < 1.0:
        return None
    if volume.mean() < 100_000:
        return None

    current_color, weekly_colors, weekly_prior, _ = _run_dc_on_df(df)

    avg_vol_20 = volume.rolling(20).mean()
    volume_ratio = (
        float(volume.iloc[-1] / avg_vol_20.iloc[-1])
        if avg_vol_20.iloc[-1] > 0
        else 1.0
    )

    weekly_qualifies = (
        current_color in ("RED", "YELLOW")
        and weekly_prior >= 3
        and volume_ratio >= 0.5
    )

    # ── Monthly check ──
    monthly_candle_color: Optional[str] = None
    monthly_months_since_flip: Optional[int] = None
    if monthly_df is not None and not monthly_df.empty:
        monthly_candle_color, monthly_months_since_flip = _check_monthly_candle(monthly_df)

    monthly_qualifies = monthly_candle_color is not None

    if not weekly_qualifies and not monthly_qualifies:
        return None

    # ── Remaining indicator fields ──
    rsi_series = ta_momentum.RSIIndicator(close=close, window=14).rsi()
    rsi_val = float(rsi_series.iloc[-1]) if not pd.isna(rsi_series.iloc[-1]) else None

    macd_ind = TaMACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    macd_hist_val = (
        float(v) if not pd.isna(v := macd_ind.macd_diff().iloc[-1]) else None
    )

    prev_close = float(close.iloc[-2]) if len(close) > 1 else current_price
    weekly_change_pct = (
        ((current_price - prev_close) / prev_close) * 100 if prev_close > 0 else 0.0
    )

    ema13 = ta_trend.EMAIndicator(close=close, window=13).ema_indicator()
    ema34 = ta_trend.EMAIndicator(close=close, window=34).ema_indicator()
    ema13_val = float(ema13.iloc[-1]) if not pd.isna(ema13.iloc[-1]) else None
    ema34_val = float(ema34.iloc[-1]) if not pd.isna(ema34.iloc[-1]) else None

    candle_type = current_color if weekly_qualifies else "NONE"
    prior_candle_count = weekly_prior if weekly_qualifies else None

    return {
        "ticker": ticker,
        "company_name": None,
        "candle_type": candle_type,
        "prior_candle_count": prior_candle_count,
        "current_price": round(current_price, 2),
        "weekly_change_pct": round(weekly_change_pct, 2),
        "volume_ratio": round(volume_ratio, 2),
        "ema13": round(ema13_val, 2) if ema13_val else None,
        "ema34": round(ema34_val, 2) if ema34_val else None,
        "rsi": round(rsi_val, 2) if rsi_val else None,
        "macd_hist": round(macd_hist_val, 4) if macd_hist_val else None,
        "is_volume_spike": volume_ratio > 1.5,
        "monthly_candle_color": monthly_candle_color,
        "monthly_months_since_flip": monthly_months_since_flip,
    }


# ── Helpers for extracting a single-ticker slice from a batch download ────────

def _get_ticker_df(raw: pd.DataFrame, ticker: str, is_single: bool) -> Optional[pd.DataFrame]:
    if is_single:
        df = raw.copy()
        # Single-ticker yf.download still returns a MultiIndex (Price, Ticker).
        # Flatten to plain column names so _analyze_ticker can use df["Close"] etc.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
    else:
        if ticker not in raw.columns.get_level_values(0):
            return None
        df = raw[ticker].copy()
    return df if df is not None and not df.empty else None


# ── Main Scanner (batched) ─────────────────────────────────────────────────────

def run_full_scan(
    update_progress: Callable[[str, str, int, int, int, str], None],
    job_id: str,
) -> list[dict]:
    """
    Scan S&P 500 + NASDAQ 100 in batches of 50.
    Downloads both weekly (1y/1wk) and monthly (5y/1mo) data per batch.
    Includes a stock if it has a weekly OR monthly EMA 13/34 crossover.
    update_progress(job_id, status, pct, scanned, total, message)
    """
    all_tickers = get_all_tickers()
    total = len(all_tickers)
    batch_size = 50
    total_batches = (total + batch_size - 1) // batch_size
    results: list[dict] = []

    logger.info(f"[Scanner] Starting scan: {total} tickers in {total_batches} batches")

    for batch_idx in range(0, total, batch_size):
        batch = all_tickers[batch_idx : batch_idx + batch_size]
        batch_num = batch_idx // batch_size + 1

        scanned_so_far = batch_idx
        pct = min(int(scanned_so_far / total * 100), 99)
        update_progress(
            job_id, "running", pct, scanned_so_far, total,
            f"Scanning batch {batch_num}/{total_batches} (weekly + monthly)...",
        )

        # ── Download weekly data ──
        # 2y instead of 1y: EMA34 needs 34 weeks to warm up, leaving only ~18
        # colored candles in 1y. 2y gives ~70 colored candles, enough to see
        # the full crossover history and avoid wrong state initialization.
        try:
            weekly_raw = yf.download(
                tickers=batch,
                period="2y",
                interval="1wk",
                group_by="ticker",
                auto_adjust=True,
                threads=True,
                progress=False,
                timeout=30,
            )
        except Exception as e:
            logger.error(f"[Scanner] Batch {batch_num} weekly download failed: {e}")
            continue

        if weekly_raw is None or weekly_raw.empty:
            logger.warning(f"[Scanner] Batch {batch_num} weekly returned empty data")
            continue

        # ── Download monthly data ──
        monthly_raw = None
        try:
            monthly_raw = yf.download(
                tickers=batch,
                period="5y",
                interval="1mo",
                group_by="ticker",
                auto_adjust=True,
                threads=True,
                progress=False,
                timeout=30,
            )
            if monthly_raw is not None and monthly_raw.empty:
                monthly_raw = None
        except Exception as e:
            logger.warning(f"[Scanner] Batch {batch_num} monthly download failed: {e}")

        # ── Process each ticker ──
        is_single = len(batch) == 1
        for ticker in batch:
            try:
                weekly_df = _get_ticker_df(weekly_raw, ticker, is_single)
                if weekly_df is None:
                    continue

                monthly_df = None
                if monthly_raw is not None:
                    monthly_df = _get_ticker_df(monthly_raw, ticker, is_single)

                result = _analyze_ticker(ticker, weekly_df, monthly_df)
                if result:
                    results.append(result)

            except Exception as e:
                logger.warning(f"[Scanner] {ticker} failed: {e}")
                continue

    # ── Validate results: drop suspicious tickers before returning ──
    from .market_data import validate_ticker
    validated: list[dict] = []
    skipped: list[str] = []
    for r in results:
        status = validate_ticker(r["ticker"])
        if status.is_suspicious or not status.is_valid:
            skipped.append(f"{r['ticker']} ({'; '.join(status.warnings)})")
        else:
            validated.append(r)
    if skipped:
        logger.warning(f"[Scanner] Skipped {len(skipped)} tickers due to validation: {skipped}")
    results = validated

    # Sort: multi-timeframe signals first, then by weekly prior count, then volume
    def _sort_key(r: dict) -> tuple:
        is_multi = r["candle_type"] != "NONE" and r.get("monthly_candle_color") is not None
        return (is_multi, r.get("prior_candle_count") or 0, r.get("volume_ratio") or 0)

    results.sort(key=_sort_key, reverse=True)

    red    = sum(1 for r in results if r["candle_type"] == "RED")
    yellow = sum(1 for r in results if r["candle_type"] == "YELLOW")
    m_red  = sum(1 for r in results if r.get("monthly_candle_color") == "RED")
    m_yel  = sum(1 for r in results if r.get("monthly_candle_color") == "YELLOW")
    logger.info(
        f"[Scanner] Complete — weekly: {red} RED, {yellow} YELLOW | "
        f"monthly: {m_red} RED, {m_yel} YELLOW"
    )

    return results
