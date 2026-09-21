from typing import Optional

from app.database import get_supabase_client


class TestRunRepository:
    """Persistent run history in Supabase test_runs. No-ops in demo mode."""

    @property
    def db(self):
        return get_supabase_client()

    def create_queued(
        self,
        test_case_id: str,
        job_id: str,
        config_path: Optional[str],
    ) -> Optional[str]:
        if not self.db:
            return None
        res = (
            self.db.from_("test_runs")
            .insert(
                {
                    "test_case_id": test_case_id,
                    "status": "Queued",
                    "job_id": job_id,
                    "config_path": config_path,
                }
            )
            .execute()
        )
        if res.data:
            return str(res.data[0]["id"])
        return None

    def mark_running(self, job_id: str) -> None:
        if not self.db:
            return
        self.db.from_("test_runs").update({"status": "Running"}).eq("job_id", job_id).execute()

    def mark_result(
        self,
        job_id: str,
        status: str,
        duration_ms: Optional[int],
        error_message: Optional[str],
    ) -> None:
        if not self.db:
            return
        from datetime import datetime, timezone

        self.db.from_("test_runs").update(
            {
                "status": status,
                "duration_ms": duration_ms,
                "error_message": error_message,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("job_id", job_id).execute()


test_run_repository = TestRunRepository()
