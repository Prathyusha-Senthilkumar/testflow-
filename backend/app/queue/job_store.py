"""JSON test jobs in Redis. The Node worker reads these. RQ cannot."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from redis.exceptions import WatchError

from app.queue.connection import get_redis_connection

JOB_PREFIX = "testflow:job:"
QUEUE_KEY = "testflow:queue"
SCHEDULE_KEY = "testflow:scheduled"
JOB_TTL_SECONDS = 60 * 60 * 48


TERMINAL_STATES = ("completed", "failed", "cancelled")


def new_job_id() -> str:
    return str(uuid.uuid4())


class TestJob:
    def __init__(self, payload: dict):
        self.id = str(payload["id"])
        self.payload = payload

    @property
    def meta(self) -> dict:
        return {
            "config_path": self.payload.get("configPath"),
            "project_id": self.payload.get("projectId"),
            "test_case_code": self.payload.get("testCaseCode"),
            "test_case_id": self.payload.get("testCaseId"),
            "schedule_time_zone": self.payload.get("scheduleTimeZone"),
            "scheduled_for": self.payload.get("scheduledFor"),
        }


def submit_job(
    *,
    config_path: str,
    project_id: Optional[str],
    test_case_code: Optional[str],
    test_case_id: Optional[str],
    headed: Optional[bool],
    time_zone: Optional[str],
    run_at: Optional[datetime],
    environment_base_url: Optional[str] = None,
    job_id: Optional[str] = None,
) -> TestJob:
    """Store the job record, then make it visible to the worker (queue or schedule)."""
    job_id = job_id or new_job_id()
    scheduled_for = run_at.astimezone(timezone.utc).isoformat() if run_at else None
    payload: dict[str, Any] = {
        "id": job_id,
        "state": "scheduled" if run_at else "queued",
        "configPath": config_path,
        "projectId": project_id,
        "testCaseCode": test_case_code,
        "testCaseId": test_case_id,
        "headed": headed,
        "scheduleTimeZone": time_zone,
        "scheduledFor": scheduled_for,
        "environmentBaseUrl": environment_base_url,
        "result": None,
        "error": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    redis = get_redis_connection()
    redis.set(JOB_PREFIX + job_id, json.dumps(payload), ex=JOB_TTL_SECONDS)
    if run_at:
        redis.zadd(SCHEDULE_KEY, {job_id: run_at.timestamp()})
    else:
        redis.lpush(QUEUE_KEY, job_id)
    return TestJob(payload)


def fetch_job(job_id: str) -> Optional[TestJob]:
    payload = _decode(get_redis_connection().get(JOB_PREFIX + job_id))
    return TestJob(payload) if payload is not None else None


def is_scheduled(job_ids: list[str]) -> set[str]:
    """Job ids still waiting in the schedule (not yet due)."""
    if not job_ids:
        return set()
    redis = get_redis_connection()
    with redis.pipeline() as pipe:
        for job_id in job_ids:
            pipe.zscore(SCHEDULE_KEY, job_id)
        scores = pipe.execute()
    return {job_id for job_id, score in zip(job_ids, scores) if score is not None}


def scheduled_jobs() -> list[TestJob]:
    redis = get_redis_connection()
    job_ids = redis.zrange(SCHEDULE_KEY, 0, -1)
    jobs: list[tuple[float, TestJob]] = []
    for job_id in job_ids:
        if isinstance(job_id, bytes):
            job_id = job_id.decode("utf-8")
        job = fetch_job(str(job_id))
        if job is None:
            continue
        score = redis.zscore(SCHEDULE_KEY, job_id)
        jobs.append((float(score or 0), job))
    jobs.sort(key=lambda item: item[0])
    return [job for _, job in jobs]


def scheduled_time(job: TestJob) -> Optional[datetime]:
    raw = job.payload.get("scheduledFor")
    if not raw:
        return None
    text = str(raw).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def request_cancel(job_id: str) -> str:
    """Stop a job that has not finished. A running browser is asked to stop; it is not killed blindly.

    The job record is updated with WATCH/MULTI so a concurrent worker write (e.g. completed)
    is never overwritten: whichever write lands first wins and the other retries/backs off.
    """
    redis = get_redis_connection()
    key = JOB_PREFIX + job_id
    for _ in range(10):
        with redis.pipeline() as pipe:
            try:
                pipe.watch(key)
                raw = pipe.get(key)
                payload = _decode(raw)
                if payload is None:
                    pipe.unwatch()
                    return "missing"
                state = str(payload.get("state") or "")
                if state in TERMINAL_STATES:
                    pipe.unwatch()
                    return state
                payload["state"] = "cancelled"
                payload["error"] = "Cancelled"
                pipe.multi()
                pipe.lrem(QUEUE_KEY, 0, job_id)
                pipe.zrem(SCHEDULE_KEY, job_id)
                pipe.set(key, json.dumps(payload), ex=JOB_TTL_SECONDS)
                pipe.execute()
                return "cancelled"
            except WatchError:
                continue
    raise RuntimeError("Could not cancel the job: it kept changing. Try again.")


def _decode(raw) -> Optional[dict]:
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) and payload.get("id") else None


def cancel_scheduled(job_id: str) -> bool:
    redis = get_redis_connection()
    if redis.zscore(SCHEDULE_KEY, job_id) is None:
        return False
    redis.zrem(SCHEDULE_KEY, job_id)
    redis.delete(JOB_PREFIX + job_id)
    return True
