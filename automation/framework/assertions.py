import time

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page

_TEXT_TIMEOUT_MS = 10_000
_MAX_MATCHES_CHECKED = 20


def _body_text(page: Page) -> str:
    try:
        return page.locator("body").inner_text(timeout=2_000) or ""
    except PlaywrightError:
        return ""


def assert_text_present(page: Page, value: str, index: int = 1) -> None:
    """Pass when `value` appears on the page (case-insensitive substring).

    Prefers a visible matching element, but also accepts rendered body text so a
    valid expectation is not failed just because the first DOM match is hidden.
    """
    locator = page.get_by_text(value, exact=False)
    deadline = time.monotonic() + (_TEXT_TIMEOUT_MS / 1000)
    needle = value.casefold()

    while True:
        try:
            count = locator.count()
        except PlaywrightError:
            count = 0
        for position in range(min(count, _MAX_MATCHES_CHECKED)):
            try:
                if locator.nth(position).is_visible():
                    return
            except PlaywrightError:
                continue

        if needle in _body_text(page).casefold():
            return

        if time.monotonic() >= deadline:
            break
        page.wait_for_timeout(500)

    snippet = " ".join(_body_text(page).split())[:300]
    raise AssertionError(
        f"ASSERT text_visible [{index}]: expected text '{value}' was not found on the page.\n"
        f"URL: {page.url}\n"
        f"Page text (first 300 chars): {snippet or '<empty>'}"
    )


def run_assertions(page: Page, assertions: list[dict]) -> None:
    for index, assertion in enumerate(assertions, start=1):
        assertion_type = assertion.get("type")
        value = (assertion.get("value") or "").strip()
        if not value:
            raise AssertionError(f"ASSERT [{index}]: expected value is required")

        if assertion_type == "url_contains":
            if value not in page.url:
                raise AssertionError(
                    f"ASSERT url_contains [{index}]: expected '{value}' in URL, got '{page.url}'"
                )
        elif assertion_type == "page_title_contains":
            title = page.title()
            if value not in title:
                raise AssertionError(
                    f"ASSERT page_title_contains [{index}]: expected '{value}' in title, got '{title}'"
                )
        elif assertion_type == "text_visible":
            assert_text_present(page, value, index)
        else:
            raise AssertionError(f"ASSERT [{index}]: unsupported assertion type '{assertion_type}'")
