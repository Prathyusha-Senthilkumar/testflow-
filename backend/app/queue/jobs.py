"""RQ job callables for TestFlow test execution (worker will import from here)."""

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
    return execute_test_case_config(config_path, headed=headed)
