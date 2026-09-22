"""Establish a usable authenticated Playwright session for a test run.

Order of preference (no tester interaction at any point):
  1. Saved storage state still grants access  -> reuse it, and re-save so any
     server-rotated cookies replace the stale ones.
  2. Saved state is unusable and refresh is configured -> call the configured
     refresh, re-check the protected URL, and save the replacement session.
  3. Refresh is missing or did not restore access -> log in headlessly with the
     Auth Profile's stored credentials, then replace the saved session.
  4. Neither possible -> raise a clear, actionable error.

Runs inside the existing worker/Playwright stack; it starts no new framework.
"""

import json
from pathlib import Path
from typing import Callable, Optional

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from .auth_refresh import RefreshError, attempt_refresh, refresh_configured

STORAGE_FILENAME = "storage_state.json"

# Heuristics used to decide "am I looking at a login screen?"
_PASSWORD_SELECTOR = 'input[type="password"]'
_USERNAME_SELECTORS = (
    'input[type="email"]',
    'input[name*="user" i]',
    'input[name*="email" i]',
    'input[id*="user" i]',
    'input[id*="email" i]',
    'input[type="text"]',
)
_SUBMIT_SELECTORS = (
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Log in")',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
)

_NAV_TIMEOUT_MS = 30_000


class AuthRecoveryError(RuntimeError):
    """Authentication could not be established without tester interaction."""


def _looks_like_login_page(page) -> bool:
    try:
        return page.locator(_PASSWORD_SELECTOR).count() > 0
    except PlaywrightError:
        return False


def _session_grants_access(storage_path: Path, target_url: str, log: Callable[[str], None]) -> Optional[dict]:
    """Return a refreshed storage state when the saved session still works."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(storage_state=str(storage_path))
                page = context.new_page()
                page.goto(target_url, wait_until="domcontentloaded", timeout=_NAV_TIMEOUT_MS)
                if _looks_like_login_page(page):
                    log("Saved session no longer grants access (login screen shown).")
                    return None
                # Capture whatever the server rotated during this request.
                refreshed = context.storage_state()
                log("Saved session is valid; reusing it.")
                return refreshed
            finally:
                browser.close()
    except PlaywrightError as exc:
        log(f"Could not validate saved session: {exc}")
        return None


def _refresh_and_revalidate(
    storage_path: Path,
    target_url: str,
    refresh: dict,
    log: Callable[[str], None],
) -> Optional[dict]:
    """Apply a configured refresh. Return the new storage state only if the protected URL is usable."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    storage_state=str(storage_path) if storage_path.is_file() else None
                )
                try:
                    try:
                        attempt_refresh(context, refresh, log)
                    except RefreshError as exc:
                        log(str(exc))
                        return None
                    page = context.new_page()
                    try:
                        page.goto(target_url, wait_until="domcontentloaded", timeout=_NAV_TIMEOUT_MS)
                        if _looks_like_login_page(page):
                            log("stage=refresh_failed")
                            log("Refresh completed but the protected page still shows a login screen.")
                            return None
                    except PlaywrightError as exc:
                        log("stage=refresh_failed")
                        log(f"Could not re-check the page after refresh ({exc}).")
                        return None
                    finally:
                        page.close()
                    state = context.storage_state()
                    log("Saved the refreshed session.")
                    return state
                finally:
                    context.close()
            finally:
                browser.close()
    except PlaywrightError as exc:
        log("stage=refresh_failed")
        log(f"Could not run refresh ({exc}).")
        return None


def _login_with_credentials(
    login_url: str,
    username: str,
    password: str,
    target_url: str,
    log: Callable[[str], None],
) -> dict:
    """Headless form login using the stored credentials. Never logs secrets."""
    if not login_url:
        raise AuthRecoveryError(
            "The Auth Profile has no login URL, so automatic sign-in is not possible."
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context()
            page = context.new_page()
            page.goto(login_url, wait_until="domcontentloaded", timeout=_NAV_TIMEOUT_MS)

            password_field = page.locator(_PASSWORD_SELECTOR).first
            if password_field.count() == 0:
                raise AuthRecoveryError(
                    "No password field was found on the login page, so automatic "
                    "sign-in is not possible for this application."
                )

            username_field = None
            for selector in _USERNAME_SELECTORS:
                candidate = page.locator(selector).first
                try:
                    if candidate.count() > 0 and candidate.is_visible():
                        username_field = candidate
                        break
                except PlaywrightError:
                    continue
            if username_field is None:
                raise AuthRecoveryError("No username/email field was found on the login page.")

            username_field.fill(username)
            password_field.fill(password)

            submitted = False
            for selector in _SUBMIT_SELECTORS:
                button = page.locator(selector).first
                try:
                    if button.count() > 0 and button.is_visible():
                        button.click()
                        submitted = True
                        break
                except PlaywrightError:
                    continue
            if not submitted:
                password_field.press("Enter")

            try:
                page.wait_for_load_state("networkidle", timeout=_NAV_TIMEOUT_MS)
            except PlaywrightError:
                pass

            # Confirm we actually got in by visiting the page the test needs.
            page.goto(target_url, wait_until="domcontentloaded", timeout=_NAV_TIMEOUT_MS)
            if _looks_like_login_page(page):
                raise AuthRecoveryError(
                    "Automatic sign-in with the stored credentials did not produce an "
                    "authenticated session. Check the credentials on the Auth Profile."
                )

            log("Signed in automatically with the stored Auth Profile credentials.")
            return context.storage_state()
        finally:
            browser.close()


def ensure_authenticated_session(
    storage_path: Path,
    login_url: str,
    target_url: str,
    credentials: Optional[dict],
    log: Optional[Callable[[str], None]] = None,
    refresh: Optional[dict] = None,
) -> str:
    """Guarantee `storage_path` holds a session that can reach `target_url`."""
    emit = log or (lambda message: print(f"[auth] {message}"))
    storage_path = Path(storage_path)
    storage_path.parent.mkdir(parents=True, exist_ok=True)

    if not target_url:
        raise AuthRecoveryError(
            "No resolved start URL is available to validate the authenticated session."
        )

    if storage_path.is_file() and storage_path.stat().st_size > 0:
        reused = _session_grants_access(storage_path, target_url, emit)
        if reused is not None:
            _write_storage_state(storage_path, reused)
            emit("outcome=reused")
            return str(storage_path)

    if refresh is None:
        refresh = _refresh_from_profile(storage_path)

    refresh_attempted = False
    if refresh_configured(refresh):
        refresh_attempted = True
        refreshed = _refresh_and_revalidate(storage_path, target_url, refresh or {}, emit)
        if refreshed is not None:
            _write_storage_state(storage_path, refreshed)
            emit("outcome=refreshed")
            return str(storage_path)
        emit("Refresh did not restore access. Trying stored credentials.")

    if not credentials or not credentials.get("username") or not credentials.get("password"):
        if refresh_attempted:
            emit("outcome=refresh_failed_credentials_failed")
        raise AuthRecoveryError(
            "The saved session is no longer usable, refresh could not restore it, and this "
            "Auth Profile has no stored credentials. Add credentials to the Auth Profile "
            "(or use Record Login) so TestFlow can sign in automatically."
            if refresh_attempted
            else
            "The saved session is no longer usable and this Auth Profile has no stored "
            "credentials. Add credentials to the Auth Profile (or use Record Login) so "
            "TestFlow can sign in automatically."
        )

    emit("stage=credential_login")
    try:
        state = _login_with_credentials(
            login_url, credentials["username"], credentials["password"], target_url, emit
        )
    except AuthRecoveryError:
        if refresh_attempted:
            emit("outcome=refresh_failed_credentials_failed")
        raise
    _write_storage_state(storage_path, state)
    emit("Replaced the stale session with the newly authenticated session.")
    if refresh_attempted:
        emit("outcome=refresh_failed_credentials_recovered")
    else:
        emit("outcome=credentials_recovered")
    return str(storage_path)


def _refresh_from_profile(storage_path: Path) -> Optional[dict]:
    """Non-secret refresh settings live beside the session, never with the password."""
    meta_path = storage_path.parent / "profile.json"
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    refresh = payload.get("refresh") if isinstance(payload, dict) else None
    return refresh if isinstance(refresh, dict) else None


def _write_storage_state(storage_path: Path, state: dict) -> None:
    storage_path.write_text(json.dumps(state), encoding="utf-8")
