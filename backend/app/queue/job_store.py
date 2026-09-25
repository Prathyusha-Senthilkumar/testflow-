"""JSON test jobs in Redis. The Node worker reads these. RQ cannot."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.queue.connection import get_redis_connection

JOB_PREFIX = "testflow:job:"
QUEUE_KEY = "testflow:queue"
SCHEDULE_KEY = "testflow:scheduled"
JOB_TTL_SECONDS = 60 * 60 * 48


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
) -> TestJob:
    job_id = str(uuid.uuid4())
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
    raw = get_redis_connection().get(JOB_PREFIX + job_id)
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or not payload.get("id"):
        return None
    return TestJob(payload)


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
    """Stop a job that has not finished. A running browser is asked to stop; it is not killed blindly."""
    job = fetch_job(job_id)
    if job is None:
        return "missing"
    state = str(job.payload.get("state") or "")
    if state in ("completed", "failed", "cancelled"):
        return state
    redis = get_redis_connection()
    redis.lrem(QUEUE_KEY, 0, job_id)
    redis.zrem(SCHEDULE_KEY, job_id)
    payload = dict(job.payload)
    payload["state"] = "cancelled"
    payload["error"] = "Cancelled"
    redis.set(JOB_PREFIX + job_id, json.dumps(payload), ex=JOB_TTL_SECONDS)
    return "cancelled"


def cancel_scheduled(job_id: str) -> bool:
    redis = get_redis_connection()
    if redis.zscore(SCHEDULE_KEY, job_id) is None:
        return False
    redis.zrem(SCHEDULE_KEY, job_id)
    redis.delete(JOB_PREFIX + job_id)
    return True
