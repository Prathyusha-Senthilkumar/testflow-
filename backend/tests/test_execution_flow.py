import json
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.execution_repository import execution_repository

client = TestClient(app)

SAMPLE_SPEC = "tests/sample_test/test_sample.spec.js"


def run_async(coro):
    return asyncio.run(coro)


def test_create_auth_profile():
    dto = {
        "id": "test_student_profile",
        "name": "Test Student Profile",
        "description": "Student authorized session",
        "type": "playwright_storage_state",
        "storage_state_path": "auth/student.json",
        "extra_headers": {"Authorization": "Bearer supersecret123"},
        "is_active": True
    }
    response = client.post("/auth-profiles", json=dto)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "test_student_profile"
    assert data["name"] == "Test Student Profile"
    assert data["has_headers"] is True
    assert "extra_headers" not in data
    assert "supersecret123" not in json.dumps(data)


def test_list_auth_profiles():
    response = client.get("/auth-profiles")
    assert response.status_code == 200
    profiles = response.json()
    assert isinstance(profiles, list)
    assert any(p["id"] == "auth_student_01" for p in profiles)


def test_get_auth_profile():
    response = client.get("/auth-profiles/auth_student_01")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "auth_student_01"
    assert data["type"] == "playwright_storage_state"


def test_update_auth_profile():
    update_dto = {
        "name": "Updated Student Session",
        "description": "Updated description"
    }
    response = client.put("/auth-profiles/auth_student_01", json=update_dto)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Student Session"


def test_validate_auth_profile():
    response = client.post("/auth-profiles/auth_student_01/validate")
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["profile_id"] == "auth_student_01"
    assert "cookies_count" in data["details"]


def test_delete_auth_profile():
    response = client.delete("/auth-profiles/test_student_profile")
    assert response.status_code == 200
    assert "deactivated" in response.json()["message"]


def test_health_and_worker_status():
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    status = client.get("/api/worker/status")
    assert status.status_code == 200
    body = status.json()
    assert "connected" in body
    assert "poll_count" in body


def test_list_containers_endpoint():
    response = client.get("/api/containers")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_enqueue_execution_and_duplicate_prevention():
    dto = {
        "test_case_id": SAMPLE_SPEC,
        "auth_profile_id": "auth_student_01",
        "execution_mode": "local"
    }
    response = client.post("/executions", json=dto)
    assert response.status_code in (201, 409)
    if response.status_code == 201:
        job = response.json()
        assert job["status"] == "QUEUED"
        assert job["test_case_id"] == dto["test_case_id"]

        dup_resp = client.post("/executions", json=dto)
        assert dup_resp.status_code == 409


def test_get_and_list_executions():
    list_resp = client.get("/executions")
    assert list_resp.status_code == 200
    executions = list_resp.json()
    assert isinstance(executions, list)
    assert len(executions) > 0

    single_id = executions[0]["id"]
    get_resp = client.get(f"/executions/{single_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == single_id


def test_cancel_execution():
    dto = {
        "test_case_id": "test_to_cancel.spec.js",
        "execution_mode": "local"
    }
    resp = client.post("/executions", json=dto)
    assert resp.status_code == 201
    exec_id = resp.json()["execution_id"]

    cancel_resp = client.post(f"/executions/{exec_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "CANCELLED"


def test_internal_poll_and_result():
    import uuid
    from app.models.execution import ExecutionJob, ExecutionStatus

    async def drain_queued():
        while True:
            claimed = await execution_repository.claim_next_queued()
            if not claimed:
                return
            claimed.status = ExecutionStatus.CANCELLED
            await execution_repository.update_execution(claimed)

    run_async(drain_queued())

    exec_id = f"exec_poll_{uuid.uuid4().hex[:6]}"
    job = ExecutionJob(
        id=exec_id,
        test_case_id=SAMPLE_SPEC,
        auth_profile_id="auth_student_01",
        status=ExecutionStatus.QUEUED,
        execution_mode="local"
    )
    run_async(execution_repository.create_execution(job))

    poll = client.post("/api/internal/worker/poll")
    assert poll.status_code == 200
    payload = poll.json()
    assert payload["job"] is not None
    assert payload["job"]["id"] == exec_id
    assert payload["job"]["test_file"]
    assert Path(payload["job"]["test_file"]).name == "test_sample.spec.js"

    claimed = client.get(f"/executions/{exec_id}")
    assert claimed.json()["status"] == "RUNNING"

    empty_poll = client.post("/api/internal/worker/poll")
    assert empty_poll.status_code == 200
    assert empty_poll.json()["job"] is None

    result = client.post("/api/internal/worker/result", json={
        "execution_id": exec_id,
        "status": "PASSED",
        "exit_code": 0,
        "duration": 1.23,
        "stdout": "1 passed",
        "stderr": "",
        "artifacts": ["artifacts/executions/" + exec_id + "/logs/stdout.log"],
        "started_at": payload["job"]["started_at"],
        "completed_at": "2026-09-17T00:00:00+00:00",
        "runner_type": "local_fallback"
    })
    assert result.status_code == 200
    assert result.json()["status"] == "PASSED"

    stored = client.get(f"/results/{exec_id}")
    assert stored.status_code == 200
    assert stored.json()["status"] == "PASSED"
    assert stored.json()["duration"] == 1.23

    history = client.get(f"/test-cases/{SAMPLE_SPEC}/results")
    assert history.status_code == 200
    assert history.json()["total_runs"] >= 1
