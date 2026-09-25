from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class TestRunResult(BaseModel):
    status: Literal["Passed", "Failed"]
    duration: float
    error: Optional[str] = None


class ReportRun(BaseModel):
    """One persisted run for the Reports screen. No queue job id and no secrets."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: Optional[str] = Field(None, alias="projectId")
    projectName: Optional[str] = Field(None, alias="projectName")
    suiteId: Optional[str] = Field(None, alias="suiteId")
    suiteName: Optional[str] = Field(None, alias="suiteName")
    testCaseId: Optional[str] = Field(None, alias="testCaseId")
    testCaseCode: Optional[str] = Field(None, alias="testCaseCode")
    testName: Optional[str] = Field(None, alias="testName")
    status: str
    startedAt: Optional[str] = Field(None, alias="startedAt")
    completedAt: Optional[str] = Field(None, alias="completedAt")
    durationMs: Optional[int] = Field(None, alias="durationMs")
    errorMessage: Optional[str] = Field(None, alias="errorMessage")
    runBy: Optional[str] = Field(None, alias="runBy")


class GroupedRun(BaseModel):
    """One top-level Test Runs row: an individual case, or a suite/project batch."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    run_type: Literal["individual", "suite", "project"] = Field(..., alias="runType")
    title: str
    code: Optional[str] = None
    suite_category: Optional[str] = Field(None, alias="suiteCategory")
    environment_name: Optional[str] = Field(None, alias="environmentName")
    status: str
    started_at: Optional[str] = Field(None, alias="startedAt")
    duration_ms: Optional[int] = Field(None, alias="durationMs")
    project_id: Optional[str] = Field(None, alias="projectId")
    total: Optional[int] = None
    completed: Optional[int] = None
    passed: Optional[int] = None
    failed: Optional[int] = None
    skipped: Optional[int] = None
    queued: Optional[int] = None
    running: Optional[int] = None
    cancelled: Optional[int] = None
    error_message: Optional[str] = Field(None, alias="errorMessage")


class TestRunHistoryItem(BaseModel):
    """One persisted execution, shaped for the Test Runs / Reports views."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    testCaseId: Optional[str] = Field(None, alias="testCaseId")
    testCaseCode: Optional[str] = Field(None, alias="testCaseCode")
    testName: Optional[str] = Field(None, alias="testName")
    status: str
    startedAt: Optional[str] = Field(None, alias="startedAt")
    completedAt: Optional[str] = Field(None, alias="completedAt")
    durationMs: Optional[int] = Field(None, alias="durationMs")
    errorMessage: Optional[str] = Field(None, alias="errorMessage")
    jobId: Optional[str] = Field(None, alias="jobId")
    scheduledFor: Optional[str] = Field(None, alias="scheduledFor")
    timeZone: Optional[str] = Field(None, alias="timeZone")
