import sys
from pathlib import Path
from typing import List

from fastapi import HTTPException

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.repositories.environment_repository import EnvironmentRepository, environment_repository
from app.repositories.project_repository import ProjectRepository
from app.schemas.environment import (
    CreateEnvironmentDto,
    EnvironmentSummary,
    UpdateEnvironmentDto,
)
from app.utils.http_url import normalize_base_url


class EnvironmentsService:
    def __init__(
        self,
        environment_repository: EnvironmentRepository,
        project_repository: ProjectRepository,
    ):
        self.environments = environment_repository
        self.projects = project_repository

    def list_for_project(self, project_id: str) -> List[EnvironmentSummary]:
        project = self.projects.find_by_id(project_id)
        self.environments.ensure_default(project_id, project.baseUrl)
        return self.environments.list_by_project(project_id)

    def create(self, project_id: str, input_dto: CreateEnvironmentDto) -> EnvironmentSummary:
        self.projects.find_by_id(project_id)
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Environment name is required")
        base_url = normalize_base_url(input_dto.baseUrl)
        return self.environments.create(
            project_id, CreateEnvironmentDto(name=name, baseUrl=base_url)
        )

    def update(
        self, project_id: str, environment_id: str, input_dto: UpdateEnvironmentDto
    ) -> EnvironmentSummary:
        self.projects.find_by_id(project_id)
        name = input_dto.name
        base_url = input_dto.baseUrl
        if name is not None:
            name = name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Environment name is required")
        if base_url is not None:
            base_url = normalize_base_url(base_url)
        return self.environments.update(
            project_id,
            environment_id,
            UpdateEnvironmentDto(name=name, baseUrl=base_url),
        )

    def delete(self, project_id: str, environment_id: str) -> None:
        self.projects.find_by_id(project_id)
        self.environments.delete(project_id, environment_id)

    def resolve_start_url(self, project_id: str, start_path: str, environment_id: str | None) -> str:
        from automation.framework.url_resolve import resolve_start_url

        project = self.projects.find_by_id(project_id)
        if environment_id:
            env = self.environments.find_by_id(project_id, environment_id)
            base_url = env.baseUrl
        else:
            env = self.environments.get_default(project_id, project.baseUrl)
            base_url = env.baseUrl
        return resolve_start_url(base_url, start_path)
