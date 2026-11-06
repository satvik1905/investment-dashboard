"""Scanner job state: single-scan lock, heartbeat, and dead-worker detection."""

import fakeredis
import pytest
from fastapi import BackgroundTasks

from app.services import scan_progress as sp


@pytest.fixture
def r(monkeypatch):
    fake = fakeredis.FakeRedis()
    monkeypatch.setattr(sp, "get_redis", lambda: fake)
    return fake


def test_only_one_scan_can_hold_the_lock(r):
    assert sp.acquire_lock(r, "A")
    assert not sp.acquire_lock(r, "B")
    assert sp.lock_owner(r) == "A"


def test_release_by_non_owner_is_a_noop(r):
    sp.acquire_lock(r, "A")
    sp.release_lock(r, "B")
    assert sp.lock_owner(r) == "A"


def test_finished_job_cannot_release_a_newer_jobs_lock(r):
    sp.acquire_lock(r, "old")
    sp.release_lock(r, "old")
    sp.acquire_lock(r, "new")
    sp.release_lock(r, "old")
    assert sp.lock_owner(r) == "new"


def test_progress_is_readable_by_job_id_and_as_latest(r):
    sp.acquire_lock(r, "A")
    sp.set_progress(r, "A", "running", 10, 50, 600, "batch 1")
    assert sp.read_progress(r, "A")["progress"] == 10
    assert sp.read_progress(r)["job_id"] == "A"


def test_unknown_job_returns_none(r):
    assert sp.read_progress(r, "nope") is None
    assert sp.read_progress(r) is None


def test_running_progress_refreshes_lock_ttl(r):
    sp.acquire_lock(r, "A")
    r.expire(sp.LOCK_KEY, 5)
    sp.set_progress(r, "A", "running", 20, 100, 600, "batch 2")
    assert r.ttl(sp.LOCK_KEY) > sp.LOCK_TTL - 5


def test_progress_from_non_owner_does_not_extend_lock(r):
    sp.acquire_lock(r, "A")
    r.expire(sp.LOCK_KEY, 5)
    sp.set_progress(r, "B", "running", 20, 100, 600, "stray")
    assert r.ttl(sp.LOCK_KEY) <= 5


def test_running_job_without_lock_reads_as_failed(r):
    sp.acquire_lock(r, "A")
    sp.set_progress(r, "A", "running", 40, 200, 600, "batch 4")
    r.delete(sp.LOCK_KEY)  # worker died, lock expired

    p = sp.read_progress(r, "A")
    assert p["status"] == "failed"
    assert "interrupted" in p["message"]
    assert sp.read_progress(r)["status"] == "failed"


def test_completed_job_stays_complete_after_lock_release(r):
    sp.acquire_lock(r, "A")
    sp.set_progress(r, "A", "complete", 100, 600, 600, "done")
    sp.release_lock(r, "A")
    assert sp.read_progress(r, "A")["status"] == "complete"


# ── /api/scanner/run endpoint ────────────────────────────────────────────────

def test_second_trigger_returns_running_job_instead_of_starting_another(r):
    from app.routers import scanner as router

    first_tasks = BackgroundTasks()
    first = router.trigger_scan(first_tasks)
    second_tasks = BackgroundTasks()
    second = router.trigger_scan(second_tasks)

    assert first.job_id == second.job_id
    assert second.message == "Scan already running"
    assert len(first_tasks.tasks) == 1
    assert len(second_tasks.tasks) == 0


def test_trigger_seeds_running_progress(r):
    from app.routers import scanner as router

    job = router.trigger_scan(BackgroundTasks())
    assert router.get_scan_progress(job.job_id).status == "running"


def test_progress_endpoint_404s_for_expired_job(r):
    from fastapi import HTTPException
    from app.routers import scanner as router

    with pytest.raises(HTTPException) as exc:
        router.get_scan_progress("expired")
    assert exc.value.status_code == 404
