from typing import List

from fastapi import APIRouter, Depends, Response

from app.repositories.environment_repository import environment_repository
from app.repositories.project_repository import project_repository
from app.schemas.environment import (
    CreateEnvironmentDto,
    EnvironmentSummary,
    UpdateEnvironmentDto,
)
from app.services.environments_service import EnvironmentsService

router = APIRouter(prefix="/projects/{project_id}/environments", tags=["environments"])

_service = EnvironmentsService(environment_repository, project_repository)


def get_environments_service() -> EnvironmentsService:
    return _service


@router.get("", response_model=List[EnvironmentSummary])
@router.get("/", response_model=List[EnvironmentSummary], include_in_schema=False)
def list_environments(
    project_id: str,
    service: EnvironmentsService = Depends(get_environments_service),
):
    return service.list_for_project(project_id)


@router.post("", response_model=EnvironmentSummary)
@router.post("/", response_model=EnvironmentSummary, include_in_schema=False)
def create_environment(
    project_id: str,
    input_dto: CreateEnvironmentDto,
    service: EnvironmentsService = Depends(get_environments_service),
):
    return service.create(project_id, input_dto)


@router.patch("/{environment_id}", response_model=EnvironmentSummary)
def update_environment(
    project_id: str,
    environment_id: str,
    input_dto: UpdateEnvironmentDto,
    service: EnvironmentsService = Depends(get_environments_service),
):
    return service.update(project_id, environment_id, input_dto)


@router.delete("/{environment_id}", status_code=204)
def delete_environment(
    project_id: str,
    environment_id: str,
    service: EnvironmentsService = Depends(get_environments_service),
):
    service.delete(project_id, environment_id)
    return Response(status_code=204)
