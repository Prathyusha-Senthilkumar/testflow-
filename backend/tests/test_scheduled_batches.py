"""Scheduled suite and project runs: validation, list/cancel, and firing exactly once."""

from datetime import datetime, timedelta, timezone

import fakeredis
import pytest
from fastapi.testclient import TestClient

from auth_helpers import auth_headers
from app.main import app
from app.repositories import scheduled_batch_repository as schedule_repo_module
from app.repositories.worker_status_repository import WorkerStatusRepository
from app.services import batch_queue as batch_queue_module
from app.services import execution_service as execution_module
from app.services.execution_service import ExecutionService

client = TestClient(app, headers=auth_headers())


@pytest.fixture
def redis(monkeypatch):
    server = fakeredis.FakeRedis()
    monkeypatch.setattr(schedule_repo_module.scheduled_batch_repository, "_connection", lambda: server)
    monkeypatch.setattr(execution_module, "get_redis_connection", lambda: server)
    monkeypatch.setattr(batch_queue_module, "get_redis_connection", lambda: server)
    return server


def _future(minutes: int = 60) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _project_with_suite(name: str = "Schedule Project"):
    res = client.post("/api/projects", json={"name": name, "baseUrl": "https://example.com"})
    assert res.status_code == 200, res.text
    project_id = res.json()["id"]
    env = client.post(
        f"/api/projects/{project_id}/environments",
        json={"name": "QA", "baseUrl": "https://qa.example.com"},
    )
    assert env.status_code == 200, env.text
    environment_id = env.json()["id"]
    suite = client.post(f"/api/projects/{project_id}/test-suites", json={"name": "Nightly", "category": "smoke"})
    assert suite.status_code == 200, suite.text
    return project_id, suite.json()["id"], environment_id


def _add_case(project_id: str, suite_id: str, name: str) -> str:
    case = client.post(
        f"/api/projects/{project_id}/test-cases",
        json={"name": name, "category": "Functional", "scenario": "Happy Path"},
    )
    assert case.status_code == 200, case.text
    case_id = case.json()["id"]
    added = client.post(
        f"/api/projects/{project_id}/test-suites/{suite_id}/test-cases", json={"testCaseIds": [case_id]}
    )
    assert added.status_code == 200, added.text
    return case_id


def _schedule_suite(project_id, suite_id, environment_id, **overrides):
    body = {
        "projectId": project_id,
        "suiteId": suite_id,
        "environmentId": environment_id,
        "runAt": _future(),
        "timeZone": "Europe/London",
        **overrides,
    }
    return client.post("/api/executions/suites/schedule", json=body)


def test_schedule_rejects_past_time(redis):
    project_id, suite_id, environment_id = _project_with_suite()
    res = _schedule_suite(project_id, suite_id, environment_id, runAt=_future(-5))
    assert res.status_code == 400
    assert res.json()["message"] == "Choose a date and time in the future."
    assert redis.zcard("testflow:scheduled-batches") == 0


def test_schedule_rejects_bad_time_zone(redis):
    project_id, suite_id, environment_id = _project_with_suite()
    res = _schedule_suite(project_id, suite_id, environment_id, timeZone="Mars/Olympus")
    assert res.status_code == 400
    assert res.json()["message"] == "Choose a valid timezone."


def test_schedule_rejects_naive_time(redis):
    project_id, suite_id, environment_id = _project_with_suite()
    naive = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None).isoformat()
    res = _schedule_suite(project_id, suite_id, environment_id, runAt=naive)
    assert res.status_code == 400


def test_schedule_rejects_environment_from_another_project(redis):
    project_id, suite_id, _ = _project_with_suite("Owner")
    other_project, _, _ = _project_with_suite("Other")
    created = client.post(
        f"/api/projects/{other_project}/environments",
        json={"name": "Staging", "baseUrl": "https://staging.example.com"},
    )
    assert created.status_code == 200, created.text
    res = _schedule_suite(project_id, suite_id, created.json()["id"])
    assert res.status_code == 400
    assert res.json()["message"] == "That environment is not available for this project."


def test_schedule_rejects_unknown_suite_and_category(redis):
    project_id, _, environment_id = _project_with_suite()
    assert _schedule_suite(project_id, "missing-suite", environment_id).status_code == 404
    res = client.post(
        "/api/executions/projects/schedule",
        json={
            "projectId": project_id,
            "environmentId": environment_id,
            "suiteCategory": "nope",
            "runAt": _future(),
            "timeZone": "UTC",
        },
    )
    assert res.status_code == 400


def test_list_filters_and_cancel(redis):
    project_id, suite_id, environment_id = _project_with_suite()
    suite_res = _schedule_suite(project_id, suite_id, environment_id, runAt=_future(120))
    assert suite_res.status_code == 200, suite_res.text
    scheduled = suite_res.json()
    assert scheduled["batchType"] == "suite"
    assert scheduled["suiteName"] == "Nightly"
    assert scheduled["timeZone"] == "Europe/London"
    assert scheduled["runBy"]

    project_res = client.post(
        "/api/executions/projects/schedule",
        json={
            "projectId": project_id,
            "environmentId": environment_id,
            "suiteCategory": "smoke",
            "runAt": _future(30),
            "timeZone": "UTC",
        },
    )
    assert project_res.status_code == 200, project_res.text
    assert project_res.json()["suiteCategory"] == "smoke"

    listed = client.get("/api/executions/scheduled-batches", params={"projectId": project_id}).json()
    assert [item["batchType"] for item in listed] == ["project", "suite"]  # soonest first
    by_suite = client.get("/api/executions/scheduled-batches", params={"suiteId": suite_id}).json()
    assert [item["id"] for item in by_suite] == [scheduled["id"]]

    assert client.delete(f"/api/executions/scheduled-batches/{scheduled['id']}").status_code == 204
    assert client.delete(f"/api/executions/scheduled-batches/{scheduled['id']}").status_code == 404
    remaining = client.get("/api/executions/scheduled-batches", params={"projectId": project_id}).json()
    assert [item["batchType"] for item in remaining] == ["project"]


def test_due_schedule_fires_exactly_once_with_cases_added_later(redis):
    project_id, suite_id, environment_id = _project_with_suite()
    _add_case(project_id, suite_id, "Login")
    res = _schedule_suite(project_id, suite_id, environment_id, runAt=_future(10))
    assert res.status_code == 200, res.text
    _add_case(project_id, suite_id, "Logout")  # added after scheduling, still runs

    service = ExecutionService()
    assert service.promote_due_batches(datetime.now(timezone.utc)) == []  # not due yet

    later = datetime.now(timezone.utc) + timedelta(minutes=11)
    first = service.promote_due_batches(later)
    second = ExecutionService().promote_due_batches(later)  # another process racing
    assert len(first) == 1
    assert second == []

    batch = service.get_batch(first[0])
    assert batch.batch_type == "suite"
    assert batch.suite_id == suite_id
    assert batch.environment_id == environment_id
    assert batch.total == 2
    assert redis.llen(batch_queue_module.REDIS_FALLBACK_KEY) == 1
    assert redis.zcard("testflow:scheduled-batches") == 0
    assert client.get("/api/executions/scheduled-batches", params={"projectId": project_id}).json() == []


def test_failed_fire_is_logged_and_dropped(redis, caplog):
    project_id, suite_id, environment_id = _project_with_suite()
    res = _schedule_suite(project_id, suite_id, environment_id, runAt=_future(1))
    assert res.status_code == 200
    assert client.delete(f"/api/projects/{project_id}/test-suites/{suite_id}").status_code in (200, 204)

    with caplog.at_level("ERROR", logger="testflow.execution"):
        started = ExecutionService().promote_due_batches(datetime.now(timezone.utc) + timedelta(minutes=2))
    assert started == []
    assert "event=scheduled_batch_failed" in caplog.text
    assert redis.zcard("testflow:scheduled-batches") == 0


def test_runner_status_counts_scheduled_batches(redis):
    redis.zadd("testflow:scheduled", {"job-1": 1})
    redis.zadd("testflow:scheduled-batches", {"sched-1": 1, "sched-2": 2})
    snapshot = WorkerStatusRepository(lambda: redis).read_snapshot()
    assert snapshot.scheduled == 3
