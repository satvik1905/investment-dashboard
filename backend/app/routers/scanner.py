"""
Scanner API endpoints
Uses FastAPI BackgroundTasks — no Celery worker required.
"""

import json
import logging
import os
import uuid
from datetime import date
from typing import Optional

import redis as redis_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc

from ..database import SessionLocal, get_db
from ..models import ScannerResult

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Redis client ─────────────────────────────────────────────────────────────

def _get_redis() -> redis_lib.Redis:
    return redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

PROGRESS_TTL = 3600  # 1 hour


def _set_progress(
    r: redis_lib.Redis,
    job_id: str,
    status: str,
    progress: int,
    tickers_scanned: int,
    total_tickers: int,
    message: str,
) -> None:
    payload = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "tickers_scanned": tickers_scanned,
        "total_tickers": total_tickers,
        "message": message,
    }
    r.setex(f"scanner_progress:{job_id}", PROGRESS_TTL, json.dumps(payload))
    # Also write to the "latest" key so the no-job-id endpoint works
    r.setex("scanner_progress", PROGRESS_TTL, json.dumps(payload))


# ── Background scan task ─────────────────────────────────────────────────────

def _run_scan_background(job_id: str) -> None:
    """Runs in-process via FastAPI BackgroundTasks. No Celery needed."""
    from ..services.scanner import run_full_scan

    r = _get_redis()
    db = SessionLocal()
    scan_date = date.today()

    try:
        def update_progress(
            jid: str, status: str, pct: int, scanned: int, total: int, message: str
        ) -> None:
            _set_progress(r, jid, status, pct, scanned, total, message)

        results = run_full_scan(update_progress=update_progress, job_id=job_id)

        # Wipe today's existing rows and insert fresh results
        db.query(ScannerResult).filter(ScannerResult.scan_date == scan_date).delete()
        db.commit()

        for row in results:
            db.add(ScannerResult(
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
                monthly_candle_color=row.get("monthly_candle_color"),
                monthly_months_since_flip=row.get("monthly_months_since_flip"),
            ))
        db.commit()

        red    = sum(1 for r in results if r["candle_type"] == "RED")
        yellow = sum(1 for r in results if r["candle_type"] == "YELLOW")
        m_red  = sum(1 for r in results if r.get("monthly_candle_color") == "RED")
        m_yel  = sum(1 for r in results if r.get("monthly_candle_color") == "YELLOW")
        msg    = f"Scan complete — {red} weekly red, {yellow} weekly yellow, {m_red} monthly red, {m_yel} monthly yellow"
        logger.info(f"[Scanner] {msg}")
        _set_progress(r, job_id, "complete", 100, len(results), len(results), msg)

    except Exception as e:
        logger.error(f"[Scanner] Background scan failed: {e}", exc_info=True)
        _set_progress(r, job_id, "failed", 0, 0, 0, f"Error: {str(e)[:200]}")
        db.rollback()
    finally:
        db.close()


# ── Response schemas ──────────────────────────────────────────────────────────

class ScannerResultResponse(BaseModel):
    id: int
    scan_date: date
    ticker: str
    company_name: Optional[str] = None
    candle_type: str
    prior_candle_count: Optional[int] = None
    current_price: Optional[float] = None
    weekly_change_pct: Optional[float] = None
    volume_ratio: Optional[float] = None
    ema13: Optional[float] = None
    ema34: Optional[float] = None
    rsi: Optional[float] = None
    macd_hist: Optional[float] = None
    is_volume_spike: Optional[bool] = None
    monthly_candle_color: Optional[str] = None
    monthly_prior_candle_count: Optional[int] = None
    monthly_months_since_flip: Optional[int] = None

    model_config = {"from_attributes": True}


class ScanProgressResponse(BaseModel):
    job_id: str
    status: str           # running | complete | failed
    progress: int         # 0-100
    tickers_scanned: int
    total_tickers: int
    message: str


class TriggerResponse(BaseModel):
    job_id: str
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/latest-date")
def get_latest_scan_date(db: Session = Depends(get_db)):
    row = (
        db.query(ScannerResult.scan_date)
        .order_by(desc(ScannerResult.scan_date))
        .first()
    )
    if not row:
        return {"latest_date": None}
    return {"latest_date": str(row.scan_date)}


@router.get("/results", response_model=list[ScannerResultResponse])
def get_scanner_results(
    candle_type: str = Query("ALL", description="RED | YELLOW | MONTHLY_RED | MONTHLY_YELLOW | ALL"),
    scan_date: Optional[date] = Query(None, description="Specific date; defaults to latest"),
    filter: str = Query("all", description="volume_spike | strong_reversal | all"),
    sort: str = Query("prior_candles", description="prior_candles | volume | change"),
    db: Session = Depends(get_db),
):
    if scan_date is None:
        latest = (
            db.query(ScannerResult.scan_date)
            .order_by(desc(ScannerResult.scan_date))
            .first()
        )
        if not latest:
            return []
        scan_date = latest.scan_date

    q = db.query(ScannerResult).filter(ScannerResult.scan_date == scan_date)

    is_monthly_tab = candle_type in ("MONTHLY_RED", "MONTHLY_YELLOW")

    if candle_type == "MONTHLY_RED":
        q = q.filter(ScannerResult.monthly_candle_color == "RED")
    elif candle_type == "MONTHLY_YELLOW":
        q = q.filter(ScannerResult.monthly_candle_color == "YELLOW")
    elif candle_type in ("RED", "YELLOW"):
        q = q.filter(ScannerResult.candle_type == candle_type)

    if not is_monthly_tab:
        if filter == "volume_spike":
            q = q.filter(ScannerResult.is_volume_spike == True)
        elif filter == "strong_reversal":
            q = q.filter(ScannerResult.prior_candle_count >= 5)

    if is_monthly_tab:
        # Monthly: freshest flip first, then volume as tiebreak
        q = q.order_by(
            asc(ScannerResult.monthly_months_since_flip),
            desc(ScannerResult.volume_ratio),
        )
    elif sort == "prior_candles":
        q = q.order_by(desc(ScannerResult.prior_candle_count), desc(ScannerResult.volume_ratio))
    elif sort == "volume":
        q = q.order_by(desc(ScannerResult.volume_ratio))
    elif sort == "change":
        q = q.order_by(desc(ScannerResult.weekly_change_pct))

    return q.all()


@router.post("/run", response_model=TriggerResponse)
def trigger_scan(background_tasks: BackgroundTasks):
    """
    Kick off a background scan and return a job_id immediately.
    Frontend polls /progress/{job_id} every few seconds.
    """
    job_id = str(uuid.uuid4())
    r = _get_redis()

    # Seed Redis immediately so /progress/{job_id} never 404s
    _set_progress(r, job_id, "running", 0, 0, 600, "Starting scan...")

    background_tasks.add_task(_run_scan_background, job_id)
    return TriggerResponse(job_id=job_id, message="Scanner started")


@router.get("/progress/{job_id}", response_model=ScanProgressResponse)
def get_scan_progress(job_id: str):
    r = _get_redis()
    raw = r.get(f"scanner_progress:{job_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return ScanProgressResponse(**json.loads(raw))


@router.get("/progress", response_model=Optional[ScanProgressResponse])
def get_latest_progress():
    r = _get_redis()
    raw = r.get("scanner_progress")
    if not raw:
        return None
    return ScanProgressResponse(**json.loads(raw))
