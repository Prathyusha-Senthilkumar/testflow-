from typing import Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

SessionStatus = Literal["none", "active", "expiring", "expired"]


class AuthProfileSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str = Field(..., alias="projectId")
    name: str
    loginUrl: str = Field(..., alias="loginUrl")
    hasStorageState: bool = Field(..., alias="hasStorageState")
    sessionStatus: SessionStatus = Field(default="none", alias="sessionStatus")
    sessionRecordedAt: Optional[str] = Field(default=None, alias="sessionRecordedAt")
    sessionExpiresAt: Optional[str] = Field(default=None, alias="sessionExpiresAt")
    needsRenewal: bool = Field(default=False, alias="needsRenewal")
    createdAt: str = Field(..., alias="createdAt")


class CreateAuthProfileDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    loginUrl: str | None = Field(default=None, alias="loginUrl")
