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

    def list_report(self, limit: int = 500) -> list[dict]:
        """Persisted runs with project and suite names. Does not return job ids."""
        if not self.db:
            return []
        runs = (
            self.db.from_("test_runs")
            .select(
                "id,test_case_id,status,started_at,completed_at,duration_ms,error_message,run_by"
            )
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        cases, suites, projects = self._report_lookups(runs)
        return [self._report_row(run, cases, suites, projects) for run in runs]

    def get_report(self, run_id: str) -> Optional[dict]:
        if not self.db:
            return None
        rows = (
            self.db.from_("test_runs")
            .select(
                "id,test_case_id,status,started_at,completed_at,duration_ms,error_message,run_by"
            )
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        return self._report_row(rows[0], *self._report_lookups(rows))

    def _report_lookups(self, runs: list[dict]) -> tuple[dict, dict, dict]:
        case_ids = list({str(run["test_case_id"]) for run in runs if run.get("test_case_id")})
        cases: dict[str, dict] = {}
        if case_ids:
            cases = {
                str(row["id"]): row
                for row in (
                    self.db.from_("test_cases")
                    .select("id,name,test_case_code,suite_id")
                    .in_("id", case_ids)
                    .execute()
                    .data
                    or []
                )
            }
        suite_ids = list({str(case["suite_id"]) for case in cases.values() if case.get("suite_id")})
        suites: dict[str, dict] = {}
        if suite_ids:
            suites = {
                str(row["id"]): row
                for row in (
                    self.db.from_("test_suites")
                    .select("id,name,project_id")
                    .in_("id", suite_ids)
                    .execute()
                    .data
                    or []
                )
            }
        project_ids = list(
            {str(suite["project_id"]) for suite in suites.values() if suite.get("project_id")}
        )
        projects: dict[str, dict] = {}
        if project_ids:
            projects = {
                str(row["id"]): row
                for row in (
                    self.db.from_("projects")
                    .select("id,name")
                    .in_("id", project_ids)
                    .execute()
                    .data
                    or []
                )
            }
        return cases, suites, projects

    @staticmethod
    def _report_row(
        run: dict,
        cases: dict,
        suites: dict,
        projects: dict,
    ) -> dict:
        case = cases.get(str(run.get("test_case_id") or "")) or {}
        suite = suites.get(str(case.get("suite_id") or "")) or {}
        project = projects.get(str(suite.get("project_id") or "")) or {}
        return {
            "id": str(run.get("id")),
            "projectId": suite.get("project_id"),
            "projectName": project.get("name"),
            "suiteId": case.get("suite_id"),
            "suiteName": suite.get("name"),
            "testCaseId": run.get("test_case_id"),
            "testCaseCode": case.get("test_case_code"),
            "testName": case.get("name"),
            "status": str(run.get("status") or "Not Run"),
            "startedAt": run.get("started_at"),
            "completedAt": run.get("completed_at"),
            "durationMs": run.get("duration_ms"),
            "errorMessage": run.get("error_message"),
            "runBy": run.get("run_by"),
        }

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
