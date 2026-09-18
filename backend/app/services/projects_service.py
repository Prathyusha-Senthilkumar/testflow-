from urllib.parse import urlparse
from typing import List, Optional
from fastapi import HTTPException, status
from app.repositories.project_repository import project_repository, ProjectRepository
from app.schemas.project import (
    CreateProjectDto,
    ProjectDetail,
    ProjectSummary,
    UpdateProjectDto,
)

class ProjectsService:
    def __init__(self, repository: ProjectRepository = project_repository):
        self.repository = repository

    async def list_projects(self) -> List[ProjectSummary]:
        return await self.repository.find_all()

    async def get_project(self, project_id: str) -> ProjectDetail:
        return await self.repository.find_by_id(project_id)

    async def create_project(self, input_data: CreateProjectDto) -> ProjectDetail:
        normalized = self._validate_and_normalize(input_data)
        return await self.repository.create(normalized)

    async def update_project(self, project_id: str, input_data: UpdateProjectDto) -> ProjectDetail:
        normalized = UpdateProjectDto(**input_data.model_dump(exclude_unset=True))
        
        if input_data.name is not None:
            name = input_data.name.strip()
            if not name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project name is required"
                )
            normalized.name = name

        if input_data.baseUrl is not None:
            normalized.baseUrl = self._normalize_url(input_data.baseUrl)

        if input_data.description is not None:
            normalized.description = input_data.description.strip() if input_data.description and input_data.description.strip() else None

        return await self.repository.update(project_id, normalized)

    def _validate_and_normalize(self, input_data: CreateProjectDto) -> CreateProjectDto:
        name = input_data.name.strip() if input_data.name else ""
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project name is required"
            )

        base_url = self._normalize_url(input_data.baseUrl)
        description = input_data.description.strip() if input_data.description and input_data.description.strip() else None

        return CreateProjectDto(
            name=name,
            baseUrl=base_url,
            description=description
        )

    def _normalize_url(self, raw_url: str) -> str:
        raw = raw_url.strip() if raw_url else ""
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Application URL is required"
            )
        try:
            parsed = urlparse(raw)
            if parsed.scheme not in ["http", "https"] or not parsed.netloc:
                raise ValueError("Invalid protocol or netloc")
            return parsed.geturl()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid http:// or https:// URL"
            )

projects_service = ProjectsService()
