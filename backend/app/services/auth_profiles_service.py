from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, List, Optional

from fastapi import HTTPException

from app.repositories.auth_profile_repository import AuthProfileRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.test_case_repository import TestCaseRepository
from app.schemas.auth_profile import (
    AuthProfileCredentialsDto,
    AuthProfileSummary,
    AuthRefreshConfig,
    CreateAuthProfileDto,
    UpdateAuthRefreshDto,
)
from app.utils.http_url import normalize_base_url


class AuthProfilesService:
    def __init__(
        self,
        profile_repository: AuthProfileRepository,
        project_repository: ProjectRepository,
        test_case_repository: TestCaseRepository | None = None,
    ):
        self.profiles = profile_repository
        self.projects = project_repository
        self.test_cases = test_case_repository

    def list_for_project(self, project_id: str) -> List[AuthProfileSummary]:
        self.profiles.validate_project_id(project_id)
        self.projects.find_by_id(project_id)
        return self.profiles.list_by_project(project_id)

    def get(self, project_id: str, profile_id: str) -> AuthProfileSummary:
        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        return self.profiles.find_by_id(project_id, profile_id)

    def create(self, project_id: str, input_dto: CreateAuthProfileDto) -> AuthProfileSummary:
        self.profiles.validate_project_id(project_id)
        project = self.projects.find_by_id(project_id)
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Auth profile name is required")
        login_url = normalize_base_url(input_dto.loginUrl or project.baseUrl)
        created = self.profiles.create(
            project_id, CreateAuthProfileDto(name=name, loginUrl=login_url)
        )
        if input_dto.username and input_dto.password:
            self.profiles.save_credentials(
                project_id, created.id, input_dto.username.strip(), input_dto.password
            )
            created = self.profiles.find_by_id(project_id, created.id)
        return created

    def set_credentials(
        self, project_id: str, profile_id: str, input_dto: AuthProfileCredentialsDto
    ) -> AuthProfileSummary:
        """Store credentials encrypted at rest. The password is never returned."""
        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        self.profiles.find_by_id(project_id, profile_id)
        username = (input_dto.username or "").strip()
        if not username or not input_dto.password:
            raise HTTPException(status_code=400, detail="Username and password are required")
        self.profiles.save_credentials(project_id, profile_id, username, input_dto.password)
        return self.profiles.find_by_id(project_id, profile_id)

    def set_refresh(
        self, project_id: str, profile_id: str, input_dto: UpdateAuthRefreshDto
    ) -> AuthProfileSummary:
        """Store non-secret refresh settings. Passing refresh=null clears them."""
        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        self.profiles.find_by_id(project_id, profile_id)
        refresh = input_dto.refresh
        if refresh is not None:
            _require_refresh_fields(refresh)
        self.profiles.save_refresh(project_id, profile_id, refresh)
        return self.profiles.find_by_id(project_id, profile_id)

    def delete(self, project_id: str, profile_id: str) -> None:
        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        self.profiles.delete(project_id, profile_id)
        if self.test_cases is not None:
            self.test_cases.clear_auth_profile_refs(project_id, profile_id)

    def record_login(self, project_id: str, profile_id: str) -> AuthProfileSummary:
        """Capture a session with codegen into a private temp file, store it encrypted, delete the file."""
        from app.services.automation_service import record_auth_profile_login

        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        profile = self.profiles.find_by_id(project_id, profile_id)
        with self.profiles.session_file(project_id, profile_id, load=False, save=True) as save_path:
            record_auth_profile_login(profile.loginUrl, save_path)
        return self.profiles.find_by_id(project_id, profile_id)

    @contextmanager
    def recording_session(
        self, project_id: str, profile_id: Optional[str], target_url: str | None = None
    ) -> Iterator[Optional[Path]]:
        """Session file for Record Test (codegen --load-storage). None without an Auth Profile.

        The file is a private temp copy that is deleted when recording ends. Cookies captured
        on the profile's login host are retargeted to target_url so another environment of the
        same app does not open on the login page. Renewing an expired session happens at run
        time in the worker, not here.
        """
        if not profile_id:
            yield None
            return
        profile = self.get(project_id, profile_id)
        if not profile.hasStorageState and not self.profiles.read_credentials(project_id, profile_id):
            raise HTTPException(
                status_code=400,
                detail="Auth profile has no saved session. Record login first.",
            )
        state = self.profiles.read_storage_state(project_id, profile_id) or {"cookies": [], "origins": []}
        if target_url:
            from app.repositories.auth_profile_repository import retarget_storage_state

            state = retarget_storage_state(state, target_url, profile.loginUrl)
            state = _prime_storage_for_target(
                state,
                target_url,
                profile.loginUrl,
                self.profiles.read_credentials(project_id, profile_id),
            )
        with self.profiles.session_file(
            project_id,
            profile_id,
            load=False,
            save=False,
            state_override=state,
        ) as path:
            yield path


def _login_url_on_target(login_url: str, target_url: str) -> str:
    from urllib.parse import urlparse, urlunparse

    login = urlparse(login_url if "://" in (login_url or "") else f"https://{login_url}")
    target = urlparse(target_url if "://" in (target_url or "") else f"https://{target_url}")
    if not target.netloc:
        return login_url
    return urlunparse((target.scheme or login.scheme or "https", target.netloc, login.path or "/login", "", login.query, ""))


def _on_login_page(page) -> bool:
    try:
        path = (page.url or "").lower()
    except Exception:
        path = ""
    if "/login" in path:
        return True
    try:
        return page.locator('input[type="password"]').count() > 0
    except Exception:
        return False


def _prime_storage_for_target(state: dict, target_url: str, login_url: str, credentials: dict | None) -> dict:
    """Open the recording URL with the saved session. If that lands on login, sign in with stored credentials on that same host."""
    import logging

    logger = logging.getLogger("testflow.auth_profiles")
    from app.logging_format import log_failure

    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        log_failure(logger, "recording.prime", exc, level=logging.WARNING)
        return state
    username = (credentials or {}).get("username") or ""
    password = (credentials or {}).get("password") or ""
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(storage_state=state if state.get("cookies") or state.get("origins") else None)
            page = context.new_page()
            page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            if not _on_login_page(page):
                primed = context.storage_state()
                browser.close()
                return primed
            if not username or not password:
                browser.close()
                return state
            page.goto(_login_url_on_target(login_url, target_url), wait_until="domcontentloaded", timeout=30000)
            password_box = page.locator('input[type="password"]').first
            if password_box.count() == 0:
                browser.close()
                return state
            username_box = None
            for selector in (
                'input[type="email"]',
                'input[name*="user" i]',
                'input[name*="email" i]',
                'input[id*="user" i]',
                'input[id*="email" i]',
                'input[type="text"]',
            ):
                candidate = page.locator(selector).first
                if candidate.count() > 0 and candidate.is_visible():
                    username_box = candidate
                    break
            if username_box is None:
                browser.close()
                return state
            username_box.fill(username)
            password_box.fill(password)
            submitted = False
            for selector in (
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Log in")',
                'button:has-text("Login")',
                'button:has-text("Sign in")',
            ):
                button = page.locator(selector).first
                if button.count() > 0 and button.is_visible():
                    button.click()
                    submitted = True
                    break
            if not submitted:
                password_box.press("Enter")
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                pass
            page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            still_on_login = _on_login_page(page)
            primed = context.storage_state()
            browser.close()
            if still_on_login:
                return state
            return primed
    except Exception as exc:
        log_failure(logger, "recording.prime", exc, level=logging.WARNING)
        return state


def _require_refresh_fields(refresh: AuthRefreshConfig) -> None:
    url = (refresh.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="Refresh URL is required")
    if refresh.strategy == "localStorage":
        missing = [
            label
            for label, value in (
                ("access token key", refresh.accessTokenKey),
                ("refresh token key", refresh.refreshTokenKey),
                ("access token JSON path", refresh.accessTokenJsonPath),
            )
            if not (value or "").strip()
        ]
        if missing:
            raise HTTPException(
                status_code=400,
                detail="localStorage refresh needs " + ", ".join(missing),
            )
