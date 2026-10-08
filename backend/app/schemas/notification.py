from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

NotificationType = Literal[
    "run_failed",
    "run_passed",
    "batch_completed",
    "run_stuck",
    "auth_profile_attention",
    "system",
]
NotificationSeverity = Literal["info", "success", "warning", "error"]

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class NotificationItem(BaseModel):
    id: str
    type: NotificationType
    severity: NotificationSeverity
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    projectId: Optional[str] = None
    entityType: Optional[str] = None
    entityId: Optional[str] = None
    read: bool = False
    createdAt: str


class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    unreadCount: int
    # createdAt of the last item when more may exist; pass it back as `before`.
    nextCursor: Optional[str] = None


class UnreadCountResponse(BaseModel):
    unreadCount: int


class ReadAllResponse(BaseModel):
    updated: int
    unreadCount: int


class NotificationPreferences(BaseModel):
    runFailed: bool = True
    runPassed: bool = False
    batchCompleted: bool = True
    runStuck: bool = True


class UpdateNotificationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runFailed: Optional[bool] = None
    runPassed: Optional[bool] = None
    batchCompleted: Optional[bool] = None
    runStuck: Optional[bool] = None
