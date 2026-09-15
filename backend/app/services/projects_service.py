from typing import List
from urllib.parse import urlparse
from fastapi import HTTPException
from app.repositories.project_repository import ProjectRepository
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

    def create(self, input_dto: CreateProjectDto) -> ProjectDetail:
        normalized = self._validate_and_normalize(input_dto)
        return self.repository.create(normalized)

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
            normalized.baseUrl = self._normalize_url(input_dto.baseUrl)

        if input_dto.description is not None:
            desc = input_dto.description.strip()
            normalized.description = desc if desc else None

        return self.repository.update(id, normalized)

    def _validate_and_normalize(self, input_dto: CreateProjectDto) -> CreateProjectDto:
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")

        normalized_url = self._normalize_url(input_dto.baseUrl)
        desc = input_dto.description.strip() if input_dto.description else None

        return CreateProjectDto(
            name=name,
            baseUrl=normalized_url,
            description=desc,
        )

    def _normalize_url(self, value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="Application URL is required")
        try:
            parsed = urlparse(raw)
            if parsed.scheme not in ["http", "https"] or not parsed.netloc:
                raise ValueError("Unsupported protocol")
            return raw
        except Exception:
            raise HTTPException(status_code=400, detail="Enter a valid http:// or https:// URL")
