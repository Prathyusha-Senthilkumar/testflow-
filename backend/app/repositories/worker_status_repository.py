"""Reads the worker registry the Node worker writes (worker/src/workerStatus.ts) and queue depths.

Two pipelined round trips: registry + queue lengths, then MGET of heartbeats + per-worker
processing list lengths. No KEYS/SCAN.
"""

import json
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from redis import Redis

from app.database import get_supabase_client
from app.queue.connection import get_status_redis_connection

WORKER_KEY_PREFIX = "testflow:worker:"
WORKERS_SET_KEY = "testflow:workers"
WORKERS_SEEN_KEY = "testflow:workers:seen"
PROCESSING_PREFIX = "testflow:processing:"
QUEUE_KEY = "testflow:queue"
SCHEDULE_KEY = "testflow:scheduled"


@dataclass
class RegistrySnapshot:
    worker_ids: List[str]
    # id -> parsed heartbeat document, or None when the key expired / is unreadable.
    heartbeats: Dict[str, Optional[dict]]
    # id -> last heartbeat epoch ms, from the "seen" hash (survives the heartbeat key's TTL).
    last_seen_ms: Dict[str, Optional[int]]
    queued: int
    scheduled: int
    processing: int
    processing_by_worker: Dict[str, int] = field(default_factory=dict)


class WorkerStatusRepository:
    def __init__(self, connection_factory: Callable[[], Redis] = get_status_redis_connection):
        self._connection = connection_factory

    def read_snapshot(self) -> RegistrySnapshot:
        redis = self._connection()
        with redis.pipeline(transaction=False) as pipe:
            pipe.smembers(WORKERS_SET_KEY)
            pipe.hgetall(WORKERS_SEEN_KEY)
            pipe.llen(QUEUE_KEY)
            pipe.zcard(SCHEDULE_KEY)
            raw_ids, raw_seen, queued, scheduled = pipe.execute()

        worker_ids = sorted(_text(item) for item in raw_ids or [])
        seen = {_text(key): _int(value) for key, value in (raw_seen or {}).items()}
        heartbeats: Dict[str, Optional[dict]] = {}
        processing_by_worker: Dict[str, int] = {}
        if worker_ids:
            with redis.pipeline(transaction=False) as pipe:
                pipe.mget([WORKER_KEY_PREFIX + worker_id for worker_id in worker_ids])
                for worker_id in worker_ids:
                    pipe.llen(PROCESSING_PREFIX + worker_id)
                results = pipe.execute()
            for worker_id, raw in zip(worker_ids, results[0]):
                heartbeats[worker_id] = _json(raw)
            for worker_id, length in zip(worker_ids, results[1:]):
                processing_by_worker[worker_id] = int(length or 0)

        return RegistrySnapshot(
            worker_ids=worker_ids,
            heartbeats=heartbeats,
            last_seen_ms={worker_id: seen.get(worker_id) for worker_id in worker_ids},
            queued=int(queued or 0),
            scheduled=int(scheduled or 0),
            processing=sum(processing_by_worker.values()),
            processing_by_worker=processing_by_worker,
        )

    def forget_workers(self, worker_ids: List[str]) -> None:
        """Drop long-gone ids from the registry. Their processing lists are left to the reaper."""
        if not worker_ids:
            return
        redis = self._connection()
        with redis.pipeline(transaction=False) as pipe:
            pipe.srem(WORKERS_SET_KEY, *worker_ids)
            pipe.hdel(WORKERS_SEEN_KEY, *worker_ids)
            pipe.execute()


class BatchQueueDepthRepository:
    """Depth of the pgmq batch queue via testflow_batch_queue_depth() (service_role only)."""

    def read_depth(self) -> Optional[int]:
        client = get_supabase_client()
        if client is None:
            return None
        result = client.rpc("testflow_batch_queue_depth", {}).execute()
        data = result.data
        if isinstance(data, list):
            data = data[0] if data else None
        if isinstance(data, dict):
            data = next(iter(data.values()), None)
        return _int(data)


def _text(value) -> str:
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def _int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(_text(value))
    except (TypeError, ValueError):
        return None


def _json(raw) -> Optional[dict]:
    if not raw:
        return None
    try:
        value = json.loads(_text(raw))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


worker_status_repository = WorkerStatusRepository()
batch_queue_depth_repository = BatchQueueDepthRepository()
