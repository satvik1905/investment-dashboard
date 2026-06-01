"""
Weekly Candle Scanner — Celery Task
Runs every Friday at 4:15 PM ET after weekly candles close.
"""

import json
import logging
import uuid
from datetime import date, datetime, timezone

from .celery_app import celery_app

logger = logging.getLogger(__name__)

PROGRESS_KEY = "scanner_progress"
PROGRESS_TTL = 3600  # 1 hour


def _get_redis():
    import redis as redis_lib
    import os
    from dotenv import load_dotenv
    load_dotenv()
    return redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))


def _set_progress(r, job_id: str, status: str, progress: int, scanned: int, total: int, message: str):
    payload = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "tickers_scanned": scanned,
        "total_tickers": total,
        "message": message,
    }
    r.setex(f"scanner_progress:{job_id}", PROGRESS_TTL, json.dumps(payload))
    # Also keep a global "latest" key so the frontend can check without a job_id
    r.setex(PROGRESS_KEY, PROGRESS_TTL, json.dumps(payload))


@celery_app.task(name="app.tasks.scanner.run_weekly_scanner", bind=True, max_retries=1)
def run_weekly_scanner(self, job_id: str = None):
    """
    Full Danny Cheng scan on S&P 500 + NASDAQ 100.
    Stores results in scanner_results table.
    """
    from ..database import SessionLocal
    from ..models import ScannerResult
    from ..services.scanner import run_full_scan

    if not job_id:
        job_id = str(uuid.uuid4())

    r = _get_redis()
    db = SessionLocal()
    scan_date = date.today()

    total_est = 600  # will be updated once we know the real count

    try:
        _set_progress(r, job_id, "running", 0, 0, total_est, "Initializing scanner...")

        scanned_count = [0]
        total_count = [total_est]

        def update_progress(_job_id: str, status: str, pct: int, scanned: int, total: int, message: str):
            scanned_count[0] = scanned
            total_count[0] = total
            _set_progress(r, job_id, status, pct, scanned, total, message)

        results = run_full_scan(update_progress=update_progress, job_id=job_id)

        # Delete any existing results for today to avoid duplicates
        db.query(ScannerResult).filter(ScannerResult.scan_date == scan_date).delete()
        db.commit()

        # Persist results
        for row in results:
            db_row = ScannerResult(
                scan_date=scan_date,
                ticker=row["ticker"],
                company_name=row.get("company_name"),
                candle_type=row["candle_type"],
                prior_candle_count=row.get("prior_candle_count"),
                current_price=row.get("current_price"),
                weekly_change_pct=row.get("weekly_change_pct"),
                volume_ratio=row.get("volume_ratio"),
                ema13=row.get("ema13"),
                ema34=row.get("ema34"),
                rsi=row.get("rsi"),
                macd_hist=row.get("macd_hist"),
                is_volume_spike=row.get("is_volume_spike", False),
            )
            db.add(db_row)
        db.commit()

        red_count = sum(1 for r in results if r["candle_type"] == "RED")
        yellow_count = sum(1 for r in results if r["candle_type"] == "YELLOW")
        summary_msg = f"Scanner complete: found {red_count} red, {yellow_count} yellow candles"
        logger.info(f"[Scanner] {summary_msg}")

        _set_progress(
            r, job_id, "complete", 100,
            total_count[0], total_count[0], summary_msg
        )

        return {
            "status": "complete",
            "job_id": job_id,
            "scan_date": str(scan_date),
            "red": red_count,
            "yellow": yellow_count,
            "total": len(results),
        }

    except Exception as e:
        logger.error(f"[Scanner] Task failed: {e}", exc_info=True)
        _set_progress(r, job_id, "failed", 0, 0, total_est, f"Error: {str(e)[:200]}")
        db.rollback()
        raise self.retry(exc=e, countdown=300)
    finally:
        db.close()
