from typing import List

from fastapi import HTTPException

from app.repositories.auth_profile_repository import AuthProfileRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.test_case_repository import TestCaseRepository
from app.schemas.auth_profile import AuthProfileSummary, CreateAuthProfileDto
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
        return self.profiles.create(
            project_id, CreateAuthProfileDto(name=name, loginUrl=login_url)
        )

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
