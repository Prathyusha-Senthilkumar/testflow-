from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class RunScreenshot(BaseModel):
    file: str
    label: str
    failed: bool = False
    error: Optional[str] = None
    # Signed, short-lived image URL relative to the API base (no /api prefix).
    url: Optional[str] = None


class LiveCaseRun(BaseModel):
    """A test case that is queued or running, including one started from another tab or device."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    testCaseId: str = Field(alias="testCaseId")
    suiteId: Optional[str] = Field(None, alias="suiteId")
    status: str
    runId: Optional[str] = Field(None, alias="runId")
    batchId: Optional[str] = Field(None, alias="batchId")
    runBy: Optional[str] = Field(None, alias="runBy")
    startedAt: Optional[str] = Field(None, alias="startedAt")


class LiveSuiteRun(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    suiteId: str = Field(alias="suiteId")
    batchId: Optional[str] = Field(None, alias="batchId")
    status: str
    runBy: Optional[str] = Field(None, alias="runBy")


class LiveProjectRun(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    batchId: str = Field(alias="batchId")
    status: str
    runBy: Optional[str] = Field(None, alias="runBy")


class ProjectLiveActivity(BaseModel):
    """Queued and running work for one project, shared by every open session."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    cases: list[LiveCaseRun] = Field(default_factory=list)
    suites: list[LiveSuiteRun] = Field(default_factory=list)
    project: Optional[LiveProjectRun] = None


class LatestCaseRun(BaseModel):
    """Latest persisted result for one test case. No script, cookies, or job payload."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    testCaseId: str = Field(alias="testCaseId")
    projectId: Optional[str] = Field(None, alias="projectId")
    status: str
    startedAt: Optional[str] = Field(None, alias="startedAt")
    completedAt: Optional[str] = Field(None, alias="completedAt")
    runBy: Optional[str] = Field(None, alias="runBy")


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
    category: Optional[str] = None
    status: str
    startedAt: Optional[str] = Field(None, alias="startedAt")
    completedAt: Optional[str] = Field(None, alias="completedAt")
    durationMs: Optional[int] = Field(None, alias="durationMs")
    errorMessage: Optional[str] = Field(None, alias="errorMessage")
    runBy: Optional[str] = Field(None, alias="runBy")
    screenshotPath: Optional[str] = Field(None, alias="screenshotPath")
    # Test-case record, filled on the single-run view. Older rows have no author.
    createdBy: Optional[str] = Field(None, alias="createdBy")
    createdAt: Optional[str] = Field(None, alias="createdAt")
    lastModifiedBy: Optional[str] = Field(None, alias="lastModifiedBy")
    lastModifiedAt: Optional[str] = Field(None, alias="lastModifiedAt")
    firstRunBy: Optional[str] = Field(None, alias="firstRunBy")
    firstRunAt: Optional[str] = Field(None, alias="firstRunAt")
    lastRunBy: Optional[str] = Field(None, alias="lastRunBy")
    lastRunAt: Optional[str] = Field(None, alias="lastRunAt")


class GroupedRun(BaseModel):
    """One top-level Test Runs row: an individual case, or a suite/project batch."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    run_type: Literal["individual", "suite", "project"] = Field(..., alias="runType")
    title: str
    code: Optional[str] = None
    suite_category: Optional[str] = Field(None, alias="suiteCategory")
    # Smoke / sanity / regression tags used by the Test Runs category filter.
    categories: list[str] = Field(default_factory=list)
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
    screenshotPath: Optional[str] = Field(None, alias="screenshotPath")
