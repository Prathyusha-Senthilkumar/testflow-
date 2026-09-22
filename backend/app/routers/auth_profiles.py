from typing import List

from fastapi import APIRouter, Depends, Response

from app.repositories.auth_profile_repository import auth_profile_repository
from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.schemas.auth_profile import (
    AuthProfileCredentialsDto,
    AuthProfileSummary,
    CreateAuthProfileDto,
    UpdateAuthRefreshDto,
)
from app.services.auth_profiles_service import AuthProfilesService

router = APIRouter(prefix="/projects/{project_id}/auth-profiles", tags=["auth-profiles"])

_service = AuthProfilesService(
    auth_profile_repository, project_repository, test_case_repository
)


def get_auth_profiles_service() -> AuthProfilesService:
    return _service


@router.get("", response_model=List[AuthProfileSummary])
@router.get("/", response_model=List[AuthProfileSummary], include_in_schema=False)
def list_auth_profiles(
    project_id: str,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    return service.list_for_project(project_id)


@router.post("", response_model=AuthProfileSummary)
@router.post("/", response_model=AuthProfileSummary, include_in_schema=False)
def create_auth_profile(
    project_id: str,
    input_dto: CreateAuthProfileDto,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    return service.create(project_id, input_dto)


@router.put("/{profile_id}/credentials", response_model=AuthProfileSummary)
def set_auth_profile_credentials(
    project_id: str,
    profile_id: str,
    input_dto: AuthProfileCredentialsDto,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    """Store credentials encrypted at rest; the password is never returned."""
    return service.set_credentials(project_id, profile_id, input_dto)


@router.put("/{profile_id}/refresh", response_model=AuthProfileSummary)
def set_auth_profile_refresh(
    project_id: str,
    profile_id: str,
    input_dto: UpdateAuthRefreshDto,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    """Store non-secret refresh settings. Credentials stay in the encrypted store."""
    return service.set_refresh(project_id, profile_id, input_dto)


@router.post("/{profile_id}/record", response_model=AuthProfileSummary)
def record_auth_profile_login(
    project_id: str,
    profile_id: str,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    return service.record_login(project_id, profile_id)


@router.delete("/{profile_id}", status_code=204)
def delete_auth_profile(
    project_id: str,
    profile_id: str,
    service: AuthProfilesService = Depends(get_auth_profiles_service),
):
    service.delete(project_id, profile_id)
    return Response(status_code=204)
