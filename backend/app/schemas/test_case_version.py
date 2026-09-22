from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict

from app.schemas.test_classification import TestCaseCategory, TestCaseScenario


class TestCaseVersionSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    versionNumber: int
    label: str
    publishedAt: str


class TestCaseVersionDetail(TestCaseVersionSummary):
    name: str
    description: Optional[str] = None
    category: TestCaseCategory
    scenario: TestCaseScenario
    environmentId: Optional[str] = None
    authProfileId: Optional[str] = None
    startPath: str
    expectedResult: Optional[str] = None
    testFile: Optional[str] = None
    scriptSnapshot: Optional[str] = None
