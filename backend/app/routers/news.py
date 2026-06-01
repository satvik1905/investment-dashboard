import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import yfinance as yf
from fastapi import APIRouter
import redis as redis_lib

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Redis client ───────────────────────────────────────────────────────────────

def _redis():
    try:
        r = redis_lib.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True,
        )
        r.ping()
        return r
    except Exception:
        return None


# ── VIX endpoint ──────────────────────────────────────────────────────────────

_VIX_RANGES = {
    "30d": {"period": "3mo", "tail": 30},
    "3m":  {"period": "3mo", "tail": None},
    "6m":  {"period": "6mo", "tail": None},
    "1y":  {"period": "1y",  "tail": None},
}


def _fetch_vix(range_key: str = "30d"):
    """Synchronous helper — run inside asyncio.to_thread."""
    import pandas as pd

    cfg = _VIX_RANGES.get(range_key, _VIX_RANGES["30d"])
    df = yf.download("^VIX", period=cfg["period"], interval="1d", auto_adjust=True, progress=False, timeout=15)
    if df is None or df.empty:
        return None

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.dropna(subset=["Close"])
    if len(df) < 2:
        return None

    if cfg["tail"]:
        df = df.tail(cfg["tail"])

    closes = []
    for dt, row in df.iterrows():
        date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        closes.append({"date": date_str, "value": round(float(row["Close"]), 2)})

    current = closes[-1]["value"]
    previous_close = closes[-2]["value"] if len(closes) >= 2 else None
    change = round(current - previous_close, 2) if previous_close is not None else None
    change_pct = round((change / previous_close) * 100, 1) if previous_close and previous_close != 0 else None

    return {
        "current": current,
        "previous_close": previous_close,
        "change": change,
        "change_pct": change_pct,
        "closes": closes,
    }


@router.get("/vix")
async def get_vix(range: str = "30d"):
    if range not in _VIX_RANGES:
        range = "30d"

    r = _redis()
    cache_key = f"vix:{range}"

    if r:
        cached = r.get(cache_key)
        if cached:
            return json.loads(cached)

    try:
        result = await asyncio.to_thread(_fetch_vix, range)
        if result is None:
            return {"current": None, "error": "VIX data unavailable from yfinance"}

        if r:
            r.setex(cache_key, 900, json.dumps(result))

        return result

    except Exception as e:
        logger.error(f"VIX fetch error: {e}")
        return {"current": None, "error": str(e)}


# ── News feed endpoint ────────────────────────────────────────────────────────

def _fetch_news_for_ticker(ticker: str):
    """Synchronous helper — run inside asyncio.to_thread."""
    stock = yf.Ticker(ticker)
    return stock.news


@router.get("/feed")
async def get_news_feed(tickers: str):
    ticker_list = [t.strip().upper() for t in tickers.split(",")][:10]
    r = _redis()

    cache_key = f"news_{'_'.join(sorted(ticker_list))}"
    if r:
        cached = r.get(cache_key)
        if cached:
            return json.loads(cached)

    all_articles = []
    seen_titles = set()

    for ticker in ticker_list:
        try:
            news = await asyncio.to_thread(_fetch_news_for_ticker, ticker)

            for item in news[:5]:
                content = item.get("content", {})
                title = content.get("title", "") or item.get("title", "")
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)

                # pub time — try nested ISO date first, fallback to unix timestamp
                pub_time = None
                pub_date_str = content.get("pubDate", "")
                if pub_date_str:
                    try:
                        pub_time = (
                            datetime.fromisoformat(
                                pub_date_str.replace("Z", "+00:00")
                            )
                            .astimezone(timezone.utc)
                            .isoformat()
                        )
                    except Exception:
                        ts = item.get("providerPublishTime", 0) or 0
                        if ts:
                            pub_time = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                else:
                    ts = item.get("providerPublishTime", 0) or 0
                    if ts:
                        pub_time = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

                link = (
                    content.get("canonicalUrl", {}).get("url", "")
                    or item.get("link", "")
                )

                publisher = (
                    content.get("provider", {}).get("displayName", "")
                    or item.get("publisher", "")
                )

                all_articles.append({
                    "ticker": ticker,
                    "title": title,
                    "publisher": publisher,
                    "link": link,
                    "published_at": pub_time,
                })

        except Exception as e:
            logger.error(f"News error {ticker}: {e}")
            continue

    all_articles.sort(key=lambda x: x["published_at"] or "", reverse=True)
    result = {"articles": all_articles}

    if r:
        r.setex(cache_key, 900, json.dumps(result))

    return result
