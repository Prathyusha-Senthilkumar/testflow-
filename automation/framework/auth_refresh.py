"""Generic Auth Profile token/session refresh.

Strategies are chosen only from the profile's non-secret refresh configuration.
No application name, token name, or endpoint is hard-coded.

  cookie       - call the configured URL; the browser context already sends its
                 cookies and stores any Set-Cookie the server returns.
  localStorage - read the configured keys from saved localStorage, send the
                 configured one, and write the configured response fields back.
"""

from typing import Callable, Optional
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError

_SET_LOCAL_JS = """
(entries) => {
  for (const entry of entries) {
    window.localStorage.setItem(entry.key, entry.value);
  }
}
"""


class RefreshError(RuntimeError):
    """Refresh was attempted and did not produce a usable update."""


def refresh_configured(config: Optional[dict]) -> bool:
    if not isinstance(config, dict):
        return False
    strategy = str(config.get("strategy") or "").strip()
    url = str(config.get("url") or "").strip()
    return strategy in ("cookie", "localStorage") and bool(url)


def attempt_refresh(context, config: dict, log: Callable[[str], None]) -> None:
    """Update `context` auth state. Raises RefreshError without logging secrets."""
    strategy = str(config.get("strategy") or "").strip()
    url = str(config.get("url") or "").strip()
    method = str(config.get("method") or "POST").strip().upper()
    if method not in ("GET", "POST"):
        raise RefreshError("Refresh method must be GET or POST.")

    log("stage=refresh_attempt")
    if strategy == "cookie":
        _refresh_cookies(context, url, method, log)
        return
    if strategy == "localStorage":
        _refresh_local_storage(context, config, url, method, log)
        return
    raise RefreshError("Refresh strategy must be cookie or localStorage.")


def _refresh_cookies(context, url: str, method: str, log: Callable[[str], None]) -> None:
    try:
        response = context.request.fetch(url, method=method)
    except PlaywrightError as exc:
        log("stage=refresh_failed")
        raise RefreshError(f"Refresh request could not be sent ({_safe_error(exc)}).") from exc

    if response.status >= 400:
        log(f"stage=refresh_failed status={response.status}")
        raise RefreshError(f"Refresh request failed with HTTP {response.status}.")
    applied = _apply_set_cookies(context, url, response)
    if applied == 0:
        log("Refresh response did not include a Set-Cookie header.")
    log("stage=refresh_http_ok")


def _refresh_local_storage(context, config: dict, url: str, method: str, log: Callable[[str], None]) -> None:
    origin = str(config.get("origin") or "").strip() or _origin_of(url)
    access_key = str(config.get("accessTokenKey") or "").strip()
    refresh_key = str(config.get("refreshTokenKey") or "").strip()
    send = str(config.get("sendToken") or "refreshToken").strip()
    access_path = str(config.get("accessTokenJsonPath") or "").strip()
    refresh_path = str(config.get("refreshTokenJsonPath") or "").strip()

    if not access_key or not refresh_key or not access_path:
        raise RefreshError(
            "localStorage refresh needs accessTokenKey, refreshTokenKey and accessTokenJsonPath."
        )

    state = context.storage_state()
    access_token = _read_local(state, origin, access_key)
    refresh_token = _read_local(state, origin, refresh_key)
    token = refresh_token if send == "refreshToken" else access_token
    if not token:
        log("stage=refresh_failed")
        raise RefreshError("The configured token key was not present in saved localStorage.")

    header_name = str(config.get("authorizationHeader") or "Authorization").strip()
    headers = {header_name: f"Bearer {token}"}
    try:
        response = context.request.fetch(url, method=method, headers=headers)
    except PlaywrightError as exc:
        log("stage=refresh_failed")
        raise RefreshError(f"Refresh request could not be sent ({_safe_error(exc)}).") from exc

    if response.status >= 400:
        log(f"stage=refresh_failed status={response.status}")
        raise RefreshError(f"Refresh request failed with HTTP {response.status}.")

    try:
        body = response.json()
    except Exception as exc:
        log("stage=refresh_failed")
        raise RefreshError("Refresh response was not JSON.") from exc

    new_access = _dig(body, access_path)
    if not isinstance(new_access, str) or not new_access:
        log("stage=refresh_failed")
        raise RefreshError("Refresh response did not include the configured access token field.")

    updates = [{"key": access_key, "value": new_access}]
    if refresh_path:
        new_refresh = _dig(body, refresh_path)
        if isinstance(new_refresh, str) and new_refresh:
            updates.append({"key": refresh_key, "value": new_refresh})

    _write_local(context, origin, updates)
    log("stage=refresh_http_ok")


def _read_local(state: dict, origin: str, key: str) -> Optional[str]:
    for entry in state.get("origins") or []:
        if entry.get("origin") != origin:
            continue
        for item in entry.get("localStorage") or []:
            if item.get("name") == key and isinstance(item.get("value"), str):
                return item["value"]
    return None


def _write_local(context, origin: str, updates: list[dict]) -> None:
    """Set configured keys. The page stays open so a later storage_state() can read them."""
    page = context.new_page()
    page.goto(origin if origin.endswith("/") else origin + "/", wait_until="domcontentloaded")
    page.evaluate(_SET_LOCAL_JS, updates)


def _dig(payload, path: str):
    current = payload
    for part in [piece for piece in path.split(".") if piece]:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _apply_set_cookies(context, url: str, response) -> int:
    """Copy every Set-Cookie onto the browser context. Names come from the response."""
    applied = 0
    for header in _header_pairs(response):
        if header[0].lower() != "set-cookie":
            continue
        cookie = _parse_set_cookie(header[1], url)
        if cookie is None:
            continue
        context.add_cookies([cookie])
        applied += 1
    return applied


def _header_pairs(response) -> list[tuple[str, str]]:
    array = getattr(response, "headers_array", None)
    if callable(array):
        pairs = []
        for item in array():
            name = item.get("name") if isinstance(item, dict) else None
            value = item.get("value") if isinstance(item, dict) else None
            if isinstance(name, str) and isinstance(value, str):
                pairs.append((name, value))
        if pairs:
            return pairs
    headers = getattr(response, "headers", None) or {}
    return [(str(name), str(value)) for name, value in headers.items()]


def _parse_set_cookie(raw: str, url: str) -> Optional[dict]:
    parts = [part.strip() for part in raw.split(";") if part.strip()]
    if not parts or "=" not in parts[0]:
        return None
    name, value = parts[0].split("=", 1)
    name = name.strip()
    if not name:
        return None
    path = "/"
    for attr in parts[1:]:
        if "=" not in attr:
            continue
        key, attr_value = attr.split("=", 1)
        if key.strip().lower() == "path" and attr_value.strip():
            path = attr_value.strip()
    parsed = urlparse(url)
    return {
        "name": name,
        "value": value,
        "url": f"{parsed.scheme}://{parsed.netloc}{path}",
    }


def _origin_of(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _safe_error(exc: Exception) -> str:
    text = str(exc)
    return text[:180] if text else exc.__class__.__name__
