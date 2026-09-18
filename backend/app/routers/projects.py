from typing import List
from fastapi import APIRouter, status
from app.schemas.project import (
    CreateProjectDto,
    ProjectDetail,
    ProjectSummary,
    UpdateProjectDto,
)
from app.services.projects_service import projects_service

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectSummary], response_model_by_alias=True)
async def list_projects():
    return await projects_service.list_projects()

@router.get("/{project_id}", response_model=ProjectDetail, response_model_by_alias=True)
async def get_project(project_id: str):
    return await projects_service.get_project(project_id)

@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED, response_model_by_alias=True)
async def create_project(input_data: CreateProjectDto):
    return await projects_service.create_project(input_data)

@router.patch("/{project_id}", response_model=ProjectDetail, response_model_by_alias=True)
async def update_project(project_id: str, input_data: UpdateProjectDto):
    return await projects_service.update_project(project_id, input_data)
