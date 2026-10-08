"""Notifications and notification preferences: Supabase tables, or an in-memory store in demo mode.

Every read and write is scoped to one recipient user id. Rows are returned as plain dicts with
the table's snake_case columns.

If the notifications migration has not been applied yet, reads return nothing (and writes are
skipped) instead of failing the request. The missing table is logged once and re-checked
every few minutes so applying the migration does not need a restart.
"""

import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.database import get_supabase_client

logger = logging.getLogger("testflow.notifications")

NOTIFICATIONS_TABLE = "notifications"
PREFERENCES_TABLE = "notification_preferences"
PREFERENCE_COLUMNS = ("run_failed", "run_passed", "batch_completed", "run_stuck")
DEFAULT_PREFERENCES = {"run_failed": True, "run_passed": False, "batch_completed": True, "run_stuck": True}
_MISSING_RECHECK_SECONDS = 300
_LIST_COLUMNS = "id,user_id,project_id,type,severity,title,body,link,entity_type,entity_id,read_at,created_at"


def _is_missing_table(exc: Exception) -> bool:
    message = str(exc)
    code = str(getattr(exc, "code", "") or "")
    # PostgREST answers a HEAD/count request on an unknown table with a bare 404 and an
    # empty body, which supabase-py surfaces as code 404 "JSON could not be generated".
    return (
        code in ("PGRST205", "42P01", "404")
        or "PGRST205" in message
        or "42P01" in message
        or "JSON could not be generated" in message
        or ("relation" in message and "does not exist" in message)
    )


def _is_duplicate(exc: Exception) -> bool:
    code = str(getattr(exc, "code", "") or "")
    return code == "23505" or "23505" in str(exc) or "duplicate key" in str(exc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class NotificationRepository:
    def __init__(self):
        self._lock = threading.Lock()
        self._demo: dict[str, list[dict]] = {}
        self._demo_prefs: dict[str, dict] = {}
        self._missing_since: dict[str, float] = {}
        self._missing_logged: set[str] = set()
        self._demo_last_stamp: Optional[datetime] = None

    @property
    def db(self):
        return get_supabase_client()

    # ---- missing-table fallback -------------------------------------------------------------

    def _table_known_missing(self, table: str) -> bool:
        since = self._missing_since.get(table)
        if since is None:
            return False
        if time.monotonic() - since >= _MISSING_RECHECK_SECONDS:
            self._missing_since.pop(table, None)
            return False
        return True

    def _note_missing(self, table: str) -> None:
        self._missing_since[table] = time.monotonic()
        if table not in self._missing_logged:
            self._missing_logged.add(table)
            logger.warning(
                "event=notifications_table_missing table=%s action=apply supabase/migrations/20261008_notifications.sql",
                table,
            )

    def _run(self, table: str, fallback, operation):
        """Run a Supabase call; return `fallback` when the table does not exist yet."""
        if self._table_known_missing(table):
            return fallback
        try:
            return operation(self.db.from_(table))
        except Exception as exc:
            if _is_missing_table(exc):
                self._note_missing(table)
                return fallback
            raise

    # ---- notifications ----------------------------------------------------------------------

    def list_for_user(
        self, user_id: str, *, unread_only: bool, limit: int, before: Optional[str]
    ) -> list[dict]:
        if not self.db:
            with self._lock:
                rows = [dict(row) for row in self._demo.get(user_id, [])]
            if unread_only:
                rows = [row for row in rows if not row.get("read_at")]
            if before:
                cutoff = _parse(before)
                rows = [row for row in rows if _parse(row["created_at"]) < cutoff]
            rows.sort(key=lambda row: _parse(row["created_at"]), reverse=True)
            return rows[:limit]

        def query(table):
            q = table.select(_LIST_COLUMNS).eq("user_id", user_id)
            if unread_only:
                q = q.is_("read_at", "null")
            if before:
                q = q.lt("created_at", before)
            return q.order("created_at", desc=True).order("id", desc=True).limit(limit).execute().data or []

        return self._run(NOTIFICATIONS_TABLE, [], query)

    def unread_count(self, user_id: str) -> int:
        if not self.db:
            with self._lock:
                return sum(1 for row in self._demo.get(user_id, []) if not row.get("read_at"))

        def query(table):
            res = (
                table.select("id", count="exact", head=True)
                .eq("user_id", user_id)
                .is_("read_at", "null")
                .execute()
            )
            return int(res.count or 0)

        return self._run(NOTIFICATIONS_TABLE, 0, query)

    def mark_read(self, user_id: str, notification_id: str) -> bool:
        """True when the notification exists for this user (already-read counts as found)."""
        now = _now_iso()
        if not self.db:
            with self._lock:
                for row in self._demo.get(user_id, []):
                    if row["id"] == notification_id:
                        row["read_at"] = row.get("read_at") or now
                        row["updated_at"] = now
                        return True
            return False

        def query(table):
            existing = (
                table.select("id,read_at").eq("user_id", user_id).eq("id", notification_id).limit(1).execute().data
                or []
            )
            if not existing:
                return False
            if not existing[0].get("read_at"):
                (
                    self.db.from_(NOTIFICATIONS_TABLE)
                    .update({"read_at": now, "updated_at": now})
                    .eq("user_id", user_id)
                    .eq("id", notification_id)
                    .is_("read_at", "null")
                    .execute()
                )
            return True

        return self._run(NOTIFICATIONS_TABLE, False, query)

    def mark_unread(self, user_id: str, notification_id: str) -> bool:
        """Clear read_at. True when the notification exists for this user."""
        now = _now_iso()
        if not self.db:
            with self._lock:
                for row in self._demo.get(user_id, []):
                    if row["id"] == notification_id:
                        row["read_at"] = None
                        row["updated_at"] = now
                        return True
            return False

        def query(table):
            rows = (
                table.update({"read_at": None, "updated_at": now})
                .eq("user_id", user_id)
                .eq("id", notification_id)
                .execute()
                .data
                or []
            )
            return bool(rows)

        return self._run(NOTIFICATIONS_TABLE, False, query)

    def mark_all_read(self, user_id: str) -> int:
        now = _now_iso()
        if not self.db:
            changed = 0
            with self._lock:
                for row in self._demo.get(user_id, []):
                    if not row.get("read_at"):
                        row["read_at"] = now
                        row["updated_at"] = now
                        changed += 1
            return changed

        def query(table):
            rows = (
                table.update({"read_at": now, "updated_at": now})
                .eq("user_id", user_id)
                .is_("read_at", "null")
                .execute()
                .data
                or []
            )
            return len(rows)

        return self._run(NOTIFICATIONS_TABLE, 0, query)

    def delete(self, user_id: str, notification_id: str) -> bool:
        if not self.db:
            with self._lock:
                rows = self._demo.get(user_id, [])
                kept = [row for row in rows if row["id"] != notification_id]
                self._demo[user_id] = kept
                return len(kept) != len(rows)

        def query(table):
            rows = table.delete().eq("user_id", user_id).eq("id", notification_id).execute().data or []
            return bool(rows)

        return self._run(NOTIFICATIONS_TABLE, False, query)

    def create(self, row: dict) -> Optional[dict]:
        """Insert one notification. Returns None when it is a duplicate (same user + dedupe_key)."""
        user_id = str(row["user_id"])
        if not self.db:
            with self._lock:
                # Strictly increasing in demo mode so the createdAt cursor never skips a row.
                stamp = datetime.now(timezone.utc)
                if self._demo_last_stamp and stamp <= self._demo_last_stamp:
                    stamp = self._demo_last_stamp + timedelta(microseconds=1)
                self._demo_last_stamp = stamp
            now = row.get("created_at") or stamp.isoformat()
            stored = {
                "id": str(uuid.uuid4()),
                "project_id": None,
                "body": None,
                "link": None,
                "entity_type": None,
                "entity_id": None,
                "dedupe_key": None,
                "read_at": None,
                "updated_at": now,
                **row,
                "created_at": now,
            }
            with self._lock:
                rows = self._demo.setdefault(user_id, [])
                key = stored.get("dedupe_key")
                if key and any(existing.get("dedupe_key") == key for existing in rows):
                    return None
                rows.append(stored)
            return dict(stored)

        def query(table):
            try:
                return (table.insert(row).execute().data or [None])[0]
            except Exception as exc:
                if _is_duplicate(exc):
                    return None
                raise

        return self._run(NOTIFICATIONS_TABLE, None, query)

    def reset_demo(self) -> None:
        """Test helper: clear the in-memory store."""
        with self._lock:
            self._demo.clear()
            self._demo_prefs.clear()

    # ---- preferences ------------------------------------------------------------------------

    def get_preferences(self, user_id: str) -> dict:
        if not self.db:
            with self._lock:
                return {**DEFAULT_PREFERENCES, **self._demo_prefs.get(user_id, {})}

        def query(table):
            rows = table.select(",".join(PREFERENCE_COLUMNS)).eq("user_id", user_id).limit(1).execute().data or []
            return rows[0] if rows else None

        row = self._run(PREFERENCES_TABLE, None, query) or {}
        return {key: bool(row.get(key, default)) for key, default in DEFAULT_PREFERENCES.items()}

    def save_preferences(self, user_id: str, values: dict) -> Optional[dict]:
        """Upsert preferences. Returns None when the preferences table does not exist yet."""
        values = {key: bool(value) for key, value in values.items() if key in PREFERENCE_COLUMNS}
        if not self.db:
            with self._lock:
                merged = {**DEFAULT_PREFERENCES, **self._demo_prefs.get(user_id, {}), **values}
                self._demo_prefs[user_id] = merged
                return dict(merged)

        current = self.get_preferences(user_id)
        payload = {"user_id": user_id, **current, **values, "updated_at": _now_iso()}

        def query(table):
            table.upsert(payload, on_conflict="user_id").execute()
            return {key: payload[key] for key in PREFERENCE_COLUMNS}

        return self._run(PREFERENCES_TABLE, None, query)


notification_repository = NotificationRepository()
