"""Agent jobs live in Redis. The diary and the loop counters are one checkpoint."""

import json
import uuid
from typing import Any

from app.queue.connection import get_redis_connection

JOB_PREFIX = "testflow:agent:job:"
QUEUE_KEY = "testflow:agent:queue"
_TTL = 60 * 60 * 48


def new_id() -> str:
    return uuid.uuid4().hex


def save(job: dict) -> None:
    get_redis_connection().set(JOB_PREFIX + job["id"], json.dumps(job), ex=_TTL)


def load(job_id: str) -> dict | None:
    raw = get_redis_connection().get(JOB_PREFIX + job_id)
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    return data if isinstance(data, dict) else None


def enqueue_record(job_id: str) -> None:
    get_redis_connection().lpush(QUEUE_KEY, job_id)


def public_view(job: dict) -> dict[str, Any]:
    return {
        "id": job["id"],
        "projectId": job.get("projectId"),
        "phase": job.get("phase"),
        "prompt": job.get("prompt"),
        "steps": job.get("steps") or [],
        "expected": job.get("expected") or "",
        "diary": job.get("diary") or [],
        "script": job.get("script") or "",
        "testCaseId": job.get("testCaseId"),
        "costUsd": job.get("costUsd") or 0,
        "error": job.get("error"),
    }
