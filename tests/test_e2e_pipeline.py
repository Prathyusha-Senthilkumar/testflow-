"""
End-to-end pipeline: FastAPI queue -> Node worker -> Playwright JS -> stored result.

Run from the repository root (requires Node 18+ and Playwright browsers):

    pip install -r backend/requirements.txt pytest
    npm --prefix worker install
    npx --prefix worker playwright install chromium
    pytest tests/test_e2e_pipeline.py -s
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
WORKER_DIR = REPO_ROOT / "worker"
SAMPLE_SPEC = "tests/sample_test/test_sample.spec.js"
API_HOST = "127.0.0.1"
API_PORT = int(os.getenv("TESTFLOW_E2E_PORT", "3010"))
API_BASE = f"http://{API_HOST}:{API_PORT}"


def _wait_for_health(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            response = httpx.get(f"{API_BASE}/api/health", timeout=1.0)
            if response.status_code == 200 and response.json().get("status") == "ok":
                return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(0.3)
    raise RuntimeError(f"API did not become healthy: {last_error}")


@pytest.fixture(scope="module")
def pipeline():
    env = os.environ.copy()
    env["PORT"] = str(API_PORT)
    env["PYTHONPATH"] = str(BACKEND_DIR)
    env["PROJECT_ROOT"] = str(REPO_ROOT)
    env["API_BASE_URL"] = API_BASE
    env["POLL_INTERVAL_MS"] = "400"

    artifacts_dir = REPO_ROOT / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    api_log = open(artifacts_dir / "e2e-api.log", "wb")
    worker_log = open(artifacts_dir / "e2e-worker.log", "wb")
    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", API_HOST, "--port", str(API_PORT)],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=api_log,
        stderr=subprocess.STDOUT,
    )
    try:
        _wait_for_health()
        worker_proc = subprocess.Popen(
            ["node", "src/worker.js"],
            cwd=str(WORKER_DIR),
            env=env,
            stdout=worker_log,
            stderr=subprocess.STDOUT,
        )
        try:
            yield {"api": api_proc, "worker": worker_proc}
        finally:
            worker_proc.terminate()
            try:
                worker_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker_proc.kill()
            worker_log.close()
    finally:
        api_proc.terminate()
        try:
            api_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            api_proc.kill()
        api_log.close()


def test_full_execution_pipeline(pipeline):
    worker_cli = WORKER_DIR / "node_modules" / "@playwright" / "test" / "cli.js"
    if not worker_cli.exists():
        pytest.skip("worker dependencies missing; run npm --prefix worker install")

    create = httpx.post(
        f"{API_BASE}/executions",
        json={
            "test_case_id": SAMPLE_SPEC,
            "auth_profile_id": "auth_student_01",
            "execution_mode": "local",
        },
        timeout=10.0,
    )
    assert create.status_code == 201, create.text
    execution_id = create.json()["execution_id"]

    deadline = time.time() + 90
    last_status = None
    while time.time() < deadline:
        detail = httpx.get(f"{API_BASE}/executions/{execution_id}", timeout=5.0)
        assert detail.status_code == 200
        last_status = detail.json()["status"]
        if last_status in ("PASSED", "FAILED", "TIMEOUT", "CANCELLED"):
            break
        time.sleep(0.5)

    assert last_status == "PASSED", f"execution ended as {last_status}"

    result = httpx.get(f"{API_BASE}/results/{execution_id}", timeout=5.0)
    assert result.status_code == 200
    body = result.json()
    assert body["execution_id"] == execution_id
    assert body["status"] == "PASSED"
    assert body["exit_code"] == 0
    assert body["duration"] >= 0
    assert isinstance(body["artifacts"], list)

    worker_status = httpx.get(f"{API_BASE}/api/worker/status", timeout=5.0)
    assert worker_status.status_code == 200
    assert worker_status.json()["poll_count"] >= 1

    containers = httpx.get(f"{API_BASE}/api/containers", timeout=10.0)
    assert containers.status_code == 200
    assert isinstance(containers.json(), list)
