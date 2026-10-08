from functools import lru_cache

from redis import Redis

from app.config import settings


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
def get_status_redis_connection() -> Redis:
    """Short timeouts for read-only status endpoints, so a dead Redis fails fast instead of hanging."""
    return Redis.from_url(_require_redis_url(), socket_connect_timeout=2, socket_timeout=2)
