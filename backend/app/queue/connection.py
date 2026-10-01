from functools import lru_cache
from typing import Optional

from redis import Redis
from rq import Queue

from app.config import settings

TEST_EXECUTION_QUEUE_NAME = "testflow-test-execution"


def _require_redis_url() -> str:
    url = settings.REDIS_URL
    if not url or not url.strip():
        raise RuntimeError(
            "REDIS_URL is not configured. Set REDIS_URL in the environment or backend .env file."
        )
    return url.strip()


@lru_cache
def get_redis_connection() -> Redis:
    return Redis.from_url(_require_redis_url())


@lru_cache
def get_test_execution_queue() -> Queue:
    return Queue(
        TEST_EXECUTION_QUEUE_NAME,
        connection=get_redis_connection(),
    )
