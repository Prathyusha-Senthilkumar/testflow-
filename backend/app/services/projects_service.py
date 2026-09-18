from typing import List
from fastapi import HTTPException

from app.repositories.environment_repository import environment_repository
from app.repositories.project_repository import ProjectRepository
from app.utils.http_url import normalize_base_url
from app.schemas.project import (
    ProjectSummary,
    ProjectDetail,
    CreateProjectDto,
    UpdateProjectDto,
)

class ProjectsService:
    def __init__(self, repository: ProjectRepository):
        self.repository = repository

    def list(self) -> List[ProjectSummary]:
        return self.repository.find_all()

    def get(self, id: str) -> ProjectDetail:
        return self.repository.find_by_id(id)

    def resolve_start_url(self, id: str, start_path: str = "/", environment_id: str | None = None) -> str:
        from app.services.environments_service import EnvironmentsService

        env_service = EnvironmentsService(environment_repository, self.repository)
        return env_service.resolve_start_url(id, start_path, environment_id)

    def create(self, input_dto: CreateProjectDto) -> ProjectDetail:
        normalized = self._validate_and_normalize(input_dto)
        project = self.repository.create(normalized)
        environment_repository.ensure_default(project.id, project.baseUrl)
        return project

    def update(self, id: str, input_dto: UpdateProjectDto) -> ProjectDetail:
        normalized = UpdateProjectDto(
            name=input_dto.name,
            baseUrl=input_dto.baseUrl,
            description=input_dto.description,
        )

        if input_dto.name is not None:
            name = input_dto.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Project name is required")
            normalized.name = name

        if input_dto.baseUrl is not None:
            normalized.baseUrl = normalize_base_url(input_dto.baseUrl)

        if input_dto.description is not None:
            desc = input_dto.description.strip()
            normalized.description = desc if desc else None

        updated = self.repository.update(id, normalized)
        if input_dto.baseUrl is not None:
            environment_repository.ensure_default(id, updated.baseUrl)
        return updated

    def _validate_and_normalize(self, input_dto: CreateProjectDto) -> CreateProjectDto:
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")

        normalized_url = normalize_base_url(input_dto.baseUrl)
        desc = input_dto.description.strip() if input_dto.description else None

        return CreateProjectDto(
            name=name,
            baseUrl=normalized_url,
            description=desc,
        )

