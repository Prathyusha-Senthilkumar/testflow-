import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import HTTPException

from app.config import settings

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


def _recording_delegate_url() -> str | None:
    url = os.environ.get("RECORDING_DELEGATE_URL") or settings.RECORDING_DELEGATE_URL
    return url.strip() if url and url.strip() else None


def run_playwright_recording(
    title: str,
    start_url: str,
    relative_output: str,
    load_storage: str | None = None,
) -> None:
    """Run headed Playwright codegen on this machine (host dev recorder or local API)."""
    _ensure_playwright_browser_available()
    framework_settings = load_framework_config(_REPO_ROOT)
    recorder = PlaywrightRecorder(_REPO_ROOT, framework_settings)
    exit_code, error_detail = recorder.record(
        title=title,
        url=start_url,
        output=relative_output,
        browser=framework_settings.get("browser", "chromium"),
        load_storage=load_storage,
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=400,
            detail=error_detail or "Recording failed before a script could be saved.",
        )


def _record_via_delegate(
    delegate_base: str,
    title: str,
    start_url: str,
    relative_output: str,
    load_storage: str | None = None,
) -> None:
    body: dict = {"title": title, "url": start_url, "output": relative_output}
    if load_storage:
        # Auth Profile session reuse; forwarded so the host recorder can apply it.
        body["loadStorage"] = load_storage
    payload = json.dumps(body).encode("utf-8")
    url = f"{delegate_base.rstrip('/')}/record"
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60 * 60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            err_payload = json.loads(exc.read().decode("utf-8"))
            detail = err_payload.get("detail") or err_payload.get("message") or str(exc)
        except Exception:
            detail = str(exc)
        raise HTTPException(status_code=400, detail=detail) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Host Playwright recorder is not reachable. "
                f"Start it on your machine: python host_recorder_main.py "
                f"(expected at {delegate_base}). "
                f"Underlying error: {exc.reason}"
            ),
        ) from exc

    if not body.get("ok"):
        raise HTTPException(status_code=400, detail=body.get("detail") or "Host recording failed.")


def record_test_case(
    title: str,
    start_url: str,
    project_id: str,
    test_case_id: str,
    load_storage: str | None = None,
) -> str:
    relative_output = relative_script_path(project_id, test_case_id)
    delegate = _recording_delegate_url()
    if delegate:
        _record_via_delegate(delegate, title, start_url, relative_output, load_storage)
    else:
        run_playwright_recording(title, start_url, relative_output, load_storage)

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


def record_auth_profile_login(login_url: str, save_path: Path) -> None:
    _ensure_playwright_browser_available()
    settings = load_framework_config(_REPO_ROOT)
    recorder = PlaywrightRecorder(_REPO_ROOT, settings)
    exit_code, error_detail = recorder.record_storage_state(
        url=login_url,
        save_path=save_path,
        browser=settings.get("browser", "chromium"),
    )
    if exit_code != 0:
        raise HTTPException(
            status_code=400,
            detail=error_detail or "Login recording did not save a session.",
        )


def run_test_case_script(
    test_file: str, storage_state_path: str | None = None
) -> tuple[str, float, str | None]:
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
        if storage_state_path:
            env["TESTFLOW_STORAGE_STATE"] = storage_state_path

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
