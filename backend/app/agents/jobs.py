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


def claim_plan(job_id: str) -> bool:
    """One planner call per discovery. A second poll waits instead of calling the model again."""
    return bool(get_redis_connection().set(f"testflow:agent:plan:{job_id}", "1", nx=True, ex=90))


def release_plan(job_id: str) -> None:
    get_redis_connection().delete(f"testflow:agent:plan:{job_id}")


def public_view(job: dict) -> dict[str, Any]:
    return {
        "id": job["id"],
        "projectId": job.get("projectId"),
        "phase": job.get("phase"),
        "prompt": job.get("prompt"),
        "messages": [
            {"role": item.get("role") or "assistant", "text": str(item.get("text") or "")}
            for item in (job.get("messages") or [])
            if isinstance(item, dict) and str(item.get("text") or "").strip()
        ],
        "startPath": job.get("startPath") or "",
        "steps": job.get("steps") or [],
        "expected": job.get("expected") or "",
        "pages": job.get("pages") or [],
        "diary": job.get("diary") or [],
        "script": job.get("script") or "",
        "testCaseId": job.get("testCaseId"),
        "suiteId": job.get("suiteId"),
        "cases": [_public_case(item) for item in (job.get("cases") or []) if isinstance(item, dict)],
        "costUsd": job.get("costUsd") or 0,
        "error": job.get("error"),
    }


def _public_case(case: dict) -> dict[str, Any]:
    return {
        "id": case.get("id"),
        "name": case.get("name") or "",
        "path": case.get("path") or "",
        "steps": case.get("steps") or [],
        "expected": case.get("expected") or "",
        "phase": case.get("phase") or "",
        "script": case.get("script") or "",
        "diary": case.get("diary") or [],
        "testCaseId": case.get("testCaseId"),
        "error": case.get("error"),
        "diary": case.get("diary") or [],
    }
