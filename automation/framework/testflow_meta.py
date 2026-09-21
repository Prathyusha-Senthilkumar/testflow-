import json
import re
from pathlib import Path


META_FILENAME = "testflow.meta.json"


def detect_recorded_test_name(script_path: Path) -> str:
    if not script_path.is_file():
        return "test_example"
    match = re.search(r"def (test_\w+)\s*\(", script_path.read_text(encoding="utf-8"))
    return match.group(1) if match else "test_example"


def case_dir_for_script(relative_test_file: str) -> Path:
    return Path(relative_test_file).parent


def write_meta(
    repo_root: Path,
    relative_test_file: str,
    start_path: str,
    resolved_start_url: str,
    assertions: list[dict],
    environment_id: str | None = None,
    expected_result: str | None = None,
) -> Path:
    case_dir = (repo_root / case_dir_for_script(relative_test_file)).resolve()
    case_dir.mkdir(parents=True, exist_ok=True)
    meta_path = case_dir / META_FILENAME
    script_path = (repo_root / relative_test_file.replace("\\", "/")).resolve()
    payload = {
        "startPath": start_path or "/",
        "environmentId": environment_id,
        "resolvedStartUrl": resolved_start_url,
        "assertions": assertions,
        "expectedResult": (expected_result or "").strip() or None,
        "recordedModule": script_path.name if script_path.name else "test_recorded.py",
        "recordedTestName": detect_recorded_test_name(script_path),
    }
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return meta_path


def read_meta(repo_root: Path, relative_test_file: str) -> dict:
    meta_path = (repo_root / case_dir_for_script(relative_test_file) / META_FILENAME).resolve()
    if not meta_path.is_file():
        return {
            "startPath": "/",
            "resolvedStartUrl": "",
            "assertions": [],
            "expectedResult": None,
            "recordedModule": "test_recorded.py",
            "recordedTestName": "test_recorded",
        }
    return json.loads(meta_path.read_text(encoding="utf-8"))
