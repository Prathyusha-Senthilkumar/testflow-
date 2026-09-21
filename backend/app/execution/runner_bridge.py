import os
import subprocess
from pathlib import Path
from typing import Any, Optional

from app.execution.paths import ensure_testflow_on_sys_path, get_testflow_project_root


def _resolve_config_path(config_path: str) -> Path:
    relative = config_path.strip().replace("\\", "/")
    if not relative:
        raise ValueError("config_path must be a non-empty path relative to the TestFlow project root")

    root = get_testflow_project_root()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        raise ValueError("config_path must stay inside the TestFlow project root") from None

    return candidate


def _run_testflow_harness(
    root: Path,
    settings: dict,
    case_dir: Path,
    headed: Optional[bool],
) -> int:
    from automation.framework.runner import TestRunner

    harness_path = (root / "automation" / "framework" / "testflow_harness.py").resolve()
    if not harness_path.is_file():
        return 2

    # Match automation_service.run_test_case_script: playback is headless (no display in worker).
    runner = TestRunner(root, settings)
    command = runner._build_command(harness_path, effective_headed=False)
    timeout_seconds = max(1, int(settings.get("execution_timeout_seconds", 300)))
    env = {**os.environ, "TESTFLOW_CASE_DIR": str(case_dir.resolve())}

    try:
        result = subprocess.run(
            command,
            cwd=root,
            timeout=timeout_seconds,
            env=env,
        )
        return int(result.returncode)
    except subprocess.TimeoutExpired:
        return 124
    except OSError:
        return 1


def execute_test_case_config(
    config_path: str,
    headed: Optional[bool] = None,
) -> dict[str, Any]:
    """
    Run one test case via automation/framework/runner.py (pytest + Playwright).

    config_path is relative to the repo root, e.g. tests/admissions/data.json
    """
    ensure_testflow_on_sys_path()
    from automation.framework.config_loader import load_config, load_framework_config
    from automation.framework.runner import TestRunner

    root = get_testflow_project_root()
    config_file = _resolve_config_path(config_path)
    relative_config = config_file.relative_to(root).as_posix()

    settings = load_framework_config(root)
    runner = TestRunner(root, settings)
    case_dir = config_file.parent
    meta_path = case_dir / "testflow.meta.json"
    if meta_path.is_file():
        data, errors = runner.validate(config_file)
        if errors:
            return {
                "success": False,
                "status": "Fail",
                "pytest_return_code": 2,
                "config_path": relative_config,
                "title": None,
                "test_file_location": None,
                "test_case_location": None,
                "validation_errors": errors,
            }
        return_code = _run_testflow_harness(root, settings, case_dir, headed=None)
        from automation.framework.result_handler import update_result

        status = "Pass" if return_code == 0 else "Fail"
        update_result(config_file, data, status, return_code)
    else:
        return_code = runner.run(config_file, confirm=False, headed=False)

    if return_code == 2:
        _, errors = runner.validate(config_file)
        return {
            "success": False,
            "status": "Fail",
            "pytest_return_code": return_code,
            "config_path": relative_config,
            "title": None,
            "test_file_location": None,
            "test_case_location": None,
            "validation_errors": errors,
        }

    data = load_config(config_file)
    status = data.get("test_result", "Fail")
    return {
        "success": return_code == 0,
        "status": status,
        "pytest_return_code": return_code,
        "config_path": relative_config,
        "title": data.get("title"),
        "test_file_location": data.get("test_file_location"),
        "test_case_location": data.get("test_case_location"),
        "validation_errors": None,
    }
