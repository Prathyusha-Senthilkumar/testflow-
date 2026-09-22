from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExecutionState = Literal["queued", "running", "completed", "failed", "scheduled"]


class StartExecutionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    config_path: Optional[str] = Field(None, alias="configPath")
    script_path: Optional[str] = Field(None, alias="scriptPath")
    project_id: Optional[str] = Field(None, alias="projectId")
    test_case_code: Optional[str] = Field(None, alias="testCaseCode")
    test_case_id: Optional[str] = Field(None, alias="testCaseId")
    headed: Optional[bool] = None
    run_at: Optional[datetime] = Field(
        None, alias="runAt", description="Schedule the run for this future time (UTC)."
    )

    @model_validator(mode="after")
    def require_path(self) -> "StartExecutionRequest":
        if not (self.config_path and self.config_path.strip()) and not (
            self.script_path and self.script_path.strip()
        ):
            raise ValueError("configPath or scriptPath is required")
        return self


class ExecutionResultPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    success: bool
    status: str
    pytest_return_code: int = Field(..., alias="pytestReturnCode")
    config_path: str = Field(..., alias="configPath")
    title: Optional[str] = None
    test_file_location: Optional[str] = Field(None, alias="testFileLocation")
    test_case_location: Optional[str] = Field(None, alias="testCaseLocation")
    validation_errors: Optional[list[str]] = Field(None, alias="validationErrors")
    error_message: Optional[str] = Field(None, alias="errorMessage")
    duration_ms: Optional[int] = Field(None, alias="durationMs")


class ExecutionStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    job_id: str = Field(..., alias="jobId")
    state: ExecutionState
    config_path: Optional[str] = Field(None, alias="configPath")
    project_id: Optional[str] = Field(None, alias="projectId")
    test_case_code: Optional[str] = Field(None, alias="testCaseCode")
    result: Optional[ExecutionResultPayload] = None
    error: Optional[str] = None
    scheduled_for: Optional[datetime] = Field(None, alias="scheduledFor")


class ScheduledExecution(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    job_id: str = Field(..., alias="jobId")
    scheduled_for: Optional[datetime] = Field(None, alias="scheduledFor")
    project_id: Optional[str] = Field(None, alias="projectId")
    test_case_id: Optional[str] = Field(None, alias="testCaseId")
    test_case_code: Optional[str] = Field(None, alias="testCaseCode")
