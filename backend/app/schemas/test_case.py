from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator

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
    startPath: str = Field(default="/", alias="startPath")
    resolvedStartUrl: Optional[str] = Field(default=None, alias="resolvedStartUrl")
    expectedResult: Optional[str] = Field(default=None, alias="expectedResult")
    isDraft: bool = Field(default=True, alias="isDraft")
    publishedVersion: int = Field(default=0, alias="publishedVersion")
    assertions: List[AssertionConfig] = Field(default_factory=list)


class CreateTestCaseDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    description: Optional[str] = None
    category: TestCaseCategory = DEFAULT_TEST_CASE_CATEGORY
    scenario: TestCaseScenario = DEFAULT_TEST_CASE_SCENARIO


class UpdateTestCaseDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    environmentId: Optional[str] = Field(None, alias="environmentId")
    startPath: Optional[str] = Field(None, alias="startPath")
    expectedResult: Optional[str] = Field(None, alias="expectedResult")
    category: Optional[TestCaseCategory] = None
    scenario: Optional[TestCaseScenario] = None
    assertions: Optional[List[AssertionConfig]] = None

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
