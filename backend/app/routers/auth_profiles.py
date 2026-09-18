from typing import List
from fastapi import APIRouter, status
from app.models.auth_profile import (
    AuthProfileCreateDto,
    AuthProfileUpdateDto,
    AuthProfileResponseDto,
    AuthProfileValidateResponseDto
)
from app.services.auth_profile_service import auth_profile_service

router = APIRouter(prefix="/auth-profiles", tags=["Auth Profiles"])


@router.post("", response_model=AuthProfileResponseDto, status_code=status.HTTP_201_CREATED)
async def create_auth_profile(dto: AuthProfileCreateDto):
    """Create a new Auth Profile for Playwright session testing."""
    return await auth_profile_service.create_profile(dto)


@router.get("", response_model=List[AuthProfileResponseDto])
async def list_auth_profiles(include_inactive: bool = True):
    """List all available Auth Profiles."""
    return await auth_profile_service.list_profiles(include_inactive=include_inactive)


@router.get("/{id}", response_model=AuthProfileResponseDto)
async def get_auth_profile(id: str):
    """Get Auth Profile by ID."""
    return await auth_profile_service.get_profile(id)


@router.put("/{id}", response_model=AuthProfileResponseDto)
async def update_auth_profile(id: str, dto: AuthProfileUpdateDto):
    """Update an Auth Profile."""
    return await auth_profile_service.update_profile(id, dto)


@router.delete("/{id}")
async def delete_auth_profile(id: str):
    """Deactivate or remove an Auth Profile."""
    return await auth_profile_service.delete_profile(id)


@router.post("/{id}/validate", response_model=AuthProfileValidateResponseDto)
async def validate_auth_profile(id: str):
    """Validate that the stored authentication / session state can be used."""
    return await auth_profile_service.validate_profile(id)
