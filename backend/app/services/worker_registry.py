from datetime import datetime, timezone
from typing import Optional


class WorkerRegistry:
    """Tracks Node worker heartbeats so /api/worker/status can report connectivity."""

    STALE_AFTER_SECONDS = 15.0

    def __init__(self):
        self.last_poll_at: Optional[str] = None
        self.last_result_at: Optional[str] = None
        self.in_progress_execution_id: Optional[str] = None
        self.poll_count: int = 0
        self.result_count: int = 0

    def record_poll(self, execution_id: Optional[str] = None) -> None:
        self.last_poll_at = datetime.now(timezone.utc).isoformat()
        self.poll_count += 1
        if execution_id:
            self.in_progress_execution_id = execution_id

    def record_result(self, execution_id: Optional[str] = None) -> None:
        self.last_result_at = datetime.now(timezone.utc).isoformat()
        self.result_count += 1
        if execution_id and self.in_progress_execution_id == execution_id:
            self.in_progress_execution_id = None

    def snapshot(self) -> dict:
        last_poll = self.last_poll_at
        connected = False
        if last_poll:
            try:
                last_dt = datetime.fromisoformat(last_poll.replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - last_dt).total_seconds()
                connected = age <= self.STALE_AFTER_SECONDS
            except ValueError:
                connected = False
        return {
            "connected": connected,
            "last_poll_at": self.last_poll_at,
            "last_result_at": self.last_result_at,
            "in_progress_execution_id": self.in_progress_execution_id,
            "poll_count": self.poll_count,
            "result_count": self.result_count,
        }


worker_registry = WorkerRegistry()
