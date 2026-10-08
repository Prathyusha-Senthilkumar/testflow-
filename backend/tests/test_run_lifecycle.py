"""Run correctness: row before enqueue, conditional status writes, atomic cancel, stuck-run sweep."""

import json
from datetime import datetime, timedelta, timezone

import fakeredis
import pytest
from fastapi import HTTPException

from app.queue import job_store
from app.repositories.test_run_repository import TestRunRepository
from app.schemas.execution import StartExecutionRequest
from app.services import execution_service as execution_module
from app.services.execution_service import ExecutionService
from app.services.run_sweep_service import RunSweepService


class _FakeQueue:
    def __init__(self, calls, fail=False):
        self.calls = calls
        self.fail = fail

    def new_job_id(self):
        return "job-1"

    def submit(self, **kwargs):
        self.calls.append(("submit", kwargs["job_id"]))
        if self.fail:
            raise ConnectionError("redis down")
        return job_store.TestJob({"id": kwargs["job_id"]})


def _request():
    return StartExecutionRequest(config_path="tests/demo/data.json", test_case_id="case-1")


def _patch(monkeypatch, calls, *, queue_fails=False, insert_fails=False):
    monkeypatch.setattr(execution_module, "get_queue_service", lambda: _FakeQueue(calls, queue_fails))

    def create_queued(**kwargs):
        calls.append(("insert", kwargs["job_id"]))
        if insert_fails:
            raise RuntimeError("db down")
        return "run-1"

    monkeypatch.setattr(execution_module.test_run_repository, "create_queued", create_queued)
    monkeypatch.setattr(
        execution_module.test_run_repository,
        "mark_result",
        lambda job_id, status, duration, error: calls.append(("mark_result", job_id, status, error)),
    )


def test_run_row_is_inserted_before_enqueue(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls)
    result = ExecutionService().start(_request())
    assert calls == [("insert", "job-1"), ("submit", "job-1")]
    assert result.job_id == "job-1"
    assert result.test_run_id == "run-1"


def test_failed_insert_never_enqueues(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls, insert_fails=True)
    with pytest.raises(HTTPException) as exc:
        ExecutionService().start(_request())
    assert exc.value.status_code == 503
    assert [c[0] for c in calls] == ["insert"]


def test_failed_enqueue_closes_the_row(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls, queue_fails=True)
    with pytest.raises(HTTPException) as exc:
        ExecutionService().start(_request())
    assert exc.value.status_code == 503
    assert calls[-1][0] == "mark_result"
    assert calls[-1][2] == "Failed"
    assert calls[-1][3].startswith("Test not started")


class _Query:
    """Records the supabase-py builder chain."""

    def __init__(self, log, data=None):
        self.log = log
        self.data = data or []

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.log.append((name, args))
            return self

        return call

    def execute(self):
        self.log.append(("execute", ()))
        return type("Res", (), {"data": self.data})()


class _Db:
    def __init__(self, data=None):
        self.log: list = []
        self.data = data

    def from_(self, table):
        self.log.append(("from_", (table,)))
        return _Query(self.log, self.data)


def _repo(db):
    repo = TestRunRepository()
    type(repo).db = property(lambda self: db)  # type: ignore[assignment]
    return repo


@pytest.fixture
def fake_db():
    original = TestRunRepository.db
    db = _Db()
    yield db
    TestRunRepository.db = original  # type: ignore[assignment]


def test_mark_result_only_updates_active_runs(fake_db):
    _repo(fake_db).mark_result("job-1", "Passed", 10, None)
    assert ("in_", ("status", ["Queued", "Running"])) in fake_db.log
    assert ("eq", ("job_id", "job-1")) in fake_db.log


def test_mark_running_only_from_queued(fake_db):
    _repo(fake_db).mark_running("job-1")
    assert ("in_", ("status", ["Queued"])) in fake_db.log


def test_mark_cancelled_only_updates_active_runs(fake_db):
    _repo(fake_db).mark_cancelled("job-1")
    assert ("in_", ("status", ["Queued", "Running"])) in fake_db.log


def test_fail_if_active_is_conditional(fake_db):
    _repo(fake_db).fail_if_active(["r1"], "x")
    assert ("in_", ("id", ["r1"])) in fake_db.log
    assert ("in_", ("status", ["Queued", "Running"])) in fake_db.log


@pytest.fixture
def redis(monkeypatch):
    server = fakeredis.FakeRedis()
    monkeypatch.setattr(job_store, "get_redis_connection", lambda: server)
    return server


def _store(redis, job_id, state, **extra):
    redis.set(job_store.JOB_PREFIX + job_id, json.dumps({"id": job_id, "state": state, **extra}))


def test_cancel_does_not_overwrite_a_finished_job(redis):
    _store(redis, "j1", "completed", result={"steps": []})
    assert job_store.request_cancel("j1") == "completed"
    payload = json.loads(redis.get(job_store.JOB_PREFIX + "j1"))
    assert payload["state"] == "completed"
    assert payload["result"] == {"steps": []}


def test_cancel_removes_a_queued_job(redis):
    _store(redis, "j2", "queued")
    redis.lpush(job_store.QUEUE_KEY, "j2")
    assert job_store.request_cancel("j2") == "cancelled"
    assert redis.llen(job_store.QUEUE_KEY) == 0
    assert json.loads(redis.get(job_store.JOB_PREFIX + "j2"))["state"] == "cancelled"


def test_cancel_missing_job(redis):
    assert job_store.request_cancel("nope") == "missing"


class _SweepRuns:
    def __init__(self, rows):
        self.rows = rows
        self.failed: list[str] = []
        self.message = ""

    def find_stale_active(self, cutoff):
        self.cutoff = cutoff
        return self.rows

    def fail_if_active(self, run_ids, message):
        self.failed = list(run_ids)
        self.message = message
        return len(run_ids)


def test_sweep_fails_only_runs_that_cannot_progress():
    server = fakeredis.FakeRedis()
    server.lpush("testflow:queue", "in-queue")
    server.zadd("testflow:scheduled", {"scheduled": 9999999999})
    server.set("testflow:job:alive", json.dumps({"id": "alive", "state": "running", "claimedBy": "w1"}))
    server.set("testflow:lease:w1", "1")
    server.set("testflow:job:dead", json.dumps({"id": "dead", "state": "running", "claimedBy": "w2"}))
    rows = [
        {"id": "r-queue", "job_id": "in-queue", "status": "Queued"},
        {"id": "r-sched", "job_id": "scheduled", "status": "Queued"},
        {"id": "r-lost", "job_id": "lost", "status": "Queued"},
        {"id": "r-alive", "job_id": "alive", "status": "Running"},
        {"id": "r-dead", "job_id": "dead", "status": "Running"},
        {"id": "r-nojob", "job_id": None, "status": "Running"},
    ]
    runs = _SweepRuns(rows)
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    changed = RunSweepService(runs, redis_factory=lambda: server).sweep(now=now, minutes=60)
    assert changed == 3
    assert sorted(runs.failed) == ["r-dead", "r-lost", "r-nojob"]
    assert "60 minutes" in runs.message
    assert runs.cutoff == (now - timedelta(minutes=60)).isoformat()
