from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class AuthType(str, Enum):
    PLAYWRIGHT_STORAGE_STATE = "playwright_storage_state"
    BEARER_TOKEN = "bearer_token"
    CUSTOM_HEADERS = "custom_headers"


class AuthProfile(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: AuthType = AuthType.PLAYWRIGHT_STORAGE_STATE
    storage_state_path: Optional[str] = None
    # For token or header types, secrets are stored internally but NEVER returned over API
    extra_headers: Optional[Dict[str, str]] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AuthProfileCreateDto(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    type: AuthType = AuthType.PLAYWRIGHT_STORAGE_STATE
    storage_state_path: Optional[str] = None
    extra_headers: Optional[Dict[str, str]] = None
    is_active: bool = True


class AuthProfileUpdateDto(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[AuthType] = None
    storage_state_path: Optional[str] = None
    extra_headers: Optional[Dict[str, str]] = None
    is_active: Optional[bool] = None


class AuthProfileResponseDto(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: AuthType
    storage_state_path: Optional[str] = None
    has_headers: bool = False
    is_active: bool
    created_at: str
    updated_at: str


class AuthProfileValidateResponseDto(BaseModel):
    valid: bool
    profile_id: str
    message: str
    details: Optional[Dict[str, Any]] = None
