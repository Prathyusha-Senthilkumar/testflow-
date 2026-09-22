"""Collect failed HTTP responses during an existing Playwright run.

Uses Playwright page response events only - no proxy and no extra service.
"""

from playwright.sync_api import Page

MAX_REPORTED_FAILURES = 15
FAILING_STATUS_FROM = 400


class NetworkMonitor:
    def __init__(self, page: Page, failing_status_from: int = FAILING_STATUS_FROM):
        self._page = page
        self._failing_status_from = failing_status_from
        self._failures: list[dict] = []
        self._seen: set[tuple[str, str, int]] = set()
        self._listening = False

    def start(self) -> None:
        if self._listening:
            return
        self._page.on("response", self._on_response)
        self._listening = True

    def stop(self) -> None:
        if not self._listening:
            return
        try:
            self._page.remove_listener("response", self._on_response)
        except Exception:
            pass
        self._listening = False

    def _on_response(self, response) -> None:
        # Handlers must never break the test run.
        try:
            status = response.status
            if status < self._failing_status_from:
                return
            request = response.request
            method = getattr(request, "method", "") or ""
            url = response.url or ""
            signature = (method, url, status)
            if signature in self._seen:
                return
            self._seen.add(signature)
            self._failures.append(
                {
                    "method": method,
                    "url": url,
                    "status": status,
                    "resourceType": getattr(request, "resource_type", "") or "",
                }
            )
        except Exception:
            return

    @property
    def failures(self) -> list[dict]:
        return list(self._failures)


def format_failures(failures: list[dict]) -> str:
    shown = failures[:MAX_REPORTED_FAILURES]
    lines = [f"Network check failed with {len(failures)} failed request(s):"]
    for position, failure in enumerate(shown, start=1):
        resource = failure.get("resourceType")
        suffix = f" [{resource}]" if resource else ""
        lines.append(
            f"{position}. {failure.get('status')} {failure.get('method')} {failure.get('url')}{suffix}"
        )
    remaining = len(failures) - len(shown)
    if remaining > 0:
        lines.append(f"...and {remaining} more failed request(s).")
    return "\n".join(lines)


def assert_no_network_failures(failures: list[dict]) -> None:
    if failures:
        raise AssertionError(format_failures(failures))
