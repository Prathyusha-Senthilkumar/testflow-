import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from rq.exceptions import NoSuchJobError
from rq.job import Job

from app.execution.config_path import resolve_runner_config_path
from app.execution.runner_sidecar import ensure_runner_config_for_script
from app.queue.connection import get_redis_connection

_BATCH_KEY_PREFIX = "testflow:batch:"
_BATCH_TTL_SECONDS = 60 * 60 * 48
_NO_SCRIPT_REASON = "No automation script"
from app.queue.jobs import run_test_case_job
from app.schemas.execution import (
    BatchCaseResult,
    BatchExecutionStatus,
    ExecutionResultPayload,
    ExecutionState,
    ExecutionStatusResponse,
    ScheduledExecution,
    StartExecutionRequest,
)
from app.repositories.test_run_repository import remember_schedule, test_run_repository
from app.services.queue_service import get_queue_service


def _map_rq_state(job: Job) -> ExecutionState:
    rq_status = job.get_status(refresh=True)

    if rq_status == "scheduled":
        return "scheduled"
    if rq_status == "queued":
        return "queued"
    if rq_status in ("started", "deferred"):
        return "running"
    if rq_status == "finished":
        payload = job.result
        if isinstance(payload, dict) and payload.get("success"):
            return "completed"
        return "failed"
    if rq_status in ("failed", "stopped", "canceled"):
        return "failed"
    return "failed"


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


def _job_error_message(job: Job) -> Optional[str]:
    if job.exc_info:
        return job.exc_info.splitlines()[-1] if job.exc_info else "Job failed"
    payload = job.result
    if isinstance(payload, dict):
        errors = payload.get("validation_errors")
        if errors:
            return "; ".join(errors)
        if not payload.get("success"):
            # Prefer the real assertion / Playwright message over the exit code.
            return payload.get("error_message") or "The test did not pass."
    return None


def _to_response(job: Job) -> ExecutionStatusResponse:
    meta = job.meta or {}
    state = _map_rq_state(job)
    result = None
    error = None

    if job.is_finished:
        result = _result_payload(job.result)
        if state == "failed":
            error = _job_error_message(job)
    elif job.is_failed:
        error = _job_error_message(job)

    return ExecutionStatusResponse(
        job_id=job.id,
        state=state,
        config_path=meta.get("config_path"),
        project_id=meta.get("project_id"),
        test_case_code=meta.get("test_case_code"),
        result=result,
        error=error,
        scheduled_for=get_queue_service().scheduled_time(job) if state == "scheduled" else None,
    )


class ExecutionService:
    def start(self, request: StartExecutionRequest) -> ExecutionStatusResponse:
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
        job_meta = {
            "config_path": config_path,
            "project_id": request.project_id,
            "test_case_code": request.test_case_code,
            "test_case_id": request.test_case_id,
            "schedule_time_zone": time_zone,
        }
        queue_service = get_queue_service()
        run_at = self._validate_run_at(request.run_at)
        if run_at is not None:
            job_meta["scheduled_for"] = run_at.isoformat()
            job = queue_service.enqueue_at(
                run_at,
                run_test_case_job,
                config_path,
                headed=request.headed,
                meta=job_meta,
            )
        else:
            job = queue_service.enqueue(
                run_test_case_job,
                config_path,
                headed=request.headed,
                meta=job_meta,
            )

        if run_at is not None:
            remember_schedule(
                job.id,
                run_at.isoformat(),
                time_zone,
                request.test_case_id,
            )

        # Persist run history in Supabase when a real test-case id is provided.
        if request.test_case_id:
            try:
                test_run_repository.create_queued(
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
        try:
            job = Job.fetch(job_id, connection=get_redis_connection())
        except NoSuchJobError:
            raise HTTPException(status_code=404, detail="Execution job not found") from None
        return _to_response(job)

    def start_suite(self, project_id: str, suite_id: str) -> BatchExecutionStatus:
        """Enqueue each runnable case in the suite through the single-test path."""
        from app.repositories.project_repository import project_repository
        from app.repositories.test_suite_repository import test_suite_repository

        project_repository.find_by_id(project_id)
        test_suite_repository.find_by_id(project_id, suite_id)
        case_ids = test_suite_repository.list_case_ids(project_id, suite_id)
        return self._start_batch("suite", project_id, suite_id, _unique_ids(case_ids))

    def start_project(self, project_id: str) -> BatchExecutionStatus:
        """Enqueue each project case once through the single-test path."""
        from app.repositories.project_repository import project_repository
        from app.repositories.test_case_repository import test_case_repository

        project_repository.find_by_id(project_id)
        case_ids = [case.id for case in test_case_repository.list_by_project(project_id)]
        return self._start_batch("project", project_id, None, _unique_ids(case_ids))

    def get_batch(self, batch_id: str) -> BatchExecutionStatus:
        payload = _load_batch(batch_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="Batch run not found")
        status = self._status_from_payload(payload)
        _save_batch(payload)
        return status

    def _start_batch(
        self,
        batch_type: str,
        project_id: str,
        suite_id: Optional[str],
        case_ids: list[str],
    ) -> BatchExecutionStatus:
        from app.services.test_cases_service import TestCasesService
        from app.repositories.project_repository import project_repository
        from app.repositories.test_case_repository import test_case_repository

        cases_service = TestCasesService(test_case_repository, project_repository)
        batch_id = uuid.uuid4().hex
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
            entry = {
                "testCaseId": case.id,
                "testCaseCode": case.code,
                "name": case.name,
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
                        )
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
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "cases": stored_cases,
        }
        _save_batch(payload)
        return self._status_from_payload(payload)

    def _status_from_payload(self, payload: dict) -> BatchExecutionStatus:
        results: list[BatchCaseResult] = []
        passed = failed = queued = running = skipped = 0
        for entry in payload.get("cases") or []:
            outcome, reason = self._case_outcome(entry)
            if outcome == "passed":
                passed += 1
            elif outcome == "failed":
                failed += 1
            elif outcome == "queued":
                queued += 1
            elif outcome == "running":
                running += 1
            else:
                skipped += 1
            results.append(
                BatchCaseResult(
                    test_case_id=str(entry.get("testCaseId") or ""),
                    test_case_code=str(entry.get("testCaseCode") or ""),
                    name=str(entry.get("name") or "Test case"),
                    outcome=outcome,
                    reason=reason,
                )
            )
        total = len(results)
        completed = passed + failed
        return BatchExecutionStatus(
            batch_id=str(payload.get("id") or ""),
            batch_type=payload.get("batchType") or "project",
            project_id=str(payload.get("projectId") or ""),
            suite_id=payload.get("suiteId"),
            total=total,
            passed=passed,
            failed=failed,
            queued=queued,
            running=running,
            completed=completed,
            skipped=skipped,
            finished=queued == 0 and running == 0,
            cases=results,
        )

    def _case_outcome(self, entry: dict) -> tuple[str, Optional[str]]:
        if entry.get("skippedReason"):
            return "skipped", str(entry["skippedReason"])
        if entry.get("enqueueError"):
            return "failed", str(entry["enqueueError"])
        job_id = entry.get("jobId")
        if not job_id:
            return "failed", "This test was not started"
        try:
            status = self.get_status(str(job_id))
        except HTTPException:
            return "failed", "Execution status is no longer available"
        if status.state in ("queued", "scheduled"):
            return "queued", None
        if status.state == "running":
            return "running", None
        if status.state == "completed":
            return "passed", None
        return "failed", status.error


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


def _load_batch(batch_id: str) -> Optional[dict]:
    raw = get_redis_connection().get(_batch_key(batch_id))
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


_execution_service: Optional[ExecutionService] = None


def get_execution_service() -> ExecutionService:
    global _execution_service
    if _execution_service is None:
        _execution_service = ExecutionService()
    return _execution_service
