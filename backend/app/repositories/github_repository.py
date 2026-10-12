"""GitHub connections and filed issues: Supabase tables, or an in-memory store in demo mode.

Rows are plain dicts with the tables' snake_case columns. When the migration has not been
applied, every call raises GitHubTablesMissing so the service can answer with a clear 409.
"""

import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.database import get_supabase_client

CONNECTIONS_TABLE = "project_github_connections"
ISSUES_TABLE = "github_issues"


class GitHubTablesMissing(RuntimeError):
    """The GitHub integration migration has not been applied."""


def _is_missing(exc: Exception) -> bool:
    message = str(exc)
    code = str(getattr(exc, "code", "") or "")
    return (
        code in ("PGRST205", "42P01", "PGRST204", "42703")
        or any(marker in message for marker in ("PGRST205", "42P01", "PGRST204", "42703"))
        or ("relation" in message and "does not exist" in message)
    )


def _is_duplicate(exc: Exception) -> bool:
    code = str(getattr(exc, "code", "") or "")
    return code == "23505" or "23505" in str(exc) or "duplicate key" in str(exc)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class GitHubRepository:
    def __init__(self):
        self._lock = threading.Lock()
        self._connections: dict[str, dict] = {}
        self._issues: dict[str, dict] = {}

    @property
    def db(self):
        return get_supabase_client()

    def _table(self, name: str, operation):
        try:
            return operation(self.db.from_(name))
        except Exception as exc:
            if _is_missing(exc):
                raise GitHubTablesMissing(str(exc)) from None
            raise

    # ---- connections -------------------------------------------------------------------------

    def get_connection(self, project_id: str) -> Optional[dict]:
        if not self.db:
            with self._lock:
                row = self._connections.get(project_id)
                return dict(row) if row else None
        rows = self._table(
            CONNECTIONS_TABLE, lambda t: t.select("*").eq("project_id", project_id).limit(1).execute().data or []
        )
        return rows[0] if rows else None

    def save_connection(self, project_id: str, values: dict) -> dict:
        """Insert or update the project's connection. `values` holds only the columns to set."""
        existing = self.get_connection(project_id)
        stamp = _now()
        if not self.db:
            with self._lock:
                row = dict(existing or {"id": str(uuid.uuid4()), "project_id": project_id, "created_at": stamp})
                row.update(values, updated_at=stamp)
                row.setdefault("auto_create_issues", True)
                self._connections[project_id] = row
                return dict(row)
        if existing:
            rows = self._table(
                CONNECTIONS_TABLE,
                lambda t: t.update({**values, "updated_at": stamp}).eq("project_id", project_id).execute().data or [],
            )
        else:
            rows = self._table(
                CONNECTIONS_TABLE, lambda t: t.insert({**values, "project_id": project_id}).execute().data or []
            )
        return rows[0] if rows else self.get_connection(project_id) or {}

    def delete_connection(self, project_id: str) -> None:
        if not self.db:
            with self._lock:
                self._connections.pop(project_id, None)
            return
        self._table(CONNECTIONS_TABLE, lambda t: t.delete().eq("project_id", project_id).execute())

    def list_auto_connections(self) -> list[dict]:
        if not self.db:
            with self._lock:
                return [dict(row) for row in self._connections.values() if row.get("auto_create_issues")]
        return self._table(
            CONNECTIONS_TABLE, lambda t: t.select("*").eq("auto_create_issues", True).execute().data or []
        )

    # ---- issues ------------------------------------------------------------------------------

    def get_issue_for_run(self, run_id: str) -> Optional[dict]:
        if not self.db:
            with self._lock:
                row = self._issues.get(run_id)
                return dict(row) if row else None
        rows = self._table(ISSUES_TABLE, lambda t: t.select("*").eq("run_id", run_id).limit(1).execute().data or [])
        return rows[0] if rows else None

    def run_ids_with_issues(self, run_ids: list[str]) -> set[str]:
        if not run_ids:
            return set()
        if not self.db:
            with self._lock:
                return {run_id for run_id in run_ids if run_id in self._issues}
        rows = self._table(ISSUES_TABLE, lambda t: t.select("run_id").in_("run_id", run_ids).execute().data or [])
        return {str(row["run_id"]) for row in rows}

    def claim_run(self, run_id: str, project_id: str, test_case_id: Optional[str]) -> bool:
        """Insert the pending row for a run. False when another caller already claimed it."""
        row = {
            "run_id": run_id,
            "project_id": project_id,
            "test_case_id": test_case_id,
            "state": "pending",
            "attempts": 1,
        }
        if not self.db:
            with self._lock:
                if run_id in self._issues:
                    return False
                stamp = _now()
                self._issues[run_id] = {
                    **row, "id": str(uuid.uuid4()), "commented": False, "issue_number": None,
                    "issue_url": None, "last_error": None, "created_at": stamp, "updated_at": stamp,
                }
                return True
        try:
            self._table(ISSUES_TABLE, lambda t: t.insert(row).execute())
        except Exception as exc:
            if _is_duplicate(exc):
                return False
            raise
        return True

    def claim_retry(self, run_id: str, attempts: int) -> bool:
        """Move an errored row back to pending. Only one caller wins for a given attempt count."""
        values = {"state": "pending", "attempts": attempts + 1, "updated_at": _now()}
        if not self.db:
            with self._lock:
                row = self._issues.get(run_id)
                if not row or row["state"] != "error" or row["attempts"] != attempts:
                    return False
                row.update(values)
                return True
        rows = self._table(
            ISSUES_TABLE,
            lambda t: t.update(values).eq("run_id", run_id).eq("state", "error").eq("attempts", attempts).execute().data
            or [],
        )
        return bool(rows)

    def update_issue(self, run_id: str, values: dict) -> None:
        values = {**values, "updated_at": _now()}
        if not self.db:
            with self._lock:
                if run_id in self._issues:
                    self._issues[run_id].update(values)
            return
        self._table(ISSUES_TABLE, lambda t: t.update(values).eq("run_id", run_id).execute())

    def open_issue_for_case(self, project_id: str, test_case_id: str) -> Optional[dict]:
        """The newest open issue Attest filed for this test case, if any."""
        if not self.db:
            with self._lock:
                rows = [
                    dict(row) for row in self._issues.values()
                    if row["project_id"] == project_id and row.get("test_case_id") == test_case_id
                    and row["state"] == "open" and row.get("issue_number")
                ]
            rows.sort(key=lambda row: row["created_at"], reverse=True)
            return rows[0] if rows else None
        rows = self._table(
            ISSUES_TABLE,
            lambda t: t.select("*")
            .eq("project_id", project_id)
            .eq("test_case_id", test_case_id)
            .eq("state", "open")
            .not_.is_("issue_number", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or [],
        )
        return rows[0] if rows else None

    def set_issue_state(self, project_id: str, issue_number: int, state: str) -> None:
        """Mirror a GitHub issue's state onto every run row that points at it."""
        values = {"state": state, "updated_at": _now()}
        if not self.db:
            with self._lock:
                for row in self._issues.values():
                    if row["project_id"] == project_id and row.get("issue_number") == issue_number:
                        row.update(values)
            return
        self._table(
            ISSUES_TABLE,
            lambda t: t.update(values).eq("project_id", project_id).eq("issue_number", issue_number).execute(),
        )

    def list_errored(self, max_attempts: int, limit: int = 20) -> list[dict]:
        if not self.db:
            with self._lock:
                rows = [dict(row) for row in self._issues.values() if row["state"] == "error"]
            return [row for row in rows if row["attempts"] < max_attempts][:limit]
        return self._table(
            ISSUES_TABLE,
            lambda t: t.select("*").eq("state", "error").lt("attempts", max_attempts).limit(limit).execute().data
            or [],
        )


github_repository = GitHubRepository()
