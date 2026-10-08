import json
import re
from pathlib import Path
from typing import Optional

from app.database import get_supabase_client

_SCHEDULE_TTL_SECONDS = 60 * 60 * 24 * 30
# Non-terminal statuses. Terminal: Passed, Failed, Not Run (cancel = Not Run + "Cancelled").
ACTIVE_STATUSES = ("Queued", "Running")


class TestRunRepository:
    """Persistent run history in Supabase test_runs. No-ops in demo mode."""

    @property
    def db(self):
        return get_supabase_client()

    def ensure_profile(self, user_id: str, name: str) -> bool:
        """Keep a profiles row so test_runs.run_by can reference the signed-in user."""
        if not self.db or not user_id:
            return False
        try:
            self.db.from_("profiles").upsert(
                {"id": user_id, "name": (name or "Account").strip() or "Account"},
                on_conflict="id",
            ).execute()
            return True
        except Exception:
            return False

    def profile_names(self, user_ids: list[str]) -> dict[str, str]:
        ids = list({user_id for user_id in user_ids if user_id})
        if not self.db or not ids:
            return {}
        names: dict[str, str] = {}
        try:
            rows = (
                self.db.from_("profiles")
                .select("id,name")
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            names = {str(row["id"]): str(row.get("name") or "") for row in rows if row.get("id") and row.get("name")}
        except Exception:
            names = {}
        missing = [user_id for user_id in ids if not names.get(user_id)]
        if missing:
            from app.services.account_service import display_names

            names.update(display_names(missing))
        return names

    def create_queued(
        self,
        test_case_id: str,
        job_id: str,
        config_path: Optional[str],
        run_by: Optional[str] = None,
    ) -> Optional[str]:
        if not self.db:
            return None
        payload = {
            "test_case_id": test_case_id,
            "status": "Queued",
            "job_id": job_id,
            "config_path": config_path,
        }
        if run_by:
            payload["run_by"] = run_by
        try:
            res = self.db.from_("test_runs").insert(payload).execute()
        except Exception:
            if not run_by:
                raise
            payload.pop("run_by", None)
            res = self.db.from_("test_runs").insert(payload).execute()
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

    def list_recent_for_activity(self, limit: int = 200) -> list[dict]:
        """Recent case runs with project id and job id, for grouping on Test Runs."""
        if not self.db:
            return []
        runs = (
            self.db.from_("test_runs")
            .select("id,test_case_id,status,started_at,completed_at,duration_ms,error_message,job_id")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        cases, suites, projects = self._report_lookups(runs)
        items: list[dict] = []
        for run in runs:
            row = self._report_row(run, cases, suites, projects)
            row["jobId"] = run.get("job_id")
            items.append(row)
        return items

    def map_by_job_ids(self, job_ids: list[str]) -> dict[str, dict]:
        """Persisted case runs keyed by the existing job_id column."""
        if not self.db or not job_ids:
            return {}
        rows = (
            self.db.from_("test_runs")
            .select("id,job_id,status,duration_ms,error_message,completed_at")
            .in_("job_id", job_ids)
            .execute()
            .data
            or []
        )
        found: dict[str, dict] = {}
        for row in rows:
            job_id = str(row.get("job_id") or "")
            if not job_id:
                continue
            found[job_id] = {
                "id": str(row.get("id")),
                "status": str(row.get("status") or ""),
                "durationMs": row.get("duration_ms"),
                "errorMessage": row.get("error_message"),
                "completedAt": row.get("completed_at"),
            }
        return found

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
                    "screenshotPath": run.get("screenshot_path") or None,
                    "jobId": job_id or None,
                    "scheduledFor": schedule.get("scheduledFor"),
                    "timeZone": schedule.get("timeZone"),
                }
            )
        return items

    def list_latest_for_project(self, project_id: str) -> list[dict]:
        """One latest run per test case in a project. Skips report name lookups."""
        if not self.db:
            return []
        suites = (
            self.db.from_("test_suites")
            .select("id")
            .eq("project_id", project_id)
            .execute()
            .data
            or []
        )
        suite_ids = [str(row["id"]) for row in suites if row.get("id")]
        if not suite_ids:
            return []
        cases = (
            self.db.from_("test_cases")
            .select("id")
            .in_("suite_id", suite_ids)
            .execute()
            .data
            or []
        )
        case_ids = [str(row["id"]) for row in cases if row.get("id")]
        if not case_ids:
            return []
        runs = (
            self.db.from_("test_runs")
            .select("test_case_id,status,started_at,completed_at,run_by")
            .in_("test_case_id", case_ids)
            .order("started_at", desc=True)
            .execute()
            .data
            or []
        )
        latest: dict[str, dict] = {}
        for run in runs:
            case_id = str(run.get("test_case_id") or "")
            if case_id and case_id not in latest:
                latest[case_id] = run
        names = self.profile_names([str(run.get("run_by") or "") for run in latest.values()])
        return [
            {
                "testCaseId": case_id,
                "projectId": project_id,
                "status": str(run.get("status") or ""),
                "startedAt": run.get("started_at"),
                "completedAt": run.get("completed_at"),
                "runBy": names.get(str(run.get("run_by") or "")) or None,
            }
            for case_id, run in latest.items()
        ]

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
        names = self.profile_names([str(run.get("run_by") or "") for run in runs])
        return [self._report_row(run, cases, suites, projects, names) for run in runs]

    def get_report(self, run_id: str) -> Optional[dict]:
        if not self.db:
            return None
        rows = (
            self.db.from_("test_runs")
            .select(
                "id,test_case_id,status,started_at,completed_at,duration_ms,error_message,run_by,screenshot_path"
            )
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        names = self.profile_names([str(rows[0].get("run_by") or "")])
        return self._report_row(rows[0], *self._report_lookups(rows), names)

    def _report_lookups(self, runs: list[dict]) -> tuple[dict, dict, dict]:
        case_ids = list({str(run["test_case_id"]) for run in runs if run.get("test_case_id")})
        cases: dict[str, dict] = {}
        if case_ids:
            cases = {
                str(row["id"]): row
                for row in (
                    self.db.from_("test_cases")
                    .select("id,name,test_case_code,suite_id,category")
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
        names: Optional[dict] = None,
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
            "category": case.get("category") or "Functional",
            "status": str(run.get("status") or "Not Run"),
            "startedAt": run.get("started_at"),
            "completedAt": run.get("completed_at"),
            "durationMs": run.get("duration_ms"),
            "errorMessage": run.get("error_message"),
            "runBy": (names or {}).get(str(run.get("run_by") or "")) or None,
            "screenshotPath": run.get("screenshot_path") or None,
        }

    def mark_running(self, job_id: str) -> None:
        """Queued -> Running only. Never resurrects a finished or cancelled run."""
        if not self.db:
            return
        from datetime import datetime, timezone

        self.db.from_("test_runs").update(
            {"status": "Running", "started_at": datetime.now(timezone.utc).isoformat()}
        ).eq("job_id", job_id).in_("status", ["Queued"]).execute()

    def mark_result(
        self,
        job_id: str,
        status: str,
        duration_ms: Optional[int],
        error_message: Optional[str],
    ) -> None:
        """Write a terminal result only while the run is still active (Queued/Running)."""
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
        ).eq("job_id", job_id).in_("status", list(ACTIVE_STATUSES)).execute()

    def find_stale_active(self, started_before: str, limit: int = 200) -> list[dict]:
        """Queued/Running rows whose started_at is older than `started_before` (ISO time)."""
        if not self.db:
            return []
        return (
            self.db.from_("test_runs")
            .select("id,job_id,status,started_at")
            .in_("status", list(ACTIVE_STATUSES))
            .lt("started_at", started_before)
            .order("started_at")
            .limit(limit)
            .execute()
            .data
            or []
        )

    def fail_if_active(self, run_ids: list[str], error_message: str) -> int:
        """Mark the given runs Failed, skipping any that finished meanwhile. Returns rows changed."""
        if not self.db or not run_ids:
            return 0
        from datetime import datetime, timezone

        res = (
            self.db.from_("test_runs")
            .update(
                {
                    "status": "Failed",
                    "error_message": error_message,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .in_("id", run_ids)
            .in_("status", list(ACTIVE_STATUSES))
            .execute()
        )
        return len(res.data or [])

    def mark_cancelled(self, job_id: str) -> None:
        """Record a cancel without a new status value. Passed and Failed rows stay as they are."""
        if not self.db:
            return
        from datetime import datetime, timezone

        self.db.from_("test_runs").update(
            {
                "status": "Not Run",
                "error_message": "Cancelled",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("job_id", job_id).in_("status", ["Queued", "Running"]).execute()

    def find_for_rerun(self, run_id: str) -> Optional[dict]:
        if not self.db:
            return None
        rows = (
            self.db.from_("test_runs")
            .select("id,test_case_id,status,error_message,job_id,config_path")
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        row = rows[0]
        report = self._report_row(row, *self._report_lookups([row]))
        report["jobId"] = row.get("job_id")
        report["configPath"] = row.get("config_path")
        report["errorMessage"] = row.get("error_message")
        return report

    def screenshot_file(self, run_id: str) -> Optional[Path]:
        """Resolve the stored final screenshot. Rejects anything outside results/<run>/final-screenshot.png."""
        if not self.db:
            return None
        rows = (
            self.db.from_("test_runs")
            .select("screenshot_path")
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        stored = str((rows[0] if rows else {}).get("screenshot_path") or "")
        if not re.fullmatch(r"results/[A-Za-z0-9_-]+/final-screenshot\.png", stored):
            return None
        from app.services.automation_service import _REPO_ROOT

        root = Path(_REPO_ROOT).resolve()
        candidate = (root / stored).resolve()
        results = (root / "results").resolve()
        if results not in candidate.parents or not candidate.is_file():
            return None
        return candidate

    def screenshot_steps(self, run_id: str) -> list[dict]:
        """Step images stored beside the final screenshot. No extra database column."""
        final = self.screenshot_file(run_id)
        if final is None:
            return []
        directory = final.parent
        manifest = directory / "steps.json"
        entries: list[dict] = []
        if manifest.is_file():
            try:
                raw = json.loads(manifest.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                raw = []
            if isinstance(raw, list):
                for item in raw:
                    if not isinstance(item, dict):
                        continue
                    file_name = str(item.get("file") or "")
                    if not _screenshot_name(file_name):
                        continue
                    if not (directory / file_name).is_file():
                        continue
                    entry = {"file": file_name, "label": str(item.get("label") or file_name)[:160]}
                    if item.get("failed") is True:
                        entry["failed"] = True
                        entry["error"] = str(item.get("error") or "")[:800]
                    entries.append(entry)
        if not entries and final.is_file():
            entries.append({"file": "final-screenshot.png", "label": "Final screenshot"})
        return entries

    def screenshot_named(self, run_id: str, file_name: str) -> Optional[Path]:
        if not _screenshot_name(file_name):
            return None
        final = self.screenshot_file(run_id)
        if final is None:
            return None
        candidate = (final.parent / file_name).resolve()
        if candidate.parent != final.parent.resolve() or not candidate.is_file():
            return None
        return candidate


def _screenshot_name(file_name: str) -> bool:
    return re.fullmatch(r"(?:step-\d{2}|final-screenshot)\.png", file_name) is not None


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
    """Recover the scheduled instant from the JSON job record."""
    try:
        from app.queue.job_store import fetch_job

        job = fetch_job(job_id)
    except Exception:
        return None
    if job is None:
        return None
    meta = job.meta
    time_zone = meta.get("schedule_time_zone")
    scheduled_for = meta.get("scheduled_for")
    if not time_zone and not scheduled_for:
        return None
    if not scheduled_for:
        return None
    return {
        "scheduledFor": scheduled_for,
        "timeZone": time_zone,
        "testCaseId": meta.get("test_case_id"),
    }


test_run_repository = TestRunRepository()
