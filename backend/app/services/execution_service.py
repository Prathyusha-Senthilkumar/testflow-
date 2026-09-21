from typing import Any, Optional

from fastapi import HTTPException
from rq.exceptions import NoSuchJobError
from rq.job import Job

from app.execution.config_path import resolve_runner_config_path
from app.execution.runner_sidecar import ensure_runner_config_for_script
from app.queue.connection import get_redis_connection
from app.queue.jobs import run_test_case_job
from app.schemas.execution import (
    ExecutionResultPayload,
    ExecutionState,
    ExecutionStatusResponse,
    StartExecutionRequest,
)
from app.services.queue_service import get_queue_service


def _map_rq_state(job: Job) -> ExecutionState:
    rq_status = job.get_status(refresh=True)

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
            return f"Test execution failed with pytest return code {payload.get('pytest_return_code')}"
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

        job = get_queue_service().enqueue(
            run_test_case_job,
            config_path,
            headed=request.headed,
            meta={
                "config_path": config_path,
                "project_id": request.project_id,
                "test_case_code": request.test_case_code,
            },
        )
        return ExecutionStatusResponse(
            job_id=job.id,
            state="queued",
            config_path=config_path,
            project_id=request.project_id,
            test_case_code=request.test_case_code,
        )

    def get_status(self, job_id: str) -> ExecutionStatusResponse:
        try:
            job = Job.fetch(job_id, connection=get_redis_connection())
        except NoSuchJobError:
            raise HTTPException(status_code=404, detail="Execution job not found") from None
        return _to_response(job)


_execution_service: Optional[ExecutionService] = None


def get_execution_service() -> ExecutionService:
    global _execution_service
    if _execution_service is None:
        _execution_service = ExecutionService()
    return _execution_service
