from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class GitHubConnection(BaseModel):
    """A project's linked repository. Never carries the token, only its last characters."""

    connected: bool
    owner: Optional[str] = None
    repo: Optional[str] = None
    repoUrl: Optional[str] = None
    tokenHint: Optional[str] = None
    autoCreateIssues: bool = True
    connectedAt: Optional[str] = None


class SaveGitHubConnection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    repo: str = Field(..., min_length=3, max_length=300, description="owner/name or a github.com URL")
    token: Optional[str] = Field(None, max_length=500, description="Required on first connect; omit to keep it")
    autoCreateIssues: Optional[bool] = None


class DisconnectResult(BaseModel):
    revoked: bool
    message: str


class RunGitHubIssue(BaseModel):
    number: Optional[int] = None
    url: Optional[str] = None
    state: Literal["open", "closed", "pending", "error"]
    createdAt: str
    commented: bool = False
    error: Optional[str] = None


class RunGitHubIssueStatus(BaseModel):
    issue: Optional[RunGitHubIssue] = None
    connected: bool
