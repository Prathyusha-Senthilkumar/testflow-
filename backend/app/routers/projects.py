from typing import List
from fastapi import APIRouter, Depends
from app.repositories.project_repository import ProjectRepository
from app.services.projects_service import ProjectsService
from app.schemas.project import (
    ProjectSummary,
    ProjectDetail,
    CreateProjectDto,
    UpdateProjectDto,
)

router = APIRouter(prefix="/projects", tags=["projects"])

_repository = ProjectRepository()
_service = ProjectsService(_repository)

def get_projects_service() -> ProjectsService:
    return _service

def get_project_repository() -> ProjectRepository:
    return _repository

@router.get("", response_model=List[ProjectSummary])
@router.get("/", response_model=List[ProjectSummary], include_in_schema=False)
def list_projects(service: ProjectsService = Depends(get_projects_service)):
    return service.list()

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
