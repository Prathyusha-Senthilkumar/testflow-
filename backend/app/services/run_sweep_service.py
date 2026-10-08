"""Close test_runs that can no longer finish (worker crashed, job expired, queue lost).

A run is left alone while it can still make progress:
  * Queued and its job is still in the Redis queue or schedule, or
  * Running and claimed by a worker whose heartbeat lease is still alive.
Anything else older than STUCK_RUN_AFTER_MINUTES is marked Failed with a clear reason.
Status values stay within the existing set (timeouts are Failed + a message).
"""

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings
from app.repositories.test_run_repository import TestRunRepository, test_run_repository

logger = logging.getLogger("testflow.run_sweep")

QUEUE_KEY = "testflow:queue"
SCHEDULE_KEY = "testflow:scheduled"
JOB_PREFIX = "testflow:job:"
LEASE_PREFIX = "testflow:lease:"


class RunSweepService:
    def __init__(self, runs: TestRunRepository, redis_factory=None):
        self.runs = runs
        self._redis_factory = redis_factory

    def _redis(self):
        if self._redis_factory is not None:
            return self._redis_factory()
        from app.queue.connection import get_redis_connection

        return get_redis_connection()

    def stuck_message(self, minutes: int) -> str:
        return (
            # The notifications trigger keys run_stuck off this prefix; keep it stable.
            f"Marked failed: no progress for {minutes} minutes. The worker stopped or the "
            "queued job was lost. Run the test again."
        )

    def sweep(self, now: Optional[datetime] = None, minutes: Optional[int] = None) -> int:
        minutes = int(minutes or settings.STUCK_RUN_AFTER_MINUTES)
        now = now or datetime.now(timezone.utc)
        cutoff = (now - timedelta(minutes=minutes)).isoformat()
        rows = self.runs.find_stale_active(cutoff)
        if not rows:
            return 0
        redis = self._redis()
        stuck = [str(row["id"]) for row in rows if not self._can_still_progress(redis, row)]
        changed = self.runs.fail_if_active(stuck, self.stuck_message(minutes))
        if changed:
            logger.warning("event=stuck_runs_failed count=%s threshold_minutes=%s", changed, minutes)
        return changed

    @staticmethod
    def _can_still_progress(redis, row: dict) -> bool:
        job_id = str(row.get("job_id") or "")
        if not job_id:
            return False
        if redis.zscore(SCHEDULE_KEY, job_id) is not None:
            return True
        status = str(row.get("status") or "")
        if status == "Queued":
            return redis.lpos(QUEUE_KEY, job_id) is not None
        raw = redis.get(JOB_PREFIX + job_id)
        if not raw:
            return False
        try:
            payload = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        except (ValueError, AttributeError):
            return False
        worker_id = str((payload or {}).get("claimedBy") or "")
        return bool(worker_id) and bool(redis.exists(LEASE_PREFIX + worker_id))


run_sweep_service = RunSweepService(test_run_repository)


def sweep_forever(stop: Optional[threading.Event] = None) -> None:
    """Background loop started by the FastAPI lifespan. Never raises."""
    stop = stop or threading.Event()
    interval = max(30, int(settings.STUCK_RUN_SWEEP_SECONDS))
    while not stop.is_set():
        try:
            run_sweep_service.sweep()
        except Exception as exc:  # keep the loop alive; Redis/Supabase may be briefly unavailable
            logger.warning("event=stuck_run_sweep_failed error=%s", exc.__class__.__name__)
        stop.wait(interval)
