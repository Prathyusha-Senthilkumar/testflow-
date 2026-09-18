from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class TestResultStatus(str, Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"


class TestResult(BaseModel):
    id: str
    execution_id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    status: TestResultStatus
    started_at: str
    completed_at: str
    duration: float  # in seconds
    exit_code: int = 0
    error_message: Optional[str] = None
    stdout_snippet: Optional[str] = None
    stderr_snippet: Optional[str] = None
    log_file_path: Optional[str] = None
    artifacts: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TestResultResponseDto(BaseModel):
    id: str
    execution_id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    status: TestResultStatus
    started_at: str
    completed_at: str
    duration: float
    exit_code: int
    error_message: Optional[str] = None
    stdout_snippet: Optional[str] = None
    stderr_snippet: Optional[str] = None
    log_file_path: Optional[str] = None
    artifacts: List[str]
    created_at: str


class TestCaseHistoryDto(BaseModel):
    test_case_id: str
    total_runs: int
    passed_count: int
    failed_count: int
    pass_rate: float
    results: List[TestResultResponseDto]
