from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict

from app.schemas.test_case import TestCaseSummary


class TestSuiteSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str
    name: str
    description: Optional[str] = None
    caseCount: int = 0
    createdAt: Optional[str] = None


class TestSuiteDetail(TestSuiteSummary):
    testCases: List[TestCaseSummary] = Field(default_factory=list, alias="testCases")


class CreateTestSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: Optional[str] = None


class UpdateTestSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    description: Optional[str] = None


class AddTestCasesToSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    testCaseIds: List[str] = Field(..., alias="testCaseIds")
