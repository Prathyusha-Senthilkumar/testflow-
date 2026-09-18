from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.execution import ExecutionStatus
from app.models.test_result import TestResultStatus


class WorkerJobDto(BaseModel):
    id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    execution_mode: str = "auto"
    started_at: Optional[str] = None
    test_file: Optional[str] = None
    auth_storage_state_path: Optional[str] = None
    auth_storage_state_error: Optional[str] = None
    artifacts_dir: str
    timeout_seconds: int = 60


class WorkerPollResponse(BaseModel):
    job: Optional[WorkerJobDto] = None


class WorkerResultDto(BaseModel):
    execution_id: str
    status: TestResultStatus
    exit_code: int = 0
    duration: float = 0.0
    error_message: Optional[str] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    log_file_path: Optional[str] = None
    artifacts: List[str] = Field(default_factory=list)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    runner_type: Optional[str] = None


class WorkerResultResponse(BaseModel):
    execution_id: str
    status: ExecutionStatus
    result_id: str


class WorkerStatusDto(BaseModel):
    connected: bool
    last_poll_at: Optional[str] = None
    last_result_at: Optional[str] = None
    in_progress_execution_id: Optional[str] = None
    poll_count: int = 0
    result_count: int = 0
