import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import requests
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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/fear-greed")
async def get_fear_greed():
    r = _redis()

    if r:
        cached = r.get("fear_greed")
        if cached:
            return json.loads(cached)

    try:
        response = await asyncio.to_thread(
            requests.get,
            "https://api.alternative.me/fng/?limit=5",
            timeout=10,
        )
        data = response.json()["data"]

        today     = data[0]
        yesterday = data[1] if len(data) > 1 else data[0]
        week_ago  = data[4] if len(data) > 4 else data[-1]

        result = {
            "score":            int(today["value"]),
            "rating":           today["value_classification"],
            "previous_close":   int(yesterday["value"]),
            "previous_1_week":  int(week_ago["value"]),
            "previous_1_month": None,
            "timestamp":        today["timestamp"],
        }

        if r:
            r.setex("fear_greed", 3600, json.dumps(result))

        return result

    except Exception as e:
        logger.error(f"Fear & Greed error: {e}")
        return {
            "score": None,
            "rating": "Unavailable",
            "error": str(e),
        }


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
