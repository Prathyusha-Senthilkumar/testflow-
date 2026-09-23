import json
from typing import Optional

from app.database import get_supabase_client

_SCHEDULE_TTL_SECONDS = 60 * 60 * 24 * 30


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

    def list_recent(self, limit: int = 50) -> list[dict]:
        """Recent runs enriched with their test-case name/code (no new tables)."""
        if not self.db:
            return []
        runs = (
            self.db.from_("test_runs")
            .select("*")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        case_ids = list({str(run["test_case_id"]) for run in runs if run.get("test_case_id")})
        cases: dict[str, dict] = {}
        if case_ids:
            rows = (
                self.db.from_("test_cases")
                .select("id,name,test_case_code")
                .in_("id", case_ids)
                .execute()
                .data
                or []
            )
            cases = {str(row["id"]): row for row in rows}

        enriched: list[dict] = []
        for run in runs:
            case = cases.get(str(run.get("test_case_id"))) or {}
            enriched.append(
                {
                    "id": str(run.get("id")),
                    "testCaseId": run.get("test_case_id"),
                    "testCaseCode": case.get("test_case_code"),
                    "testName": case.get("name"),
                    "status": str(run.get("status") or "Not Run"),
                    "startedAt": run.get("started_at"),
                    "completedAt": run.get("completed_at"),
                    "durationMs": run.get("duration_ms"),
                    "errorMessage": run.get("error_message"),
                    "jobId": run.get("job_id"),
                }
            )
        return enriched

    def list_for_test_case(self, test_case_id: str, limit: int = 20) -> list[dict]:
        """Runs for one case, with the scheduled time attached when this run was scheduled."""
        if not self.db:
            return []
        runs = (
            self.db.from_("test_runs")
            .select("*")
            .eq("test_case_id", test_case_id)
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        job_ids = [str(run["job_id"]) for run in runs if run.get("job_id")]
        schedules = _read_schedules(job_ids)
        items: list[dict] = []
        for run in runs:
            job_id = str(run.get("job_id") or "")
            schedule = schedules.get(job_id) or {}
            items.append(
                {
                    "id": str(run.get("id")),
                    "testCaseId": run.get("test_case_id"),
                    "status": str(run.get("status") or "Not Run"),
                    "startedAt": run.get("started_at"),
                    "completedAt": run.get("completed_at"),
                    "durationMs": run.get("duration_ms"),
                    "errorMessage": run.get("error_message"),
                    "jobId": job_id or None,
                    "scheduledFor": schedule.get("scheduledFor"),
                    "timeZone": schedule.get("timeZone"),
                }
            )
        return items

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


def remember_schedule(
    job_id: str,
    scheduled_for: str,
    time_zone: Optional[str],
    test_case_id: Optional[str],
) -> None:
    """Remember which instant a job was scheduled for. This is not a database column."""
    if not job_id or not scheduled_for:
        return
    payload = json.dumps(
        {
            "scheduledFor": scheduled_for,
            "timeZone": time_zone,
            "testCaseId": test_case_id,
        }
    )
    try:
        from app.queue.connection import get_redis_connection

        get_redis_connection().set(_schedule_key(job_id), payload, ex=_SCHEDULE_TTL_SECONDS)
    except Exception:
        return


def _schedule_key(job_id: str) -> str:
    return f"testflow:schedule:{job_id}"


def _read_schedules(job_ids: list[str]) -> dict[str, dict]:
    if not job_ids:
        return {}
    found: dict[str, dict] = {}
    try:
        from app.queue.connection import get_redis_connection

        raw_values = get_redis_connection().mget([_schedule_key(job_id) for job_id in job_ids])
    except Exception:
        raw_values = [None] * len(job_ids)
    for job_id, raw in zip(job_ids, raw_values):
        if not raw:
            recovered = _schedule_from_finished_job(job_id)
            if recovered:
                found[job_id] = recovered
                remember_schedule(
                    job_id,
                    str(recovered.get("scheduledFor") or ""),
                    recovered.get("timeZone"),
                    recovered.get("testCaseId"),
                )
            continue
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(parsed, dict):
            found[job_id] = parsed
    return found


def _schedule_from_finished_job(job_id: str) -> Optional[dict]:
    """Recover the scheduled instant from an RQ job that has not expired yet."""
    try:
        from rq.job import Job

        from app.queue.connection import get_redis_connection

        job = Job.fetch(job_id, connection=get_redis_connection())
    except Exception:
        return None
    meta = job.meta or {}
    time_zone = meta.get("schedule_time_zone")
    scheduled_for = meta.get("scheduled_for")
    if not time_zone and not scheduled_for:
        return None
    if not scheduled_for and job.started_at is not None:
        scheduled_for = job.started_at.isoformat()
    if not scheduled_for:
        return None
    return {
        "scheduledFor": scheduled_for,
        "timeZone": time_zone,
        "testCaseId": meta.get("test_case_id"),
    }


test_run_repository = TestRunRepository()
