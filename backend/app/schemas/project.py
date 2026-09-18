from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

class SuiteSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    cases: int = 0
    passed: int = 0
    failed: int = 0
    notRun: int = Field(default=0, alias="notRun")
    passRate: float = Field(default=0.0, alias="passRate")
    lastRun: Optional[str] = Field(default=None, alias="lastRun")
    lastRunBy: Optional[str] = Field(default=None, alias="lastRunBy")

class ProjectSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    baseUrl: str = Field(..., alias="baseUrl")
    description: Optional[str] = None
    suites: int = 0
    cases: int = 0
    passed: int = 0
    failed: int = 0
    passRate: float = Field(default=0.0, alias="passRate")
    lastRun: Optional[str] = Field(default=None, alias="lastRun")
    lastRunBy: Optional[str] = Field(default=None, alias="lastRunBy")

class ProjectDetail(ProjectSummary):
    description: Optional[str] = None
    suitesList: List[SuiteSummary] = Field(default_factory=list, alias="suitesList")

class CreateProjectDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    baseUrl: str = Field(..., alias="baseUrl")
    description: Optional[str] = None

class UpdateProjectDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    baseUrl: Optional[str] = Field(default=None, alias="baseUrl")
    description: Optional[str] = None
