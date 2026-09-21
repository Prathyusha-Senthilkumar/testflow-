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
    return_code = runner.run(config_file, confirm=False, headed=headed)

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
