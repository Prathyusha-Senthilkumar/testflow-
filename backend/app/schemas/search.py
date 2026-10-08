from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SearchType = Literal["project", "suite", "test_case", "run"]
SearchScope = Literal["all", "project", "suite", "test_case", "run"]

SEARCH_TYPES: tuple[SearchType, ...] = ("project", "suite", "test_case", "run")
SEARCH_LABELS: dict[str, str] = {
    "project": "Projects",
    "suite": "Test suites",
    "test_case": "Test cases",
    "run": "Test runs",
}

MIN_QUERY_LENGTH = 2
DEFAULT_LIMIT = 5
MAX_LIMIT = 50


class SearchItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    type: SearchType
    title: str
    subtitle: Optional[str] = None
    projectId: Optional[str] = Field(default=None, alias="projectId")
    projectName: Optional[str] = Field(default=None, alias="projectName")
    # Lowercase run status: queued | running | passed | failed | cancelled | not_run.
    status: Optional[str] = None
    updatedAt: Optional[str] = Field(default=None, alias="updatedAt")
    # Only set on run items.
    testCaseId: Optional[str] = Field(default=None, alias="testCaseId")


class SearchGroup(BaseModel):
    type: SearchType
    label: str
    total: int
    items: List[SearchItem] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    type: SearchScope
    groups: List[SearchGroup] = Field(default_factory=list)
