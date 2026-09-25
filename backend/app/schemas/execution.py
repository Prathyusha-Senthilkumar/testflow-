from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExecutionState = Literal["queued", "running", "completed", "failed", "scheduled", "cancelled"]


class StartExecutionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    config_path: Optional[str] = Field(None, alias="configPath")
    script_path: Optional[str] = Field(None, alias="scriptPath")
    project_id: Optional[str] = Field(None, alias="projectId")
    test_case_code: Optional[str] = Field(None, alias="testCaseCode")
    test_case_id: Optional[str] = Field(None, alias="testCaseId")
    headed: Optional[bool] = None
    run_at: Optional[datetime] = Field(
        None,
        alias="runAt",
        description="Timezone-aware instant when this run should start.",
    )
    time_zone: Optional[str] = Field(
        None,
        alias="timeZone",
        description="IANA timezone the tester selected. The instant is runAt.",
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
    test_run_id: Optional[str] = Field(None, alias="testRunId")


class StartSuiteBatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(..., alias="projectId")
    suite_id: str = Field(..., alias="suiteId")
    environment_id: str = Field(..., alias="environmentId")


class StartProjectBatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(..., alias="projectId")
    suite_category: Optional[str] = Field(None, alias="suiteCategory")
    environment_id: str = Field(..., alias="environmentId")


BatchCaseOutcome = Literal["skipped", "queued", "running", "passed", "failed", "cancelled"]


class BatchCaseResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    test_case_id: str = Field(..., alias="testCaseId")
    test_case_code: str = Field(..., alias="testCaseCode")
    name: str
    outcome: BatchCaseOutcome
    reason: Optional[str] = None
    duration_ms: Optional[int] = Field(None, alias="durationMs")
    test_run_id: Optional[str] = Field(None, alias="testRunId")
    suite_id: Optional[str] = Field(None, alias="suiteId")
    suite_name: Optional[str] = Field(None, alias="suiteName")


class BatchExecutionStatus(BaseModel):
    """User-facing suite or project run. Child queue ids stay on the server."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    batch_id: str = Field(..., alias="batchId")
    batch_type: Literal["suite", "project"] = Field(..., alias="batchType")
    project_id: str = Field(..., alias="projectId")
    suite_id: Optional[str] = Field(None, alias="suiteId")
    total: int
    passed: int
    failed: int
    queued: int
    running: int
    completed: int
    skipped: int
    cancelled: int = 0
    cancel_requested: bool = Field(False, alias="cancelRequested")
    finished: bool
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    project_name: Optional[str] = Field(None, alias="projectName")
    suite_name: Optional[str] = Field(None, alias="suiteName")
    suite_category: Optional[str] = Field(None, alias="suiteCategory")
    environment_id: Optional[str] = Field(None, alias="environmentId")
    environment_name: Optional[str] = Field(None, alias="environmentName")
    duration_ms: Optional[int] = Field(None, alias="durationMs")
    cases: list[BatchCaseResult]


class ScheduledExecution(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    job_id: str = Field(..., alias="jobId")
    scheduled_for: Optional[datetime] = Field(None, alias="scheduledFor")
    project_id: Optional[str] = Field(None, alias="projectId")
    test_case_id: Optional[str] = Field(None, alias="testCaseId")
    test_case_code: Optional[str] = Field(None, alias="testCaseCode")
    time_zone: Optional[str] = Field(None, alias="timeZone")
