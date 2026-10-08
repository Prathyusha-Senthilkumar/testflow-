"""GET /api/workers: heartbeat classification, totals, queue counts and the Redis-down fallback."""

import json
import time
from datetime import datetime, timezone

import fakeredis
import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from auth_helpers import auth_headers
from app.main import app
from app.repositories import worker_status_repository as repo_module
from app.repositories.worker_status_repository import WorkerStatusRepository
from app.routers.workers import get_worker_status_service
from app.services.worker_status_service import (
    NO_WORKERS,
    REDIS_NOT_CONFIGURED,
    REDIS_UNAVAILABLE,
    WorkerStatusService,
)

client = TestClient(app)
NOW = datetime(2026, 10, 8, 12, 0, 0, tzinfo=timezone.utc).timestamp()


class _Depth:
    def __init__(self, value=None, error=None):
        self.value, self.error, self.calls = value, error, 0

    def read_depth(self):
        self.calls += 1
        if self.error:
            raise self.error
        return self.value


def _iso(offset_sec: float) -> str:
    return datetime.fromtimestamp(NOW - offset_sec, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _heartbeat(worker_id, *, age=1, status="online", concurrency=5, running=0, **extra):
    slots = [
        {"index": i, "state": "running", "jobId": f"{worker_id}-job{i}", "runId": f"{worker_id}-job{i}",
         "testCaseId": f"tc{i}", "projectId": "p1", "testName": f"TC-00{i}", "startedAt": _iso(age + 30)}
        if i < running else {"index": i, "state": "idle"}
        for i in range(concurrency)
    ]
    return {
        "id": worker_id,
        "hostname": "worker-host",
        "pid": 7,
        "version": "1.0.0+abc1234",
        "startedAt": _iso(600),
        "lastHeartbeatAt": _iso(age),
        "status": status,
        "concurrency": concurrency,
        "busy": running,
        "idle": concurrency - running,
        "slots": slots,
        "browser": {"connected": True, "version": "140.0.7339.16", "contexts": running + 1},
        "warm": {"browserReady": True, "spareContexts": 1, "browserLaunchedAt": _iso(600),
                 "testsSinceLaunch": 12, "lastRecycleAt": None, "coldStartsAvoided": 9},
        "process": {"rssMb": 412.3, "heapUsedMb": 58.1, "uptimeSec": 600, "loadAvg1": 0.82, "cpuCount": 8},
        "processedTotal": 12,
        "failedTotal": 2,
        **extra,
    }


def _register(server, heartbeat, *, seen_age=None, with_key=True):
    worker_id = heartbeat["id"]
    server.sadd("testflow:workers", worker_id)
    seen_age = seen_age if seen_age is not None else 1
    server.hset("testflow:workers:seen", worker_id, str(int((NOW - seen_age) * 1000)))
    if with_key:
        server.set("testflow:worker:" + worker_id, json.dumps(heartbeat), ex=15)


@pytest.fixture
def server():
    return fakeredis.FakeRedis()


@pytest.fixture
def depth():
    return _Depth(value=None)


@pytest.fixture
def service(server, depth):
    svc = WorkerStatusService(
        WorkerStatusRepository(lambda: server),
        depth,
        interval_ms=5000,
        clock=lambda: NOW,
        redis_configured=lambda: True,
    )
    app.dependency_overrides[get_worker_status_service] = lambda: svc
    yield svc
    app.dependency_overrides.pop(get_worker_status_service, None)


def _get(path="/api/workers"):
    res = client.get(path, headers=auth_headers())
    assert res.status_code == 200, res.text
    return res.json()


def test_requires_auth():
    assert client.get("/api/workers").status_code == 401
    assert client.get("/api/workers").json() == {"message": "Sign in required."}
    assert client.get("/api/workers/w1").status_code == 401


def test_online_draining_and_stale_classification(server, service):
    _register(server, _heartbeat("w-online", age=2, running=2))
    _register(server, _heartbeat("w-draining", age=1, status="draining", concurrency=3, running=1))
    # Key still present but the heartbeat is older than 3 x 5 s.
    _register(server, _heartbeat("w-old-beat", age=20, concurrency=4, running=4))
    # Key expired; last seen 2 minutes ago.
    _register(server, _heartbeat("w-expired"), seen_age=120, with_key=False)

    body = _get()
    by_id = {w["id"]: w for w in body["workers"]}
    assert by_id["w-online"]["status"] == "online"
    assert by_id["w-online"]["heartbeatAgeSec"] == 2
    assert by_id["w-draining"]["status"] == "draining"
    assert by_id["w-old-beat"]["status"] == "stale"
    assert by_id["w-expired"]["status"] == "stale"
    assert by_id["w-expired"]["heartbeatAgeSec"] == 120
    assert by_id["w-expired"]["browser"] is None
    assert [w["status"] for w in body["workers"]] == ["online", "draining", "stale", "stale"]
    assert body["message"] is None


def test_totals_count_only_live_workers_slots(server, service):
    _register(server, _heartbeat("a", running=2, concurrency=5))
    _register(server, _heartbeat("b", status="draining", running=1, concurrency=3))
    _register(server, _heartbeat("c", age=60, running=4, concurrency=4))

    totals = _get()["totals"]
    assert totals == {"workers": 3, "online": 1, "draining": 1, "stale": 1, "slots": 8, "busy": 3, "idle": 5}


def test_queue_counts(server, service, depth):
    depth.value = 2
    _register(server, _heartbeat("a", running=2))
    _register(server, _heartbeat("b", running=1))
    server.lpush("testflow:queue", "q1", "q2", "q3", "q4")
    server.zadd("testflow:scheduled", {"s1": NOW + 3600})
    server.lpush("testflow:processing:a", "a-job0", "a-job1")
    server.lpush("testflow:processing:b", "b-job0")
    # Processing list of a worker that is not registered: not counted (no SCAN in the hot path).
    server.lpush("testflow:processing:ghost", "g1")

    assert _get()["queue"] == {"queued": 4, "scheduled": 1, "processing": 3, "batchesPending": 2}


def test_batches_pending_is_null_when_unknown_and_cached(server, service, depth):
    depth.error = RuntimeError("PGRST202 function not found")
    assert _get()["queue"]["batchesPending"] is None
    _get()
    assert depth.calls == 1


def test_gone_workers_are_pruned_after_ten_minutes(server, service):
    _register(server, _heartbeat("long-gone"), seen_age=11 * 60, with_key=False)
    server.sadd("testflow:workers", "never-seen")
    body = _get()
    assert body["workers"] == []
    assert server.smembers("testflow:workers") == set()
    assert server.hgetall("testflow:workers:seen") == {}


def test_no_heartbeats_returns_empty_list_with_message(server, service):
    # A worker on the old build: it consumes jobs but publishes no heartbeat keys.
    server.lpush("testflow:queue", "q1")
    body = _get()
    assert body["workers"] == []
    assert body["queue"]["queued"] == 1
    assert body["message"] == NO_WORKERS
    assert body["totals"]["workers"] == 0


def test_redis_unavailable_returns_message_not_500(depth):
    def down():
        raise RedisConnectionError("Error 111 connecting to redis://:pw@redis:6379")

    svc = WorkerStatusService(
        WorkerStatusRepository(down), depth, interval_ms=5000, clock=lambda: NOW, redis_configured=lambda: True
    )
    app.dependency_overrides[get_worker_status_service] = lambda: svc
    try:
        body = _get()
        assert body["workers"] == [] and body["queue"] is None
        assert body["message"] == REDIS_UNAVAILABLE
        assert "pw" not in json.dumps(body)
        res = client.get("/api/workers/w1", headers=auth_headers())
        assert res.status_code == 503 and res.json() == {"message": REDIS_UNAVAILABLE}
    finally:
        app.dependency_overrides.pop(get_worker_status_service, None)


def test_redis_not_configured(depth):
    svc = WorkerStatusService(
        WorkerStatusRepository(lambda: pytest.fail("must not connect")),
        depth,
        clock=lambda: NOW,
        redis_configured=lambda: False,
    )
    app.dependency_overrides[get_worker_status_service] = lambda: svc
    try:
        body = _get()
        assert body["workers"] == [] and body["queue"] is None and body["message"] == REDIS_NOT_CONFIGURED
    finally:
        app.dependency_overrides.pop(get_worker_status_service, None)


def test_single_worker_and_404(server, service):
    _register(server, _heartbeat("w1", running=1))
    body = _get("/api/workers/w1")
    assert body["id"] == "w1" and body["status"] == "online" and body["busy"] == 1
    res = client.get("/api/workers/nope", headers=auth_headers())
    assert res.status_code == 404 and "message" in res.json()


def test_unknown_heartbeat_fields_are_not_passed_through(server, service):
    _register(server, _heartbeat("w1", storageState={"cookies": ["secret"]}, environmentBaseUrl="https://x"))
    raw = json.dumps(_get())
    assert "storageState" not in raw and "environmentBaseUrl" not in raw


def test_default_repository_uses_the_short_timeout_connection():
    assert repo_module.worker_status_repository._connection is repo_module.get_status_redis_connection


def test_example_payload(server, service, depth, capsys):
    depth.value = 0
    _register(server, _heartbeat("worker-7f9c2-1-a1b2c3", age=2, running=2))
    server.lpush("testflow:queue", "q1", "q2", "q3", "q4")
    server.zadd("testflow:scheduled", {"s1": time.time() + 60})
    server.lpush("testflow:processing:worker-7f9c2-1-a1b2c3", "j1", "j2")
    body = _get()
    with capsys.disabled():
        print("\nEXAMPLE_PAYLOAD " + json.dumps(body))
    assert body["totals"]["busy"] == 2
