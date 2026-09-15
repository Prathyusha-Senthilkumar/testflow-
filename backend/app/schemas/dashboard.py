from typing import List
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.project import ProjectSummary

class DashboardData(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    projects: int
    testCases: int = Field(..., alias="testCases")
    passed: int
    failed: int
    recentProjects: List[ProjectSummary] = Field(..., alias="recentProjects")
