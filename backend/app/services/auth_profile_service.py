import os
import json
import uuid
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException
import logging

from app.models.auth_profile import (
    AuthProfile,
    AuthProfileCreateDto,
    AuthProfileUpdateDto,
    AuthProfileResponseDto,
    AuthProfileValidateResponseDto,
    AuthType
)
from app.repositories.execution_repository import execution_repository

logger = logging.getLogger("testflow.auth_profiles")


class AuthProfileService:
    def __init__(self):
        self.repo = execution_repository

    def _to_response_dto(self, profile: AuthProfile) -> AuthProfileResponseDto:
        return AuthProfileResponseDto(
            id=profile.id,
            name=profile.name,
            description=profile.description,
            type=profile.type,
            storage_state_path=profile.storage_state_path,
            has_headers=bool(profile.extra_headers),
            is_active=profile.is_active,
            created_at=profile.created_at,
            updated_at=profile.updated_at
        )

    async def create_profile(self, dto: AuthProfileCreateDto) -> AuthProfileResponseDto:
        profile_id = dto.id.strip() if dto.id and dto.id.strip() else f"auth_{uuid.uuid4().hex[:8]}"
        
        # Check if already exists
        existing = await self.repo.get_auth_profile(profile_id)
        if existing:
            raise HTTPException(status_code=400, detail=f"Auth profile with ID '{profile_id}' already exists")

        now = datetime.now(timezone.utc).isoformat()
        profile = AuthProfile(
            id=profile_id,
            name=dto.name.strip(),
            description=dto.description,
            type=dto.type,
            storage_state_path=dto.storage_state_path,
            extra_headers=dto.extra_headers,
            is_active=dto.is_active,
            created_at=now,
            updated_at=now
        )
        saved = await self.repo.create_auth_profile(profile)
        logger.info(f"Created auth profile: {saved.id} ({saved.name})")
        return self._to_response_dto(saved)

    async def list_profiles(self, include_inactive: bool = True) -> List[AuthProfileResponseDto]:
        profiles = await self.repo.list_auth_profiles(include_inactive=include_inactive)
        return [self._to_response_dto(p) for p in profiles]

    async def get_profile(self, profile_id: str) -> AuthProfileResponseDto:
        profile = await self.repo.get_auth_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Auth profile '{profile_id}' not found")
        return self._to_response_dto(profile)

    async def get_raw_profile(self, profile_id: str) -> AuthProfile:
        """Internal worker/runner use only: provides file/header secrets without HTTP exposure."""
        profile = await self.repo.get_auth_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Auth profile '{profile_id}' not found")
        return profile

    async def update_profile(self, profile_id: str, dto: AuthProfileUpdateDto) -> AuthProfileResponseDto:
        profile = await self.repo.get_auth_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Auth profile '{profile_id}' not found")

        if dto.name is not None:
            profile.name = dto.name.strip()
        if dto.description is not None:
            profile.description = dto.description
        if dto.type is not None:
            profile.type = dto.type
        if dto.storage_state_path is not None:
            profile.storage_state_path = dto.storage_state_path
        if dto.extra_headers is not None:
            profile.extra_headers = dto.extra_headers
        if dto.is_active is not None:
            profile.is_active = dto.is_active

        profile.updated_at = datetime.now(timezone.utc).isoformat()
        updated = await self.repo.update_auth_profile(profile)
        logger.info(f"Updated auth profile: {updated.id}")
        return self._to_response_dto(updated)

    async def delete_profile(self, profile_id: str) -> dict:
        profile = await self.repo.get_auth_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Auth profile '{profile_id}' not found")
        
        await self.repo.delete_auth_profile(profile_id)
        logger.info(f"Deactivated auth profile: {profile_id}")
        return {"message": f"Auth profile '{profile_id}' deactivated successfully", "id": profile_id}

    async def validate_profile(self, profile_id: str) -> AuthProfileValidateResponseDto:
        profile = await self.repo.get_auth_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Auth profile '{profile_id}' not found")

        if not profile.is_active:
            return AuthProfileValidateResponseDto(
                valid=False,
                profile_id=profile.id,
                message="Auth profile is marked inactive."
            )

        if profile.type == AuthType.PLAYWRIGHT_STORAGE_STATE:
            if not profile.storage_state_path:
                return AuthProfileValidateResponseDto(
                    valid=False,
                    profile_id=profile.id,
                    message="Profile missing storage_state_path."
                )

            path = Path(profile.storage_state_path)
            if not path.is_absolute():
                # Relative to workspace root or current dir
                cwd_path = Path.cwd() / path
                if not cwd_path.exists():
                    # Check parent project root
                    parent_path = Path.cwd().parent / path
                    path = parent_path if parent_path.exists() else cwd_path
                else:
                    path = cwd_path

            if not path.exists():
                return AuthProfileValidateResponseDto(
                    valid=False,
                    profile_id=profile.id,
                    message=f"Storage state file does not exist at '{profile.storage_state_path}'"
                )

            try:
                content = json.loads(path.read_text(encoding="utf-8"))
                cookies_count = len(content.get("cookies", []))
                origins_count = len(content.get("origins", []))
                return AuthProfileValidateResponseDto(
                    valid=True,
                    profile_id=profile.id,
                    message="Playwright storage state is valid and readable.",
                    details={
                        "cookies_count": cookies_count,
                        "origins_count": origins_count,
                        "path": str(profile.storage_state_path)
                    }
                )
            except Exception as exc:
                return AuthProfileValidateResponseDto(
                    valid=False,
                    profile_id=profile.id,
                    message="Storage state is invalid JSON."
                )

        return AuthProfileValidateResponseDto(
            valid=True,
            profile_id=profile.id,
            message=f"Auth profile '{profile.id}' is valid."
        )


auth_profile_service = AuthProfileService()
