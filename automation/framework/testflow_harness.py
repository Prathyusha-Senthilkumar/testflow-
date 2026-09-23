import importlib.util
import json
import os
from pathlib import Path

from playwright.sync_api import Page

from automation.framework.accessibility import assert_accessibility
from automation.framework.assertions import run_assertions
from automation.framework.browser_storage import apply_storage_seeds, assert_storage_entries
from automation.framework.network_monitor import NetworkMonitor, assert_no_network_failures


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

    # Seed storage/cookies on the start-URL origin before the recorded actions run.
    apply_storage_seeds(page, meta.get("storageSeeds"), meta.get("resolvedStartUrl") or "")

    # Accessibility and network checks always run. Saved flags cannot turn them off.
    network_monitor = NetworkMonitor(page)
    network_monitor.start()
    try:
        recorded_test(page)

        expected_result = (meta.get("expectedResult") or "").strip()
        if expected_result:
            # The Assert input is a visible-text expectation, regardless of its length.
            run_assertions(page, [{"type": "text_visible", "value": expected_result}])
        else:
            assertions = meta.get("assertions") or []
            if assertions:
                run_assertions(page, assertions)

        # Every configured storage/cookie expectation must also hold.
        assert_storage_entries(page, meta.get("storageAssertions"))

        assert_accessibility(page)
        assert_no_network_failures(network_monitor.failures)
    finally:
        network_monitor.stop()
