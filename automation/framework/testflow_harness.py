import importlib.util
import json
import os
from pathlib import Path

from playwright.sync_api import Page

from automation.framework.assertions import run_assertions


def _load_recorded_test(case_dir: Path, module_name: str, test_name: str):
    script_path = case_dir / module_name
    if not script_path.is_file():
        raise FileNotFoundError(f"Recorded script not found: {script_path}")

    spec = importlib.util.spec_from_file_location("testflow_recorded", script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load recorded script: {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    test_fn = getattr(module, test_name, None)
    if test_fn is None:
        for attr_name in dir(module):
            if attr_name.startswith("test_") and callable(getattr(module, attr_name)):
                return getattr(module, attr_name)
    if test_fn is None:
        raise AttributeError(f"Recorded test '{test_name}' was not found in {module_name}")
    return test_fn


def test_testflow(page: Page) -> None:
    case_dir_raw = os.environ.get("TESTFLOW_CASE_DIR", "").strip()
    if not case_dir_raw:
        raise RuntimeError("TESTFLOW_CASE_DIR is not set")

    case_dir = Path(case_dir_raw).resolve()
    meta_path = case_dir / "testflow.meta.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Missing TestFlow metadata: {meta_path}")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    module_name = meta.get("recordedModule") or "test_recorded.py"
    test_name = meta.get("recordedTestName") or "test_example"

    recorded_test = _load_recorded_test(case_dir, module_name, test_name)
    recorded_test(page)

    expected_result = (meta.get("expectedResult") or "").strip()
    if expected_result:
        # Single slug-like values (from Arrange) assert URL reachability, not page copy.
        if " " not in expected_result and len(expected_result) <= 64:
            run_assertions(page, [{"type": "url_contains", "value": expected_result}])
        else:
            run_assertions(page, [{"type": "text_visible", "value": expected_result}])
    else:
        assertions = meta.get("assertions") or []
        if assertions:
            run_assertions(page, assertions)
