import random

from app.queue.redis_oom import OOM_BACKOFF_MAX_SECONDS, OOM_BACKOFF_MIN_SECONDS, is_redis_oom, oom_backoff_seconds


def test_oom_text_is_not_every_redis_error():
    assert is_redis_oom(RuntimeError("OOM command not allowed when used memory > 'maxmemory'."))
    wrapped = RuntimeError("Could not queue the test run")
    wrapped.__cause__ = RuntimeError("OOM command not allowed when used memory > 'maxmemory'.")
    assert is_redis_oom(wrapped)
    assert not is_redis_oom(ConnectionError("Connection refused"))
    assert not is_redis_oom(RuntimeError("LOADING Redis is loading the dataset in memory"))
    assert not is_redis_oom(RuntimeError("JavaScript heap out of memory"))


def test_oom_backoff_is_at_least_thirty_seconds_and_capped():
    delays = [oom_backoff_seconds(random.Random(seed)) for seed in range(20)]
    assert min(delays) >= OOM_BACKOFF_MIN_SECONDS
    assert max(delays) <= OOM_BACKOFF_MAX_SECONDS
    assert max(delays) - min(delays) > 1
