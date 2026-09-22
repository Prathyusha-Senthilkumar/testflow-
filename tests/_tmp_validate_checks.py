"""TEMPORARY validation for accessibility + network checks (no DB writes)."""
import sys

sys.path.insert(0, "/app")

from playwright.sync_api import sync_playwright  # noqa: E402

from automation.framework.accessibility import (  # noqa: E402
    assert_accessibility,
    format_violations,
    run_accessibility_audit,
)
from automation.framework.network_monitor import (  # noqa: E402
    NetworkMonitor,
    assert_no_network_failures,
)

BAD_PAGE = """
<html><head></head><body>
  <img src="/logo.png">
  <input type="text" name="email">
  <button></button>
  <a href="/x"></a>
  <iframe src="/f"></iframe>
  <div id="dup"></div><div id="dup"></div>
</body></html>
"""

GOOD_PAGE = """
<html lang="en"><head><title>Good page</title></head><body>
  <img src="/logo.png" alt="Logo">
  <label for="e">Email</label><input id="e" type="text">
  <button>Save</button>
  <a href="/x">Home</a>
</body></html>
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context().new_page()

    print("=== ACCESSIBILITY ===")
    page.set_content(BAD_PAGE)
    violations = run_accessibility_audit(page)
    print("violations on bad page:", len(violations))
    print(format_violations(violations))

    page.set_content(GOOD_PAGE)
    clean = run_accessibility_audit(page)
    print("violations on clean page:", len(clean))
    try:
        assert_accessibility(page)
        print("clean page -> PASS")
    except AssertionError as exc:
        print("clean page unexpectedly FAILED:", exc)

    print()
    print("=== NETWORK ===")
    monitor = NetworkMonitor(page)
    monitor.start()
    page.goto("https://example.com/definitely-not-a-real-path", wait_until="domcontentloaded")
    monitor.stop()
    print("failures captured:", len(monitor.failures))
    try:
        assert_no_network_failures(monitor.failures)
        print("no failures detected (unexpected)")
    except AssertionError as exc:
        print(exc)

    print()
    quiet = NetworkMonitor(page)
    quiet.start()
    page.goto("https://example.com", wait_until="domcontentloaded")
    quiet.stop()
    print("healthy page failures:", len(quiet.failures))
    assert_no_network_failures(quiet.failures)
    print("healthy page -> PASS")

    browser.close()
