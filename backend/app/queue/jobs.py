"""RQ job callables for TestFlow test execution (worker will import from here)."""

import time
from typing import Any, Optional

from app.execution.runner_bridge import execute_test_case_config


def queue_healthcheck() -> str:
    """Minimal job for verifying enqueue connectivity without running Playwright."""
    return "ok"


def run_test_case_job(config_path: str, headed: Optional[bool] = None) -> dict[str, Any]:
    """
    Execute one test case using the existing automation TestRunner.

    Args:
        config_path: Path to the test data.json, relative to the TestFlow repo root
                     (same as automation CLI --config).
        headed: Optional override for headed/headless; uses framework.json when omitted.
    """
    from rq import get_current_job

    from app.repositories.test_run_repository import test_run_repository

    job = get_current_job()
    job_id = job.id if job else None

    if job_id:
        try:
            test_run_repository.mark_running(job_id)
        except Exception:  # pragma: no cover - persistence is best-effort
            pass

    started = time.perf_counter()
    result = execute_test_case_config(config_path, headed=headed)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if job_id:
        try:
            status = "Passed" if result.get("success") else "Failed"
            error = None
            if not result.get("success"):
                errors = result.get("validation_errors")
                error = (
                    "; ".join(errors)
                    if errors
                    else f"pytest return code {result.get('pytest_return_code')}"
                )
            test_run_repository.mark_result(job_id, status, duration_ms, error)
        except Exception:  # pragma: no cover - persistence is best-effort
            pass

    return result
