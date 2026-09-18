from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class ExecutionStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"


class ExecutionJob(BaseModel):
    id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    status: ExecutionStatus = ExecutionStatus.QUEUED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    result_id: Optional[str] = None
    execution_mode: str = "auto"  # "docker", "local", "auto"


class ExecutionCreateDto(BaseModel):
    test_case_id: str
    auth_profile_id: Optional[str] = None
    execution_mode: Optional[str] = "auto"


class ExecutionResponseDto(BaseModel):
    execution_id: str
    status: ExecutionStatus
    test_case_id: str
    auth_profile_id: Optional[str] = None
    created_at: str


class ExecutionDetailDto(BaseModel):
    id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    status: ExecutionStatus
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    result_id: Optional[str] = None
    execution_mode: str


class ExecutionCancelResponseDto(BaseModel):
    execution_id: str
    status: ExecutionStatus
    message: str
