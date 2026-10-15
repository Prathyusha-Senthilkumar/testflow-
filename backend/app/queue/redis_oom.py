"""Recognize a Redis maxmemory rejection and wait before the next write.

A full Redis rejects the command immediately. Callers that loop (batch dispatch, schedule
promotion) must not treat that like a dropped connection and retry a second later.
"""

import random

OOM_BACKOFF_MIN_SECONDS = 30
OOM_BACKOFF_MAX_SECONDS = 120

# Keep in sync with worker/src/redisOom.ts REDIS_FULL_MESSAGE.
REDIS_FULL_MESSAGE = "Redis is full, so this could not be saved. Free memory and try again."


def is_redis_oom(exc: BaseException) -> bool:
    text = _error_text(exc).lower()
    return "oom command not allowed when used memory" in text and "maxmemory" in text


def oom_backoff_seconds(rng: random.Random | None = None) -> float:
    """At least 30s, jittered, and never longer than the cap."""
    roll = (rng or random).random()
    span = OOM_BACKOFF_MAX_SECONDS - OOM_BACKOFF_MIN_SECONDS
    return OOM_BACKOFF_MIN_SECONDS + roll * span


def _error_text(exc: BaseException, seen: set[int] | None = None) -> str:
    seen = set() if seen is None else seen
    marker = id(exc)
    if marker in seen:
        return ""
    seen.add(marker)
    parts = [str(exc)]
    for linked in (exc.__cause__, exc.__context__):
        if isinstance(linked, BaseException):
            parts.append(_error_text(linked, seen))
    return " ".join(part for part in parts if part)
