from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

from app.schemas.test_case import TestCaseSummary

SuiteCategory = Literal["smoke", "sanity", "regression", "full_regression"]
SUITE_CATEGORY_LABELS = {
    "smoke": "Smoke",
    "sanity": "Sanity",
    "regression": "Regression",
    "full_regression": "Full Regression",
}


def parse_suite_categories(row: dict) -> List[str]:
    raw = row.get("categories") or []
    if isinstance(raw, str):
        raw = [raw]
    values = [item for item in raw if item in SUITE_CATEGORY_LABELS]
    if not values:
        fallback = row.get("category") or "regression"
        values = [fallback if fallback in SUITE_CATEGORY_LABELS else "regression"]
    return values


MIGRATION_HINT = (
    "Apply supabase/migrations/004_multi_categories_and_environments.sql "
    "in the Supabase SQL editor, then save again."
)


def missing_multi_column(exc: Exception) -> bool:
    text = str(exc)
    return "categories" in text or "environment_ids" in text


def normalize_suite_categories(
    categories: Optional[List[str]],
    category: Optional[str] = None,
) -> List[str]:
    source = list(categories or [])
    if not source and category:
        source = [category]
    values: List[str] = []
    for item in source:
        if item in SUITE_CATEGORY_LABELS and item not in values:
            values.append(item)
    return values


class TestSuiteSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str
    name: str
    description: Optional[str] = None
    category: SuiteCategory = "regression"
    categories: List[SuiteCategory] = Field(default_factory=lambda: ["regression"])
    caseCount: int = 0
    createdAt: Optional[str] = None


class TestSuiteDetail(TestSuiteSummary):
    testCases: List[TestCaseSummary] = Field(default_factory=list, alias="testCases")


class CreateTestSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: Optional[str] = None
    category: Optional[SuiteCategory] = None
    categories: Optional[List[SuiteCategory]] = None


class UpdateTestSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[SuiteCategory] = None
    categories: Optional[List[SuiteCategory]] = None


class AddTestCasesToSuiteDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    testCaseIds: List[str] = Field(..., alias="testCaseIds")
