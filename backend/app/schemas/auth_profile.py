from typing import Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

SessionStatus = Literal["none", "active", "expiring", "expired"]
RefreshStrategy = Literal["cookie", "localStorage"]
RefreshMethod = Literal["GET", "POST"]
RefreshSendToken = Literal["accessToken", "refreshToken"]


class AuthRefreshConfig(BaseModel):
    """Non-secret refresh settings. Token values never belong here."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    strategy: RefreshStrategy
    url: str = Field(..., min_length=1)
    method: RefreshMethod = "POST"
    origin: Optional[str] = None
    accessTokenKey: Optional[str] = Field(default=None, alias="accessTokenKey")
    refreshTokenKey: Optional[str] = Field(default=None, alias="refreshTokenKey")
    sendToken: RefreshSendToken = Field(default="refreshToken", alias="sendToken")
    accessTokenJsonPath: Optional[str] = Field(default=None, alias="accessTokenJsonPath")
    refreshTokenJsonPath: Optional[str] = Field(default=None, alias="refreshTokenJsonPath")
    authorizationHeader: str = Field(default="Authorization", alias="authorizationHeader")


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
    hasCredentials: bool = Field(default=False, alias="hasCredentials")
    username: Optional[str] = None
    refresh: Optional[AuthRefreshConfig] = None
    createdAt: str = Field(..., alias="createdAt")


class CreateAuthProfileDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    loginUrl: str | None = Field(default=None, alias="loginUrl")
    username: str | None = None
    password: str | None = None


class UpdateAuthRefreshDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    refresh: Optional[AuthRefreshConfig] = None


class AuthProfileCredentialsDto(BaseModel):
    """Write-only: the password is never returned by the API."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
