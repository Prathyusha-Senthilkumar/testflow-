from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.repositories.project_repository import ProjectRepository, project_repository
from app.services.projects_service import ProjectsService
from app.schemas.project import (
    ProjectSummary,
    ProjectDetail,
    CreateProjectDto,
    UpdateProjectDto,
)

router = APIRouter(prefix="/projects", tags=["projects"])

_repository = project_repository
_service = ProjectsService(_repository)

def get_projects_service() -> ProjectsService:
    return _service

def get_project_repository() -> ProjectRepository:
    return _repository

@router.get("", response_model=List[ProjectSummary])
@router.get("/", response_model=List[ProjectSummary], include_in_schema=False)
def list_projects(service: ProjectsService = Depends(get_projects_service)):
    return service.list()

class ResolvedStartUrlResponse(BaseModel):
    resolvedStartUrl: str = Field(..., alias="resolvedStartUrl")

    model_config = {"populate_by_name": True}


@router.get("/{id}/resolve-start-url", response_model=ResolvedStartUrlResponse)
def resolve_project_start_url(
    id: str,
    startPath: str = "/",
    environmentId: str | None = None,
    service: ProjectsService = Depends(get_projects_service),
):
    return ResolvedStartUrlResponse(
        resolvedStartUrl=service.resolve_start_url(id, startPath, environmentId)
    )


@router.get("/{id}", response_model=ProjectDetail)
def get_project(id: str, service: ProjectsService = Depends(get_projects_service)):
    return service.get(id)

@router.post("", response_model=ProjectDetail)
@router.post("/", response_model=ProjectDetail, include_in_schema=False)
def create_project(
    input_dto: CreateProjectDto,
    service: ProjectsService = Depends(get_projects_service),
):
    return service.create(input_dto)

@router.patch("/{id}", response_model=ProjectDetail)
def update_project(
    id: str,
    input_dto: UpdateProjectDto,
    service: ProjectsService = Depends(get_projects_service),
):
    return service.update(id, input_dto)
