"""
Scanner job state, kept in Redis so the API process and the Celery worker share it.

  running ──▶ complete
     │
     └─────▶ failed   (exception, or the worker died mid-scan)

A single lock key guarantees one scan at a time. The running job refreshes the
lock's TTL on every progress update, so if the process dies the lock expires and
readers report the job as failed instead of "running" until the progress key expires.
"""

import json
import os
from typing import Optional

import redis as redis_lib

PROGRESS_TTL = 3600        # 1 hour
LATEST_KEY = "scanner_progress"
LOCK_KEY = "scanner_lock"
LOCK_TTL = 900             # 15 min without a progress update = worker presumed dead


def get_redis() -> redis_lib.Redis:
    return redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))


def lock_owner(r: redis_lib.Redis) -> Optional[str]:
    owner = r.get(LOCK_KEY)
    return owner.decode() if owner else None


def acquire_lock(r: redis_lib.Redis, job_id: str) -> bool:
    """Claim the scanner for job_id. False if another scan holds it."""
    return bool(r.set(LOCK_KEY, job_id, nx=True, ex=LOCK_TTL))


def release_lock(r: redis_lib.Redis, job_id: str) -> None:
    if lock_owner(r) == job_id:
        r.delete(LOCK_KEY)


def set_progress(
    r: redis_lib.Redis,
    job_id: str,
    status: str,
    progress: int,
    tickers_scanned: int,
    total_tickers: int,
    message: str,
) -> None:
    payload = json.dumps({
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "tickers_scanned": tickers_scanned,
        "total_tickers": total_tickers,
        "message": message,
    })
    r.setex(f"scanner_progress:{job_id}", PROGRESS_TTL, payload)
    # Also keep a global "latest" key so the frontend can check without a job_id
    r.setex(LATEST_KEY, PROGRESS_TTL, payload)
    # Heartbeat: keep the lock alive while this job is making progress
    if status == "running" and lock_owner(r) == job_id:
        r.expire(LOCK_KEY, LOCK_TTL)


def read_progress(r: redis_lib.Redis, job_id: Optional[str] = None) -> Optional[dict]:
    """Progress for job_id (or the latest job), with dead workers reported as failed."""
    raw = r.get(f"scanner_progress:{job_id}" if job_id else LATEST_KEY)
    if not raw:
        return None
    p = json.loads(raw)
    if p["status"] == "running" and lock_owner(r) != p["job_id"]:
        p["status"] = "failed"
        p["message"] = "Scan interrupted — the worker stopped before finishing"
    return p
