"""Workers page: classifies worker heartbeats (online / draining / stale) and sums slots and queues."""

import logging
import time
from datetime import datetime, timezone
from typing import Callable, List, Optional, Tuple

from fastapi import HTTPException
from pydantic import ValidationError
from redis.exceptions import RedisError

from app.config import settings
from app.repositories.worker_status_repository import (
    BatchQueueDepthRepository,
    RegistrySnapshot,
    WorkerStatusRepository,
)
from app.schemas.worker import QueueCounts, WorkerStatus, WorkerTotals, WorkersResponse

logger = logging.getLogger("testflow.workers")

STALE_AFTER_INTERVALS = 3
# Ids whose heartbeat has been gone this long are removed from the registry.
FORGET_AFTER_SECONDS = 10 * 60
BATCH_DEPTH_CACHE_SECONDS = 10

# Shown to end users as-is: plain language, no infrastructure names or commands.
# Operator detail (REDIS_URL, rebuilds) belongs in logs and DEPLOYMENT.md.
REDIS_NOT_CONFIGURED = "Runner status isn't available right now. Ask your administrator to check the runner setup."
REDIS_UNAVAILABLE = "Runner status is temporarily unavailable. Tests already queued will still run once runners are back."
NO_WORKERS = "No test runners are online right now. Tests you start will wait in the queue until a runner is available."
WORKER_NOT_FOUND = "Worker not found. It may have stopped more than 10 minutes ago."


class WorkerStatusService:
    def __init__(
        self,
        repository: WorkerStatusRepository,
        batch_depth: BatchQueueDepthRepository,
        *,
        interval_ms: Optional[int] = None,
        clock: Callable[[], float] = time.time,
        redis_configured: Optional[Callable[[], bool]] = None,
    ):
        self._repository = repository
        self._batch_depth = batch_depth
        self._interval_ms = interval_ms
        self._clock = clock
        self._redis_configured = redis_configured or (lambda: bool((settings.REDIS_URL or "").strip()))
        self._batch_cache: Optional[Tuple[float, Optional[int]]] = None

    @property
    def stale_after_seconds(self) -> float:
        interval = self._interval_ms if self._interval_ms is not None else settings.WORKER_STATUS_INTERVAL_MS
        return STALE_AFTER_INTERVALS * max(interval, 1000) / 1000

    def overview(self) -> WorkersResponse:
        now = self._clock()
        generated_at = _iso(now)
        if not self._redis_configured():
            return WorkersResponse(generatedAt=generated_at, totals=WorkerTotals(), message=REDIS_NOT_CONFIGURED)
        snapshot = self._read_snapshot()
        if snapshot is None:
            return WorkersResponse(generatedAt=generated_at, totals=WorkerTotals(), message=REDIS_UNAVAILABLE)

        workers = self._classify(snapshot, now)
        queue = QueueCounts(
            queued=snapshot.queued,
            scheduled=snapshot.scheduled,
            processing=snapshot.processing,
            batchesPending=self._batches_pending(now),
        )
        return WorkersResponse(
            generatedAt=generated_at,
            totals=_totals(workers),
            queue=queue,
            workers=workers,
            message=None if workers else NO_WORKERS,
        )

    def worker(self, worker_id: str) -> WorkerStatus:
        if not self._redis_configured():
            raise HTTPException(status_code=503, detail=REDIS_NOT_CONFIGURED)
        snapshot = self._read_snapshot()
        if snapshot is None:
            raise HTTPException(status_code=503, detail=REDIS_UNAVAILABLE)
        for worker in self._classify(snapshot, self._clock()):
            if worker.id == worker_id:
                return worker
        raise HTTPException(status_code=404, detail=WORKER_NOT_FOUND)

    def _read_snapshot(self) -> Optional[RegistrySnapshot]:
        try:
            return self._repository.read_snapshot()
        except (RedisError, OSError, RuntimeError) as exc:
            # Class name only: connection errors can echo the Redis URL, which may hold a password.
            logger.warning("event=worker_status_redis_unavailable error=%s", type(exc).__name__)
            return None

    def _classify(self, snapshot: RegistrySnapshot, now: float) -> List[WorkerStatus]:
        workers: List[WorkerStatus] = []
        forget: List[str] = []
        stale_after = self.stale_after_seconds
        for worker_id in snapshot.worker_ids:
            heartbeat = snapshot.heartbeats.get(worker_id)
            if heartbeat is not None:
                last = _parse_iso(heartbeat.get("lastHeartbeatAt"))
                age = max(0, int(now - last)) if last is not None else None
                if age is None or age > stale_after:
                    status = "stale"
                elif heartbeat.get("status") == "draining":
                    status = "draining"
                else:
                    status = "online"
                workers.append(_from_heartbeat(worker_id, heartbeat, status, age))
                continue
            seen_ms = snapshot.last_seen_ms.get(worker_id)
            age = max(0, int(now - seen_ms / 1000)) if seen_ms is not None else None
            if age is None or age > FORGET_AFTER_SECONDS:
                forget.append(worker_id)
                continue
            workers.append(
                WorkerStatus(
                    id=worker_id,
                    status="stale",
                    heartbeatAgeSec=age,
                    lastHeartbeatAt=_iso(seen_ms / 1000),
                )
            )
        if forget:
            try:
                self._repository.forget_workers(forget)
                logger.info("event=workers_forgotten count=%d", len(forget))
            except (RedisError, OSError) as exc:
                logger.warning("event=workers_forget_failed error=%s", type(exc).__name__)
        order = {"online": 0, "draining": 1, "stale": 2}
        workers.sort(key=lambda worker: (order[worker.status], worker.hostname or "", worker.id))
        return workers

    def _batches_pending(self, now: float) -> Optional[int]:
        if self._batch_cache and now - self._batch_cache[0] < BATCH_DEPTH_CACHE_SECONDS:
            return self._batch_cache[1]
        try:
            depth = self._batch_depth.read_depth()
        except Exception as exc:  # optional metric: a missing function or Supabase hiccup must not fail the page
            logger.info("event=batch_queue_depth_unavailable error=%s", type(exc).__name__)
            depth = None
        self._batch_cache = (now, depth)
        return depth


def _from_heartbeat(worker_id: str, heartbeat: dict, status: str, age: Optional[int]) -> WorkerStatus:
    document = {**heartbeat, "id": worker_id, "status": status, "heartbeatAgeSec": age}
    try:
        return WorkerStatus.model_validate(document)
    except ValidationError:
        logger.warning("event=worker_heartbeat_invalid worker=%s", worker_id)
        return WorkerStatus(
            id=worker_id,
            status="stale",
            heartbeatAgeSec=age,
            lastHeartbeatAt=heartbeat.get("lastHeartbeatAt") if isinstance(heartbeat.get("lastHeartbeatAt"), str) else None,
        )


def _totals(workers: List[WorkerStatus]) -> WorkerTotals:
    totals = WorkerTotals(workers=len(workers))
    for worker in workers:
        if worker.status == "stale":
            totals.stale += 1
            continue
        if worker.status == "draining":
            totals.draining += 1
        else:
            totals.online += 1
        totals.slots += worker.concurrency
        totals.busy += worker.busy
        totals.idle += worker.idle
    return totals


def _parse_iso(value) -> Optional[float]:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")
