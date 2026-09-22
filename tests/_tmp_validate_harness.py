"""TEMPORARY end-to-end harness validation. Filesystem only - no Supabase writes."""
import json
import shutil
from pathlib import Path

from app.execution.runner_bridge import execute_test_case_config

CASE_REL = "automation/generated/_tmpcheck/case1"
CASE_DIR = Path("/app") / CASE_REL

SCRIPT = (
    "from playwright.sync_api import Page\n\n\n"
    "def test_recorded(page: Page) -> None:\n"
    '    page.goto("https://example.com", wait_until="domcontentloaded")\n'
)


def write_case(accessibility: bool, network: bool) -> None:
    CASE_DIR.mkdir(parents=True, exist_ok=True)
    (CASE_DIR / "test_recorded.py").write_text(SCRIPT, encoding="utf-8")
    (CASE_DIR / "test_case.md").write_text("# tmp check\n", encoding="utf-8")
    (CASE_DIR / "data.json").write_text(
        json.dumps(
            {
                "title": "tmp check",
                "test_file_location": f"{CASE_REL}/test_recorded.py",
                "test_case_location": f"{CASE_REL}/test_case.md",
                "test_result": "Not Run",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (CASE_DIR / "testflow.meta.json").write_text(
        json.dumps(
            {
                "startPath": "/",
                "resolvedStartUrl": "https://example.com",
                "assertions": [],
                "storageSeeds": [{"kind": "localStorage", "key": "theme", "value": "dark"}],
                "storageAssertions": [{"kind": "localStorage", "key": "theme", "value": "dark"}],
                "accessibilityEnabled": accessibility,
                "networkCheckEnabled": network,
                "expectedResult": "Example",
                "recordedModule": "test_recorded.py",
                "recordedTestName": "test_recorded",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def run(label: str, accessibility: bool, network: bool) -> None:
    write_case(accessibility, network)
    result = execute_test_case_config(f"{CASE_REL}/data.json")
    print(f"--- {label} ---")
    print("success:", result["success"], "| status:", result["status"], "| rc:", result["pytest_return_code"])
    if result.get("error_message"):
        print("message:")
        print(result["error_message"][:700])
    print()


BAD_A11Y_SCRIPT = (
    "from playwright.sync_api import Page\n\n\n"
    "def test_recorded(page: Page) -> None:\n"
    '    page.goto("https://example.com", wait_until="domcontentloaded")\n'
    '    page.set_content("<html><body>Example<input name=\\"email\\"><button></button></body></html>")\n'
)

BAD_NETWORK_SCRIPT = (
    "from playwright.sync_api import Page\n\n\n"
    "def test_recorded(page: Page) -> None:\n"
    '    page.goto("https://example.com/nope-not-here", wait_until="domcontentloaded")\n'
    '    page.set_content("<html lang=\\"en\\"><head><title>t</title></head><body>Example</body></html>")\n'
)


def run_with_script(label: str, script: str, accessibility: bool, network: bool) -> None:
    write_case(accessibility, network)
    (CASE_DIR / "test_recorded.py").write_text(script, encoding="utf-8")
    result = execute_test_case_config(f"{CASE_REL}/data.json")
    print(f"--- {label} ---")
    print("success:", result["success"], "| status:", result["status"], "| rc:", result["pytest_return_code"])
    if result.get("error_message"):
        print("message:")
        print(result["error_message"][:700])
    print()


try:
    # Text assertion + storage seed/assert, extra checks off.
    run("baseline (expected text + storage only)", accessibility=False, network=False)
    # Same case with both new capabilities enabled.
    run("with accessibility + network checks", accessibility=True, network=True)
    # Failure paths.
    run_with_script("accessibility failure", BAD_A11Y_SCRIPT, accessibility=True, network=False)
    run_with_script("network failure", BAD_NETWORK_SCRIPT, accessibility=False, network=True)
    # Same broken page but checks disabled -> must still pass (backward compatibility).
    run_with_script("accessibility issues present but check OFF", BAD_A11Y_SCRIPT, accessibility=False, network=False)
finally:
    shutil.rmtree("/app/automation/generated/_tmpcheck", ignore_errors=True)
    print("cleaned up temp case dir")
