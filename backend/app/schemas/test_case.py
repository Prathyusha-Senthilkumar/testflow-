from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator

StorageKind = Literal["localStorage", "sessionStorage", "cookie"]


class StorageEntry(BaseModel):
    """One localStorage/sessionStorage/cookie value to seed or assert."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    kind: StorageKind
    key: str
    value: str = ""

from app.schemas.test_assertion import AssertionConfig
from app.schemas.test_classification import (
    DEFAULT_TEST_CASE_CATEGORY,
    DEFAULT_TEST_CASE_SCENARIO,
    TestCaseCategory,
    TestCaseScenario,
)


class TestCaseSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    code: str
    name: str
    description: Optional[str] = None
    category: TestCaseCategory = DEFAULT_TEST_CASE_CATEGORY
    scenario: TestCaseScenario = DEFAULT_TEST_CASE_SCENARIO
    automationStatus: str = Field(..., alias="automationStatus")
    testFile: Optional[str] = Field(None, alias="testFile")
    environmentId: Optional[str] = Field(default=None, alias="environmentId")
    authProfileId: Optional[str] = Field(default=None, alias="authProfileId")
    startPath: str = Field(default="/", alias="startPath")
    resolvedStartUrl: Optional[str] = Field(default=None, alias="resolvedStartUrl")
    expectedResult: Optional[str] = Field(default=None, alias="expectedResult")
    storageSeeds: List[StorageEntry] = Field(default_factory=list, alias="storageSeeds")
    storageAssertions: List[StorageEntry] = Field(
        default_factory=list, alias="storageAssertions"
    )
    accessibilityEnabled: bool = Field(default=False, alias="accessibilityEnabled")
    networkCheckEnabled: bool = Field(default=False, alias="networkCheckEnabled")
    isDraft: bool = Field(default=True, alias="isDraft")
    publishedVersion: int = Field(default=0, alias="publishedVersion")
    assertions: List[AssertionConfig] = Field(default_factory=list)


class CreateTestCaseDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    description: Optional[str] = None
    category: TestCaseCategory = DEFAULT_TEST_CASE_CATEGORY
    scenario: TestCaseScenario = DEFAULT_TEST_CASE_SCENARIO
    suiteId: Optional[str] = Field(default=None, alias="suiteId")


class UpdateTestCaseDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    environmentId: Optional[str] = Field(None, alias="environmentId")
    authProfileId: Optional[str] = Field(None, alias="authProfileId")
    startPath: Optional[str] = Field(None, alias="startPath")
    expectedResult: Optional[str] = Field(None, alias="expectedResult")
    category: Optional[TestCaseCategory] = None
    scenario: Optional[TestCaseScenario] = None
    assertions: Optional[List[AssertionConfig]] = None
    storageSeeds: Optional[List[StorageEntry]] = Field(None, alias="storageSeeds")
    storageAssertions: Optional[List[StorageEntry]] = Field(None, alias="storageAssertions")
    accessibilityEnabled: Optional[bool] = Field(None, alias="accessibilityEnabled")
    networkCheckEnabled: Optional[bool] = Field(None, alias="networkCheckEnabled")

    @field_validator("assertions", mode="before")
    @classmethod
    def drop_assertions_without_expected_value(cls, value):
        if value is None or not isinstance(value, list):
            return value
        kept = []
        for item in value:
            if isinstance(item, dict):
                if not (item.get("value") or "").strip():
                    continue
                kept.append(item)
            else:
                kept.append(item)
        return kept
