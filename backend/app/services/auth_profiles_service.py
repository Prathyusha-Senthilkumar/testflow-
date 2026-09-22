from typing import List

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
        from app.services.automation_service import record_auth_profile_login

        self.profiles.validate_project_id(project_id)
        self.profiles.validate_profile_id(profile_id)
        self.projects.find_by_id(project_id)
        profile = self.profiles.find_by_id(project_id, profile_id)
        save_path = self.profiles.storage_state_path(project_id, profile_id)
        record_auth_profile_login(profile.loginUrl, save_path)
        return self.profiles.find_by_id(project_id, profile_id)

    def require_storage_path(self, project_id: str, profile_id: str) -> str:
        profile = self.get(project_id, profile_id)
        if not profile.hasStorageState:
            raise HTTPException(
                status_code=400,
                detail="Auth profile has no saved session. Record login first.",
            )
        return str(self.profiles.storage_state_path(project_id, profile_id).resolve())


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
