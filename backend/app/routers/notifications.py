from typing import Optional

from fastapi import APIRouter, Depends, Query, Response

from app.dependencies.auth import current_user_id
from app.schemas.notification import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    NotificationListResponse,
    NotificationPreferences,
    ReadAllResponse,
    UnreadCountResponse,
    UpdateNotificationPreferences,
)
from app.services.notifications_service import NotificationsService, notifications_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_notifications_service() -> NotificationsService:
    return notifications_service


@router.get("", response_model=NotificationListResponse)
@router.get("/", response_model=NotificationListResponse, include_in_schema=False)
def list_notifications(
    unread_only: bool = Query(False, alias="unreadOnly"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    before: Optional[str] = Query(None, description="createdAt cursor from the previous page's nextCursor"),
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.list(user_id, unread_only=unread_only, limit=limit, before=before)


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.unread_count(user_id)


@router.get("/preferences", response_model=NotificationPreferences)
def get_preferences(
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.get_preferences(user_id)


@router.put("/preferences", response_model=NotificationPreferences)
def update_preferences(
    dto: UpdateNotificationPreferences,
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.update_preferences(user_id, dto)


@router.post("/read-all", response_model=ReadAllResponse)
def mark_all_read(
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.mark_all_read(user_id)


@router.post("/{notification_id}/read", response_model=UnreadCountResponse)
def mark_read(
    notification_id: str,
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.mark_read(user_id, notification_id)


@router.post("/{notification_id}/unread", response_model=UnreadCountResponse)
def mark_unread(
    notification_id: str,
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    return service.mark_unread(user_id, notification_id)


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: str,
    user_id: str = Depends(current_user_id),
    service: NotificationsService = Depends(get_notifications_service),
):
    service.delete(user_id, notification_id)
    return Response(status_code=204)
