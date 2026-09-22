import os
import re
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


_SOURCE_LOCATION_RE = re.compile(r"^[\w./\\-]+\.py:\d+:\s+\w+")


def _clean_report_line(line: str) -> str:
    """Drop pytest source-context noise so testers see only the reason."""
    stripped = line.strip()
    if stripped.startswith(">"):
        return ""
    if _SOURCE_LOCATION_RE.match(stripped):
        return ""
    without_marker = line.lstrip("E ").strip()
    for prefix in ("AssertionError: ", "assert "):
        if without_marker.startswith(prefix):
            without_marker = without_marker[len(prefix) :]
            break
    return without_marker


def _extract_failure_message(output: str) -> Optional[str]:
    """Pull the assertion / Playwright error out of pytest output for the UI."""
    if not output:
        return None
    lines = [line.rstrip() for line in output.splitlines()]

    for marker in ("AssertionError", "Error:", "error:"):
        for position, line in enumerate(lines):
            if marker in line:
                # Wide enough to keep multi-line reports (accessibility, network) intact.
                block: list[str] = []
                for candidate in lines[position : position + 40]:
                    stripped = candidate.strip()
                    if not stripped:
                        continue
                    if stripped.startswith("===") or stripped.startswith("---"):
                        break
                    cleaned = _clean_report_line(candidate)
                    if cleaned:
                        block.append(cleaned)
                message = "\n".join(block).strip()
                if message:
                    return message[:3000]

    tail = "\n".join(line for line in lines if line.strip())[-3000:]
    return tail or None


def _run_testflow_harness(
    root: Path,
    settings: dict,
    case_dir: Path,
    headed: Optional[bool],
) -> tuple[int, Optional[str]]:
    from automation.framework.runner import TestRunner

    harness_path = (root / "automation" / "framework" / "testflow_harness.py").resolve()
    if not harness_path.is_file():
        return 2, "TestFlow harness file is missing."

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
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        return 124, f"Test exceeded the execution limit of {timeout_seconds} seconds."
    except OSError as exc:
        return 1, str(exc)

    combined = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    # Keep worker logs useful for debugging.
    if combined.strip():
        print(combined)
    if result.returncode == 0:
        return 0, None
    return int(result.returncode), _extract_failure_message(combined)


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
                "error_message": "; ".join(errors),
            }
        return_code, failure_message = _run_testflow_harness(
            root, settings, case_dir, headed=None
        )
        from automation.framework.result_handler import update_result

        status = "Pass" if return_code == 0 else "Fail"
        update_result(config_file, data, status, return_code)
    else:
        return_code = runner.run(config_file, confirm=False, headed=False)
        failure_message = None

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
            "error_message": "; ".join(errors) if errors else failure_message,
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
        "error_message": None if return_code == 0 else failure_message,
    }
