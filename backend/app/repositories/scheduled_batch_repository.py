"""Scheduled suite and project runs in Redis.

Same shape as single-case schedules (job_store.SCHEDULE_KEY): a record per schedule plus a zset
scored by the run time. The case list is not stored; it is resolved when the schedule fires.
"""

import json
from datetime import datetime, timezone
from typing import Callable, Optional

from redis import Redis

from app.queue.connection import get_redis_connection

RECORD_PREFIX = "testflow:scheduled-batch:"
SCHEDULE_KEY = "testflow:scheduled-batches"
# Keep the record a while past its run time so a slow promoter still finds it.
_GRACE_SECONDS = 60 * 60 * 48


class ScheduledBatchRepository:
    def __init__(self, connection_factory: Callable[[], Redis] = get_redis_connection):
        self._connection = connection_factory

    def save(self, record: dict, run_at: datetime) -> None:
        redis = self._connection()
        ttl = max(1, int(run_at.timestamp() - datetime.now(timezone.utc).timestamp())) + _GRACE_SECONDS
        with redis.pipeline() as pipe:
            pipe.set(RECORD_PREFIX + str(record["id"]), json.dumps(record), ex=ttl)
            pipe.zadd(SCHEDULE_KEY, {str(record["id"]): run_at.timestamp()})
            pipe.execute()

    def find(self, schedule_id: str) -> Optional[dict]:
        return _decode(self._connection().get(RECORD_PREFIX + schedule_id))

    def list_pending(self) -> list[dict]:
        """Records still waiting, soonest first. Ids whose record expired are skipped."""
        redis = self._connection()
        ids = [_text(item) for item in redis.zrange(SCHEDULE_KEY, 0, -1)]
        if not ids:
            return []
        raws = redis.mget([RECORD_PREFIX + schedule_id for schedule_id in ids])
        return [record for record in (_decode(raw) for raw in raws) if record is not None]

    def due_ids(self, now: datetime) -> list[str]:
        return [_text(item) for item in self._connection().zrangebyscore(SCHEDULE_KEY, "-inf", now.timestamp())]

    def claim(self, schedule_id: str) -> bool:
        """Atomically take a schedule out of the zset. Only the caller that removed it may run it."""
        return int(self._connection().zrem(SCHEDULE_KEY, schedule_id) or 0) == 1

    def delete_record(self, schedule_id: str) -> None:
        self._connection().delete(RECORD_PREFIX + schedule_id)

    def count(self) -> int:
        return int(self._connection().zcard(SCHEDULE_KEY) or 0)


def _text(value) -> str:
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def _decode(raw) -> Optional[dict]:
    if not raw:
        return None
    try:
        payload = json.loads(_text(raw))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return payload if isinstance(payload, dict) and payload.get("id") else None


scheduled_batch_repository = ScheduledBatchRepository()
