import os
import re
import subprocess
import sys
import time
from pathlib import Path

from fastapi import HTTPException

def _locate_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "automation" / "framework" / "testflow_harness.py").is_file():
            return parent
    return here.parents[3]


_REPO_ROOT = _locate_repo_root()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from automation.framework.config_loader import load_framework_config
from automation.framework.recorder import PlaywrightRecorder
from automation.framework.runner import TestRunner

_SEGMENT_RE = re.compile(r"^[\w\-]+$")


def _validate_segment(value: str, label: str) -> str:
    if not value or not _SEGMENT_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return value


def relative_script_path(project_id: str, test_case_id: str) -> str:
    project_id = _validate_segment(project_id, "project id")
    test_case_id = _validate_segment(test_case_id, "test case id")
    return f"automation/generated/{project_id}/{test_case_id}/test_recorded.py"


def _script_path_from_test_file(test_file: str) -> Path:
    normalized = test_file.replace("\\", "/").strip().lstrip("/")
    if not normalized:
        raise HTTPException(status_code=400, detail="No script path on test case")
    candidate = Path(normalized)
    resolved = candidate.resolve() if candidate.is_absolute() else (_REPO_ROOT / normalized).resolve()
    try:
        resolved.relative_to(_REPO_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid test script path")
    return resolved


def _ensure_playwright_browser_available() -> None:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            browser.close()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Playwright Chromium is not available to {sys.executable}: {exc}. "
                f"Install browsers with: {sys.executable} -m playwright install chromium"
            ),
        )


def record_test_case(title: str, start_url: str, project_id: str, test_case_id: str) -> str:
    _ensure_playwright_browser_available()
    settings = load_framework_config(_REPO_ROOT)
    relative_output = relative_script_path(project_id, test_case_id)
    recorder = PlaywrightRecorder(_REPO_ROOT, settings)
    exit_code, error_detail = recorder.record(
        title=title,
        url=start_url,
        output=relative_output,
        browser=settings.get("browser", "chromium"),
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=400,
            detail=error_detail or "Recording failed before a script could be saved.",
        )

    script_path = (_REPO_ROOT / relative_output).resolve()
    if not script_path.is_file() or script_path.stat().st_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Recording finished but the generated script file is missing or empty.",
        )
    return relative_output.replace("\\", "/")


def read_test_script(test_file: str) -> str:
    test_path = _script_path_from_test_file(test_file)
    if not test_path.is_file():
        return ""
    return test_path.read_text(encoding="utf-8")


def write_test_script(test_file: str, content: str) -> str:
    if not (content or "").strip():
        raise HTTPException(status_code=400, detail="Playwright script content is required")
    test_path = _script_path_from_test_file(test_file)
    test_path.parent.mkdir(parents=True, exist_ok=True)
    test_path.write_text(content, encoding="utf-8")
    return test_file.replace("\\", "/")


def run_test_case_script(test_file: str) -> tuple[str, float, str | None]:
    started = time.perf_counter()
    try:
        settings = load_framework_config(_REPO_ROOT)
        test_path = _script_path_from_test_file(test_file)

        if not test_path.is_file():
            raise HTTPException(status_code=400, detail="Recorded test script file was not found")

        harness_path = (_REPO_ROOT / "automation" / "framework" / "testflow_harness.py").resolve()
        if not harness_path.is_file():
            raise HTTPException(status_code=500, detail="TestFlow harness file is missing")

        runner = TestRunner(_REPO_ROOT, settings)
        # Phase 1 playback: always headless (no visible browser during Run Test).
        command = runner._build_command(harness_path, effective_headed=False)
        timeout_seconds = max(1, int(settings.get("execution_timeout_seconds", 300)))
        case_dir = test_path.parent
        env = {**os.environ, "TESTFLOW_CASE_DIR": str(case_dir)}

        result = subprocess.run(
            command,
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            shell=False,
            env=env,
        )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        duration = time.perf_counter() - started
        return "Failed", duration, f"Test exceeded the execution limit of {timeout_seconds} seconds."
    except OSError as exc:
        duration = time.perf_counter() - started
        return "Failed", duration, str(exc)
    except Exception as exc:
        duration = time.perf_counter() - started
        return "Failed", duration, str(exc)

    duration = time.perf_counter() - started
    if result.returncode == 0:
        return "Passed", duration, None

    combined = (result.stderr or "") + ("\n" + result.stdout if result.stdout else "")
    snippet = combined.strip()[-2000:] if combined.strip() else "Test execution failed."
    return "Failed", duration, snippet
