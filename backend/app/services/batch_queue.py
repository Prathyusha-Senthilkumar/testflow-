"""Suite and project batch ids.

Supabase Queues (pgmq) is the queue when Supabase is configured.
Demo mode keeps the previous Redis list so local runs still start.
"""

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.database import get_supabase_client
from app.logging_format import bind_background, log_failure
from app.queue.connection import get_redis_connection

logger = logging.getLogger("testflow.batch_queue")

QUEUE_NAME = "testflow_batch_dispatch"
REDIS_FALLBACK_KEY = "testflow:batch-dispatch"
VISIBILITY_TIMEOUT_SECONDS = 180
POLL_INTERVAL_SECONDS = 0.5
_BATCH_KEY_PREFIX = "testflow:batch:"
_inflight_batches: set[str] = set()
_inflight_guard = threading.Lock()


def enqueue_batch(batch_id: str) -> None:
    client = get_supabase_client()
    if client is None:
        get_redis_connection().lpush(REDIS_FALLBACK_KEY, batch_id)
        return
    client.rpc("testflow_batch_queue_send", {"batch_id": batch_id}).execute()


def read_batch() -> dict[str, Any] | None:
    """Return {msg_id, batch_id} or None. A read hides the message until archived or the timeout."""
    client = get_supabase_client()
    if client is None:
        raw = get_redis_connection().rpop(REDIS_FALLBACK_KEY)
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return {"msg_id": None, "batch_id": str(raw)}

    result = client.rpc(
        "testflow_batch_queue_read",
        {"vt": VISIBILITY_TIMEOUT_SECONDS, "qty": 1},
    ).execute()
    rows = result.data or []
    if not rows:
        return None
    row = rows[0]
    message = row.get("message") or {}
    batch_id = str(message.get("batchId") or "").strip()
    if not batch_id:
        archive_batch(row.get("msg_id"))
        return None
    return {"msg_id": row.get("msg_id"), "batch_id": batch_id}


def archive_batch(msg_id: Any) -> None:
    if msg_id is None:
        return
    client = get_supabase_client()
    if client is None:
        return
    client.rpc("testflow_batch_queue_archive", {"msg_id": int(msg_id)}).execute()


def drain_legacy_redis_batches() -> None:
    """Finish batch ids left on Redis before this process started using Supabase Queues."""
    if get_supabase_client() is None:
        return
    from app.services.execution_service import get_execution_service

    redis = get_redis_connection()
    service = get_execution_service()
    while True:
        raw = redis.rpop(REDIS_FALLBACK_KEY)
        if not raw:
            return
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        batch_id = str(raw)
        try:
            service.dispatch_batch(batch_id)
        except Exception as exc:
            log_failure(logger, f"batch.dispatch_leftover batch_id={batch_id}", exc)


def dispatch_once(service, batch_id: str) -> bool:
    with _inflight_guard:
        if batch_id in _inflight_batches:
            return False
        _inflight_batches.add(batch_id)
    try:
        logger.info("batch.dispatch started batch_id=%s", batch_id)
        service.dispatch_batch(batch_id)
        logger.info("batch.dispatch completed batch_id=%s", batch_id)
        return True
    finally:
        with _inflight_guard:
            _inflight_batches.discard(batch_id)


def reclaim_recent_unstarted(service) -> None:
    """Start batches that were saved but never left the queue.

    A lost queue message otherwise leaves every scripted case queued forever.
    Only the newest batch from the last 30 minutes is retried, so older abandoned runs stay put.
    """
    redis = get_redis_connection()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    newest: tuple[datetime, str] | None = None
    for key in redis.scan_iter(match=f"{_BATCH_KEY_PREFIX}*", count=100):
        raw = redis.get(key)
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("dispatchState") != "queued" or payload.get("cancelled"):
            continue
        created = payload.get("createdAt")
        try:
            created_at = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        except ValueError:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at < cutoff:
            continue
        pending = any(
            entry.get("dispatchPending") and not entry.get("jobId")
            for entry in payload.get("cases") or []
        )
        if not pending:
            continue
        batch_id = str(payload.get("id") or "")
        if not batch_id:
            continue
        if newest is None or created_at > newest[0]:
            newest = (created_at, batch_id)
    if newest is not None:
        dispatch_once(service, newest[1])


def consume_forever() -> None:
    from app.services.execution_service import get_execution_service

    service = get_execution_service()
    try:
        drain_legacy_redis_batches()
    except Exception as exc:
        log_failure(logger, "batch.drain_leftover", exc)

    queue_missing = False
    while True:
        bind_background("batch-queue")
        try:
            item = read_batch()
            queue_missing = False
            if item is None:
                reclaim_recent_unstarted(service)
                time.sleep(POLL_INTERVAL_SECONDS)
                continue
            if dispatch_once(service, item["batch_id"]):
                archive_batch(item.get("msg_id"))
        except Exception as exc:
            text = str(exc)
            if "PGRST202" in text or "PGRST205" in text:
                if not queue_missing:
                    log_failure(
                        logger,
                        "batch.queue",
                        exc,
                        level=logging.WARNING,
                        dedupe_seconds=300,
                    )
                    queue_missing = True
                time.sleep(30)
                continue
            log_failure(logger, "batch.queue", exc)
            time.sleep(1)


SCHEDULE_POLL_SECONDS = 5


def promote_scheduled_forever(stop: threading.Event) -> None:
    """Start due suite/project schedules. Runs beside consume_forever so a stuck queue read never delays them."""
    from app.services.execution_service import get_execution_service

    service = get_execution_service()
    while not stop.is_set():
        bind_background("scheduled-batches")
        try:
            service.promote_due_batches()
        except Exception as exc:
            log_failure(logger, "schedule.promote", exc)
        stop.wait(SCHEDULE_POLL_SECONDS)
