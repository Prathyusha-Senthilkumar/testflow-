import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException

from app.execution.config_path import resolve_runner_config_path
from app.execution.runner_sidecar import ensure_runner_config_for_script
from app.queue.connection import get_redis_connection

_BATCH_KEY_PREFIX = "testflow:batch:"
_BATCH_TTL_SECONDS = 60 * 60 * 48
_NO_SCRIPT_REASON = "No automation script"
from app.queue.job_store import fetch_job, request_cancel
from app.schemas.execution import (
    BatchCaseResult,
    BatchExecutionStatus,
    ExecutionResultPayload,
    ExecutionState,
    ExecutionStatusResponse,
    ScheduledExecution,
    StartExecutionRequest,
)
from app.schemas.test_run import GroupedRun
from app.repositories.test_run_repository import remember_schedule, test_run_repository
from app.services.queue_service import get_queue_service


def _result_payload(raw: Any) -> Optional[ExecutionResultPayload]:
    if not isinstance(raw, dict):
        return None
    return ExecutionResultPayload(
        success=bool(raw.get("success")),
        status=str(raw.get("status", "")),
        pytest_return_code=int(raw.get("pytest_return_code", 1)),
        config_path=str(raw.get("config_path", "")),
        title=raw.get("title"),
        test_file_location=raw.get("test_file_location"),
        test_case_location=raw.get("test_case_location"),
        validation_errors=raw.get("validation_errors"),
        error_message=raw.get("error_message"),
        duration_ms=raw.get("duration_ms"),
    )


def _require_project_environment(project_id: str, environment_id: Optional[str]):
    """Reuse the environment table. Reject missing, deleted, and cross-project ids."""
    from app.repositories.environment_repository import environment_repository

    if not environment_id or not str(environment_id).strip():
        raise HTTPException(status_code=400, detail="Choose an environment for this run.")
    try:
        return environment_repository.find_by_id(project_id, str(environment_id).strip())
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(
                status_code=400,
                detail="That environment is not available for this project.",
            ) from exc
        raise


class ExecutionService:
    def start(
        self,
        request: StartExecutionRequest,
        environment_base_url: Optional[str] = None,
    ) -> ExecutionStatusResponse:
        try:
            if request.script_path and request.script_path.strip():
                title = (request.test_case_code or "TestFlow test case").strip()
                config_path = ensure_runner_config_for_script(request.script_path, title=title)
            else:
                config_path = resolve_runner_config_path(
                    config_path=request.config_path,
                    script_path=request.script_path,
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        time_zone = self._validate_time_zone(request.time_zone)
        queue_service = get_queue_service()
        run_at = self._validate_run_at(request.run_at)
        job = queue_service.submit(
            config_path=config_path,
            project_id=request.project_id,
            test_case_code=request.test_case_code,
            test_case_id=request.test_case_id,
            headed=request.headed,
            time_zone=time_zone,
            run_at=run_at,
            environment_base_url=environment_base_url,
        )

        if run_at is not None:
            remember_schedule(
                job.id,
                run_at.isoformat(),
                time_zone,
                request.test_case_id,
            )

        # Persist run history in Supabase when a real test-case id is provided.
        test_run_id = None
        if request.test_case_id:
            try:
                test_run_id = test_run_repository.create_queued(
                    test_case_id=request.test_case_id,
                    job_id=job.id,
                    config_path=config_path,
                )
            except Exception as exc:  # pragma: no cover - persistence is best-effort at enqueue
                import logging

                logging.getLogger("testflow.execution").warning(
                    "Could not persist queued test run: %s", exc
                )

        return ExecutionStatusResponse(
            job_id=job.id,
            state="scheduled" if run_at is not None else "queued",
            config_path=config_path,
            project_id=request.project_id,
            test_case_code=request.test_case_code,
            scheduled_for=run_at,
            test_run_id=test_run_id,
        )

    @staticmethod
    def _validate_run_at(run_at: Optional[datetime]) -> Optional[datetime]:
        if run_at is None:
            return None
        scheduled = run_at if run_at.tzinfo else run_at.replace(tzinfo=timezone.utc)
        if scheduled <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400, detail="Choose a date and time in the future."
            )
        return scheduled.astimezone(timezone.utc)

    @staticmethod
    def _validate_time_zone(time_zone: Optional[str]) -> Optional[str]:
        if time_zone is None or not str(time_zone).strip():
            return None
        name = str(time_zone).strip()
        try:
            from zoneinfo import ZoneInfo

            ZoneInfo(name)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Choose a valid timezone.") from exc
        return name

    def list_scheduled(self, test_case_id: Optional[str] = None) -> list[ScheduledExecution]:
        queue_service = get_queue_service()
        items: list[ScheduledExecution] = []
        for job in queue_service.scheduled_jobs():
            meta = job.meta or {}
            if test_case_id and meta.get("test_case_id") != test_case_id:
                continue
            items.append(
                ScheduledExecution(
                    job_id=job.id,
                    scheduled_for=queue_service.scheduled_time(job),
                    project_id=meta.get("project_id"),
                    test_case_id=meta.get("test_case_id"),
                    test_case_code=meta.get("test_case_code"),
                    time_zone=meta.get("schedule_time_zone"),
                )
            )
        return items

    def cancel_scheduled(self, job_id: str) -> None:
        if not get_queue_service().cancel_scheduled(job_id):
            raise HTTPException(status_code=404, detail="Scheduled run not found")

    def get_status(self, job_id: str) -> ExecutionStatusResponse:
        job = fetch_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Execution job not found")
        payload = job.payload
        state = str(payload.get("state") or "failed")
        if state not in ("queued", "running", "completed", "failed", "scheduled", "cancelled"):
            state = "failed"
        result = _result_payload(payload.get("result"))
        error = payload.get("error")
        scheduled_for = None
        if state == "scheduled":
            scheduled_for = get_queue_service().scheduled_time(job)
        return ExecutionStatusResponse(
            job_id=job.id,
            state=state,  # type: ignore[arg-type]
            config_path=payload.get("configPath"),
            project_id=payload.get("projectId"),
            test_case_code=payload.get("testCaseCode"),
            result=result,
            error=error,
            scheduled_for=scheduled_for,
        )

    def start_suite(self, project_id: str, suite_id: str, environment_id: str) -> BatchExecutionStatus:
        """Enqueue each runnable case in the suite through the single-test path."""
        from app.repositories.project_repository import project_repository
        from app.repositories.test_suite_repository import test_suite_repository

        project_repository.find_by_id(project_id)
        environment = _require_project_environment(project_id, environment_id)
        test_suite_repository.find_by_id(project_id, suite_id)
        case_ids = test_suite_repository.list_case_ids(project_id, suite_id)
        return self._start_batch(
            "suite", project_id, suite_id, _unique_ids(case_ids), environment=environment
        )

    def start_project(
        self,
        project_id: str,
        suite_category: Optional[str] = None,
        environment_id: Optional[str] = None,
    ) -> BatchExecutionStatus:
        """Enqueue project cases once. A category limits the run to suites in that category."""
        from app.repositories.project_repository import project_repository
        from app.repositories.test_case_repository import test_case_repository
        from app.repositories.test_suite_repository import test_suite_repository
        from app.schemas.test_suite import SUITE_CATEGORY_LABELS

        project_repository.find_by_id(project_id)
        environment = _require_project_environment(project_id, environment_id)
        if suite_category:
            if suite_category not in SUITE_CATEGORY_LABELS:
                raise HTTPException(status_code=400, detail="Choose a valid suite category.")
            matching = [
                suite
                for suite in test_suite_repository.list_by_project(project_id)
                if suite.category == suite_category
            ]
            if not matching:
                label = SUITE_CATEGORY_LABELS[suite_category]
                raise HTTPException(
                    status_code=400,
                    detail=f"No {label} test suites are available for this project.",
                )
            case_ids: list[str] = []
            for suite in matching:
                case_ids.extend(test_suite_repository.list_case_ids(project_id, suite.id))
            case_ids = _unique_ids(case_ids)
        else:
            case_ids = _unique_ids(
                [case.id for case in test_case_repository.list_by_project(project_id)]
            )
        return self._start_batch(
            "project",
            project_id,
            None,
            case_ids,
            suite_category=suite_category,
            environment=environment,
        )

    def list_grouped_runs(self) -> list[GroupedRun]:
        """Suite and project batches from Redis, plus individual runs not in those batches."""
        payloads = _load_all_batches()
        child_job_ids: set[str] = set()
        for payload in payloads:
            for entry in payload.get("cases") or []:
                job_id = entry.get("jobId")
                if job_id:
                    child_job_ids.add(str(job_id))
        persisted = test_run_repository.map_by_job_ids(list(child_job_ids))
        items: list[GroupedRun] = []
        for payload in payloads:
            status = self._status_from_payload(payload, persisted)
            items.append(_grouped_from_batch(status))
        for run in test_run_repository.list_recent_for_activity(200):
            job_id = str(run.get("jobId") or "")
            if job_id and job_id in child_job_ids:
                continue
            code = run.get("testCaseCode") or None
            name = run.get("testName") or "Test case"
            status = str(run.get("status") or "Queued")
            error_message = run.get("errorMessage")
            if status == "Not Run" and error_message == "Cancelled":
                status = "Cancelled"
            started = run.get("startedAt")
            if isinstance(started, datetime):
                started = started.isoformat()
            duration = run.get("durationMs")
            items.append(
                GroupedRun(
                    id=str(run.get("id")),
                    run_type="individual",
                    title=name,
                    code=code,
                    status=status,
                    started_at=str(started) if started else None,
                    duration_ms=int(duration) if duration is not None else None,
                    project_id=run.get("projectId"),
                    error_message=None if status == "Cancelled" else error_message,
                )
            )
        items.sort(key=_started_sort_key, reverse=True)
        return items

    def get_batch(self, batch_id: str) -> BatchExecutionStatus:
        payload = _load_batch(batch_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="Batch run not found")
        if _ensure_case_suites(payload):
            _save_batch(payload)
        status = self._status_from_payload(payload)
        _save_batch(payload)
        return status

    def cancel_batch(self, batch_id: str) -> BatchExecutionStatus:
        payload = _load_batch(batch_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="Batch run not found")
        status = self._status_from_payload(payload)
        if status.finished:
            raise HTTPException(status_code=409, detail="This run has already finished")
        payload["cancelled"] = True
        for entry in payload.get("cases") or []:
            if entry.get("skippedReason"):
                continue
            job_id = entry.get("jobId")
            if not job_id:
                continue
            if request_cancel(str(job_id)) == "cancelled":
                test_run_repository.mark_cancelled(str(job_id))
                entry["cancelRequested"] = True
        _save_batch(payload)
        return self._status_from_payload(payload)

    def rerun_batch(self, batch_id: str) -> BatchExecutionStatus:
        payload = _load_batch(batch_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="Batch run not found")
        project_id = str(payload.get("projectId") or "")
        environment_id = payload.get("environmentId")
        if not environment_id:
            raise HTTPException(
                status_code=400,
                detail="This run does not have a saved environment. Start a new run and choose an environment.",
            )
        if payload.get("batchType") == "suite":
            suite_id = payload.get("suiteId")
            if not suite_id:
                raise HTTPException(status_code=400, detail="This suite run has no suite to start again")
            return self.start_suite(project_id, str(suite_id), str(environment_id))
        return self.start_project(project_id, payload.get("suiteCategory"), str(environment_id))

    def cancel_test_run(self, run_id: str) -> None:
        row = test_run_repository.find_for_rerun(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Test run not found")
        if str(row.get("status") or "") not in ("Queued", "Running"):
            raise HTTPException(status_code=409, detail="This run is no longer active")
        job_id = str(row.get("jobId") or "")
        if not job_id or request_cancel(job_id) == "missing":
            raise HTTPException(status_code=404, detail="Execution job not found")
        test_run_repository.mark_cancelled(job_id)

    def rerun_test_run(self, run_id: str) -> ExecutionStatusResponse:
        row = test_run_repository.find_for_rerun(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Test run not found")
        if str(row.get("status") or "") in ("Queued", "Running"):
            raise HTTPException(status_code=409, detail="This run is still active")
        config_path = str(row.get("configPath") or "").strip()
        if not config_path:
            raise HTTPException(status_code=400, detail="This run has no saved configuration to start again")
        return self.start(
            StartExecutionRequest(
                config_path=config_path,
                project_id=row.get("projectId"),
                test_case_id=row.get("testCaseId"),
                test_case_code=row.get("testCaseCode"),
            )
        )

    def _start_batch(
        self,
        batch_type: str,
        project_id: str,
        suite_id: Optional[str],
        case_ids: list[str],
        suite_category: Optional[str] = None,
        environment=None,
    ) -> BatchExecutionStatus:
        from app.services.test_cases_service import TestCasesService
        from app.repositories.project_repository import project_repository
        from app.repositories.test_case_repository import test_case_repository

        cases_service = TestCasesService(test_case_repository, project_repository)
        batch_id = uuid.uuid4().hex
        suite_lookup = _case_suites(case_ids)
        batch_suite_name = None
        if suite_id:
            _, batch_suite_name = _batch_names(project_id, suite_id)
        stored_cases: list[dict] = []
        for case_id in case_ids:
            try:
                case = cases_service.get(project_id, case_id)
            except HTTPException as exc:
                stored_cases.append(
                    {
                        "testCaseId": case_id,
                        "testCaseCode": "",
                        "name": "Test case",
                        "jobId": None,
                        "skippedReason": None,
                        "enqueueError": _public_reason(exc.detail) or "Test case could not be loaded",
                    }
                )
                continue
            except Exception as exc:
                stored_cases.append(
                    {
                        "testCaseId": case_id,
                        "testCaseCode": "",
                        "name": "Test case",
                        "jobId": None,
                        "skippedReason": None,
                        "enqueueError": _public_reason(exc) or "Test case could not be loaded",
                    }
                )
                continue

            script = (case.testFile or "").replace("\\", "/").strip()
            runnable = case.automationStatus == "Automated" and bool(script)
            suite_snapshot = suite_lookup.get(case.id, ("", "Suite"))
            if suite_id:
                suite_snapshot = (str(suite_id), batch_suite_name or suite_snapshot[1] or "Suite")
            entry = {
                "testCaseId": case.id,
                "testCaseCode": case.code,
                "name": case.name,
                "suiteId": suite_snapshot[0] or None,
                "suiteName": suite_snapshot[1] or "Suite",
                "jobId": None,
                "skippedReason": None if runnable else _NO_SCRIPT_REASON,
                "enqueueError": None,
            }
            if runnable:
                try:
                    started = self.start(
                        StartExecutionRequest(
                            script_path=script,
                            project_id=project_id,
                            test_case_id=case.id,
                            test_case_code=case.code,
                        ),
                        environment_base_url=environment.baseUrl if environment is not None else None,
                    )
                    entry["jobId"] = started.job_id
                except Exception as exc:
                    detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                    entry["enqueueError"] = _public_reason(detail) or "Could not start this test"
            stored_cases.append(entry)

        payload = {
            "id": batch_id,
            "batchType": batch_type,
            "projectId": project_id,
            "suiteId": suite_id,
            "suiteCategory": suite_category,
            "environmentId": environment.id if environment is not None else None,
            "environmentName": environment.name if environment is not None else None,
            "environmentBaseUrl": environment.baseUrl if environment is not None else None,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "cases": stored_cases,
        }
        _save_batch(payload)
        return self._status_from_payload(payload)

    def _status_from_payload(
        self,
        payload: dict,
        persisted: Optional[dict[str, dict]] = None,
    ) -> BatchExecutionStatus:
        entries = payload.get("cases") or []
        job_ids = [str(entry.get("jobId")) for entry in entries if entry.get("jobId")]
        if persisted is None:
            persisted = test_run_repository.map_by_job_ids(job_ids)
        else:
            persisted = {job_id: persisted[job_id] for job_id in job_ids if job_id in persisted}
        results: list[BatchCaseResult] = []
        passed = failed = queued = running = skipped = cancelled = 0
        completed_at: list[datetime] = []
        for entry in entries:
            outcome, reason, duration_ms, test_run_id = self._case_outcome(entry, persisted)
            if outcome == "passed":
                passed += 1
            elif outcome == "failed":
                failed += 1
            elif outcome == "queued":
                queued += 1
            elif outcome == "running":
                running += 1
            elif outcome == "cancelled":
                cancelled += 1
            else:
                skipped += 1
            stored = persisted.get(str(entry.get("jobId") or "")) or {}
            finished_at = _parse_time(stored.get("completedAt"))
            if finished_at is not None:
                completed_at.append(finished_at)
            results.append(
                BatchCaseResult(
                    test_case_id=str(entry.get("testCaseId") or ""),
                    test_case_code=str(entry.get("testCaseCode") or ""),
                    name=str(entry.get("name") or "Test case"),
                    outcome=outcome,
                    reason=reason,
                    duration_ms=duration_ms,
                    test_run_id=test_run_id,
                    suite_id=entry.get("suiteId"),
                    suite_name=entry.get("suiteName"),
                )
            )
        total = len(results)
        completed = passed + failed
        finished = queued == 0 and running == 0
        created_at = _parse_time(payload.get("createdAt"))
        project_id = str(payload.get("projectId") or "")
        suite_id = payload.get("suiteId")
        project_name, suite_name = _batch_names(project_id, suite_id)
        return BatchExecutionStatus(
            batch_id=str(payload.get("id") or ""),
            batch_type=payload.get("batchType") or "project",
            project_id=project_id,
            suite_id=suite_id,
            total=total,
            passed=passed,
            failed=failed,
            queued=queued,
            running=running,
            completed=completed,
            skipped=skipped,
            cancelled=cancelled,
            cancel_requested=bool(payload.get("cancelled")),
            finished=finished,
            created_at=created_at,
            project_name=project_name,
            suite_name=suite_name,
            suite_category=payload.get("suiteCategory"),
            environment_id=payload.get("environmentId"),
            environment_name=payload.get("environmentName"),
            duration_ms=_batch_duration_ms(created_at, completed_at, finished),
            cases=results,
        )

    def _case_outcome(
        self,
        entry: dict,
        persisted: dict[str, dict],
    ) -> tuple[str, Optional[str], Optional[int], Optional[str]]:
        stored = persisted.get(str(entry.get("jobId") or "")) or {}
        test_run_id = stored.get("id")
        duration_ms = stored.get("durationMs")
        if entry.get("skippedReason"):
            return "skipped", str(entry["skippedReason"]), None, None
        if entry.get("enqueueError"):
            return "failed", str(entry["enqueueError"]), None, test_run_id
        job_id = entry.get("jobId")
        if not job_id:
            return "failed", "This test was not started", None, test_run_id
        saved_status = str(stored.get("status") or "")
        if saved_status in ("Passed", "Failed"):
            return _outcome_from_saved_run(stored)
        if _is_cancelled_case(entry, stored):
            return "cancelled", "Cancelled", duration_ms, test_run_id
        try:
            status = self.get_status(str(job_id))
        except HTTPException:
            return _outcome_from_saved_run(stored)
        if duration_ms is None and status.result is not None:
            duration_ms = status.result.duration_ms
        if status.state == "cancelled" or _is_cancelled_case(entry, stored):
            return "cancelled", "Cancelled", duration_ms, test_run_id
        if status.state in ("queued", "scheduled"):
            return "queued", None, duration_ms, test_run_id
        if status.state == "running":
            return "running", None, duration_ms, test_run_id
        if status.state == "completed":
            return "passed", None, duration_ms, test_run_id
        reason = status.error or stored.get("errorMessage") or "The test did not pass."
        return "failed", reason, duration_ms, test_run_id


def _is_cancelled_case(entry: dict, stored: dict) -> bool:
    if str(stored.get("status") or "") == "Not Run" and stored.get("errorMessage") == "Cancelled":
        return True
    return bool(entry.get("cancelRequested")) and str(stored.get("status") or "") not in ("Passed", "Failed", "Running")


def _grouped_from_batch(status: BatchExecutionStatus) -> GroupedRun:
    if not status.finished:
        label = "Queued" if status.passed == 0 and status.failed == 0 and status.running == 0 and status.cancelled == 0 else "Running"
    elif status.cancel_requested:
        label = "Cancelled"
    elif status.failed > 0:
        label = "Failed"
    elif status.passed > 0:
        label = "Completed"
    else:
        label = "Skipped"
    if status.batch_type == "suite":
        title = status.suite_name or "Suite"
    else:
        title = status.project_name or "Project"
    return GroupedRun(
        id=status.batch_id,
        run_type=status.batch_type,
        title=title,
        code=None,
        suite_category=status.suite_category if status.batch_type == "project" else None,
        environment_name=status.environment_name,
        status=label,
        started_at=status.created_at.isoformat() if status.created_at else None,
        duration_ms=status.duration_ms,
        project_id=status.project_id,
        total=status.total,
        completed=status.passed + status.failed + status.skipped + status.cancelled,
        passed=status.passed,
        failed=status.failed,
        skipped=status.skipped,
        queued=status.queued,
        running=status.running,
        cancelled=status.cancelled,
    )


def _outcome_from_saved_run(
    stored: dict,
) -> tuple[str, Optional[str], Optional[int], Optional[str]]:
    status = str(stored.get("status") or "")
    duration_ms = stored.get("durationMs")
    test_run_id = stored.get("id")
    if status == "Passed":
        return "passed", None, duration_ms, test_run_id
    if status == "Failed":
        return "failed", stored.get("errorMessage") or "The test did not pass.", duration_ms, test_run_id
    if status == "Running":
        return "running", None, duration_ms, test_run_id
    if status == "Queued":
        return "queued", None, duration_ms, test_run_id
    if not stored:
        return "failed", "Execution status is no longer available", None, None
    return "failed", stored.get("errorMessage") or "Execution status is no longer available", duration_ms, test_run_id


def _case_suites(case_ids: list[str]) -> dict[str, tuple[str, str]]:
    if not case_ids:
        return {}
    try:
        from app.database import get_supabase_client

        db = get_supabase_client()
    except Exception:
        return {}
    if not db:
        return {}
    rows = (
        db.from_("test_cases").select("id,suite_id").in_("id", case_ids).execute().data or []
    )
    suite_ids = list({str(row["suite_id"]) for row in rows if row.get("suite_id")})
    names: dict[str, str] = {}
    if suite_ids:
        for row in db.from_("test_suites").select("id,name").in_("id", suite_ids).execute().data or []:
            names[str(row["id"])] = str(row.get("name") or "Suite")
    found: dict[str, tuple[str, str]] = {}
    for row in rows:
        suite_id = str(row.get("suite_id") or "")
        found[str(row["id"])] = (suite_id, names.get(suite_id) or "Suite")
    return found


def _ensure_case_suites(payload: dict) -> bool:
    entries = payload.get("cases") or []
    missing = [entry for entry in entries if not entry.get("suiteId")]
    if not missing:
        return False
    if payload.get("batchType") == "suite" and payload.get("suiteId"):
        _, suite_name = _batch_names(str(payload.get("projectId") or ""), str(payload.get("suiteId")))
        for entry in missing:
            entry["suiteId"] = str(payload.get("suiteId"))
            entry["suiteName"] = suite_name or "Suite"
        return True
    lookup = _case_suites([str(entry.get("testCaseId") or "") for entry in missing])
    for entry in missing:
        suite_id, suite_name = lookup.get(str(entry.get("testCaseId") or ""), ("", "Suite"))
        entry["suiteId"] = suite_id or None
        entry["suiteName"] = suite_name or "Suite"
    return True


_batch_name_cache: dict[tuple[str, str], tuple[Optional[str], Optional[str]]] = {}


def _batch_names(project_id: str, suite_id: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not project_id:
        return None, None
    key = (project_id, suite_id or "")
    cached = _batch_name_cache.get(key)
    if cached is not None:
        return cached
    project_name = None
    suite_name = None
    try:
        from app.database import get_supabase_client

        db = get_supabase_client()
        if db is not None:
            project_rows = (
                db.from_("projects").select("name").eq("id", project_id).limit(1).execute().data or []
            )
            if project_rows:
                project_name = project_rows[0].get("name")
            if suite_id:
                suite_rows = (
                    db.from_("test_suites").select("name").eq("id", suite_id).limit(1).execute().data or []
                )
                if suite_rows:
                    suite_name = suite_rows[0].get("name")
    except Exception:
        project_name = None
        suite_name = None
    found = (project_name, suite_name)
    _batch_name_cache[key] = found
    return found


def _batch_duration_ms(
    created_at: Optional[datetime],
    completed_at: list[datetime],
    finished: bool,
) -> Optional[int]:
    if created_at is None:
        return None
    if finished and completed_at:
        end = max(completed_at)
    elif finished:
        end = created_at
    else:
        end = datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    return max(0, int((end - start).total_seconds() * 1000))


def _parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _started_sort_key(item: GroupedRun) -> datetime:
    parsed = _parse_time(item.started_at)
    return parsed or datetime.min.replace(tzinfo=timezone.utc)


def _unique_ids(case_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for case_id in case_ids:
        if not case_id or case_id in seen:
            continue
        seen.add(case_id)
        unique.append(case_id)
    return unique


def _public_reason(detail: Any) -> str:
    text = detail if isinstance(detail, str) else str(detail or "")
    text = " ".join(text.split())
    return text[:180]


def _batch_key(batch_id: str) -> str:
    return f"{_BATCH_KEY_PREFIX}{batch_id}"


def _save_batch(payload: dict) -> None:
    get_redis_connection().setex(
        _batch_key(str(payload["id"])),
        _BATCH_TTL_SECONDS,
        json.dumps(payload),
    )


def _load_all_batches() -> list[dict]:
    redis = get_redis_connection()
    payloads: list[dict] = []
    for key in redis.scan_iter(match=f"{_BATCH_KEY_PREFIX}*", count=100):
        raw = redis.get(key)
        payload = _decode_batch(raw)
        if payload is not None:
            payloads.append(payload)
    return payloads


def _decode_batch(raw: Any) -> Optional[dict]:
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) and payload.get("id") else None


def _load_batch(batch_id: str) -> Optional[dict]:
    return _decode_batch(get_redis_connection().get(_batch_key(batch_id)))


_execution_service: Optional[ExecutionService] = None


def get_execution_service() -> ExecutionService:
    global _execution_service
    if _execution_service is None:
        _execution_service = ExecutionService()
    return _execution_service
