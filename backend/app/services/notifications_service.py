"""In-app notifications for the signed-in user: list, unread count, read state, preferences.

Run notifications are produced by the test_runs status trigger in
supabase/migrations/20261008_notifications.sql. `notify` is the backend-side producer for
anything the database cannot see (and lets demo mode and tests create notifications).
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.repositories.notification_repository import NotificationRepository, notification_repository
from app.schemas.notification import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    NotificationItem,
    NotificationListResponse,
    NotificationPreferences,
    ReadAllResponse,
    UnreadCountResponse,
    UpdateNotificationPreferences,
)

logger = logging.getLogger("testflow.notifications")

NOT_FOUND = "Notification not found."
_PREF_FIELDS = {
    "runFailed": "run_failed",
    "runPassed": "run_passed",
    "batchCompleted": "batch_completed",
    "runStuck": "run_stuck",
}
# Preference that gates each notification type; types not listed are always delivered.
_TYPE_PREFERENCE = {
    "run_failed": "run_failed",
    "run_passed": "run_passed",
    "batch_completed": "batch_completed",
    "run_stuck": "run_stuck",
}


def _valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value or "")


class NotificationsService:
    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    # ---- reads ------------------------------------------------------------------------------

    def list(
        self,
        user_id: str,
        *,
        unread_only: bool = False,
        limit: int = DEFAULT_LIMIT,
        before: Optional[str] = None,
    ) -> NotificationListResponse:
        limit = max(1, min(int(limit), MAX_LIMIT))
        cursor = self._parse_cursor(before)
        # Fetch one extra row to know whether another page exists.
        rows = self.repository.list_for_user(user_id, unread_only=unread_only, limit=limit + 1, before=cursor)
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._to_item(row) for row in rows]
        return NotificationListResponse(
            items=items,
            unreadCount=self.repository.unread_count(user_id),
            nextCursor=items[-1].createdAt if has_more and items else None,
        )

    def unread_count(self, user_id: str) -> UnreadCountResponse:
        return UnreadCountResponse(unreadCount=self.repository.unread_count(user_id))

    # ---- writes -----------------------------------------------------------------------------

    def mark_read(self, user_id: str, notification_id: str) -> UnreadCountResponse:
        if not _valid_uuid(notification_id) or not self.repository.mark_read(user_id, notification_id):
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        return self.unread_count(user_id)

    def mark_unread(self, user_id: str, notification_id: str) -> UnreadCountResponse:
        if not _valid_uuid(notification_id) or not self.repository.mark_unread(user_id, notification_id):
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        return self.unread_count(user_id)

    def mark_all_read(self, user_id: str) -> ReadAllResponse:
        updated = self.repository.mark_all_read(user_id)
        return ReadAllResponse(updated=updated, unreadCount=self.repository.unread_count(user_id))

    def delete(self, user_id: str, notification_id: str) -> None:
        if not _valid_uuid(notification_id) or not self.repository.delete(user_id, notification_id):
            raise HTTPException(status_code=404, detail=NOT_FOUND)

    def notify(
        self,
        user_id: str,
        *,
        type: str,
        severity: str,
        title: str,
        body: Optional[str] = None,
        link: Optional[str] = None,
        project_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        dedupe_key: Optional[str] = None,
    ) -> Optional[NotificationItem]:
        """Create a notification unless the user turned this type off or it is a duplicate."""
        if not user_id:
            return None
        pref = _TYPE_PREFERENCE.get(type)
        if pref and not self.repository.get_preferences(user_id).get(pref, True):
            return None
        if link is not None and (not link.startswith("/") or link.startswith("//")):
            raise ValueError("Notification links must be app-relative paths.")
        row = self.repository.create(
            {
                "user_id": user_id,
                "type": type,
                "severity": severity,
                "title": title[:200],
                "body": body[:500] if body else None,
                "link": link,
                "project_id": project_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "dedupe_key": dedupe_key,
            }
        )
        if row:
            logger.info("event=notification_created type=%s notification_id=%s", type, row.get("id"))
        return self._to_item(row) if row else None

    # ---- preferences ------------------------------------------------------------------------

    def get_preferences(self, user_id: str) -> NotificationPreferences:
        return self._to_preferences(self.repository.get_preferences(user_id))

    def update_preferences(self, user_id: str, dto: UpdateNotificationPreferences) -> NotificationPreferences:
        values = {
            column: getattr(dto, field)
            for field, column in _PREF_FIELDS.items()
            if getattr(dto, field) is not None
        }
        saved = self.repository.save_preferences(user_id, values)
        if saved is None:
            raise HTTPException(status_code=503, detail="Notification preferences are not available yet.")
        return self._to_preferences(saved)

    # ---- mapping ----------------------------------------------------------------------------

    @staticmethod
    def _parse_cursor(before: Optional[str]) -> Optional[str]:
        if before is None or not str(before).strip():
            return None
        try:
            parsed = datetime.fromisoformat(str(before).strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="before: must be an ISO 8601 timestamp") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()

    @staticmethod
    def _to_item(row: dict) -> NotificationItem:
        return NotificationItem(
            id=str(row["id"]),
            type=row["type"],
            severity=row["severity"],
            title=str(row.get("title") or ""),
            body=row.get("body"),
            link=row.get("link"),
            projectId=str(row["project_id"]) if row.get("project_id") else None,
            entityType=row.get("entity_type"),
            entityId=str(row["entity_id"]) if row.get("entity_id") else None,
            read=bool(row.get("read_at")),
            createdAt=_iso(row.get("created_at")),
        )

    @staticmethod
    def _to_preferences(values: dict) -> NotificationPreferences:
        return NotificationPreferences(
            **{field: bool(values.get(column)) for field, column in _PREF_FIELDS.items()}
        )


notifications_service = NotificationsService(notification_repository)
