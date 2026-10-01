"""Playwright-native seeding and assertions for localStorage, sessionStorage and cookies."""

from playwright.sync_api import Page

LOCAL_STORAGE = "localStorage"
SESSION_STORAGE = "sessionStorage"
COOKIE = "cookie"

_WEB_STORAGE_KINDS = (LOCAL_STORAGE, SESSION_STORAGE)

# Structured arguments are passed via evaluate(); nothing is interpolated into JS.
_SET_STORAGE_JS = """
([area, entries]) => {
  const store = area === 'sessionStorage' ? window.sessionStorage : window.localStorage;
  for (const entry of entries) {
    store.setItem(entry.key, entry.value);
  }
}
"""

_GET_STORAGE_JS = """
([area, key]) => {
  const store = area === 'sessionStorage' ? window.sessionStorage : window.localStorage;
  return store.getItem(key);
}
"""


def normalize_entries(entries) -> list[dict]:
    """Keep only usable entries: a known kind and a non-empty key."""
    cleaned: list[dict] = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        kind = str(entry.get("kind") or "").strip()
        key = str(entry.get("key") or "").strip()
        if kind not in (*_WEB_STORAGE_KINDS, COOKIE) or not key:
            continue
        cleaned.append({"kind": kind, "key": key, "value": str(entry.get("value") or "")})
    return cleaned


def _label_for(kind: str, key: str) -> str:
    if kind == COOKIE:
        return f'cookie "{key}"'
    return f'{kind} key "{key}"'


def apply_storage_seeds(page: Page, entries, origin_url: str) -> None:
    """Seed cookies and web storage before the recorded actions run."""
    seeds = normalize_entries(entries)
    if not seeds:
        return

    origin = (origin_url or "").strip()
    if not origin:
        raise AssertionError(
            "A resolved start URL is required before storage or cookie values can be seeded."
        )

    cookies = [entry for entry in seeds if entry["kind"] == COOKIE]
    if cookies:
        page.context.add_cookies(
            [{"name": entry["key"], "value": entry["value"], "url": origin} for entry in cookies]
        )

    web_entries = [entry for entry in seeds if entry["kind"] in _WEB_STORAGE_KINDS]
    if web_entries:
        # localStorage/sessionStorage are origin-scoped, so land on the origin first.
        page.goto(origin, wait_until="domcontentloaded")
        for area in _WEB_STORAGE_KINDS:
            area_entries = [entry for entry in web_entries if entry["kind"] == area]
            if area_entries:
                page.evaluate(_SET_STORAGE_JS, [area, area_entries])


def read_storage_value(page: Page, kind: str, key: str) -> str | None:
    if kind == COOKIE:
        for cookie in page.context.cookies():
            if cookie.get("name") == key:
                return cookie.get("value")
        return None
    return page.evaluate(_GET_STORAGE_JS, [kind, key])


def assert_storage_entries(page: Page, entries) -> None:
    """Verify configured storage/cookie values after the recorded actions ran."""
    for entry in normalize_entries(entries):
        kind, key, expected = entry["kind"], entry["key"], entry["value"]
        actual = read_storage_value(page, kind, key)
        label = _label_for(kind, key)
        if actual is None:
            raise AssertionError(
                f'Expected {label} to equal "{expected}", but it was not set.'
            )
        if actual != expected:
            raise AssertionError(
                f'Expected {label} to equal "{expected}", but received "{actual}".'
            )
