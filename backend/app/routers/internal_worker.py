import uuid
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.models.execution import ExecutionStatus
from app.models.test_result import TestResult, TestResultStatus
from app.models.worker import (
    WorkerJobDto,
    WorkerPollResponse,
    WorkerResultDto,
    WorkerResultResponse,
)
from app.repositories.execution_repository import execution_repository
from app.services.auth_profile_service import auth_profile_service
from app.services.test_resolver import artifacts_dir_for, resolve_auth_storage_path, resolve_test_file
from app.services.worker_registry import worker_registry

router = APIRouter(prefix="/internal/worker", tags=["Internal Worker"])


def _assert_worker_token(x_worker_token: Optional[str]) -> None:
    expected = settings.INTERNAL_WORKER_TOKEN
    if not expected:
        return
    if x_worker_token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker token")


@router.post("/poll", response_model=WorkerPollResponse)
async def poll_next_job(x_worker_token: Optional[str] = Header(default=None)):
    """Return the next QUEUED job and atomically mark it RUNNING."""
    _assert_worker_token(x_worker_token)
    job = await execution_repository.claim_next_queued()
    worker_registry.record_poll(job.id if job else None)
    if not job:
        return WorkerPollResponse(job=None)

    test_file = resolve_test_file(job.test_case_id)
    auth_path = None
    auth_storage_state_error = None
    if job.auth_profile_id:
        try:
            profile = await auth_profile_service.get_raw_profile(job.auth_profile_id)
            auth_path = resolve_auth_storage_path(profile.storage_state_path)
            if not auth_path:
                auth_storage_state_error = "Auth profile storage state could not be loaded."
            else:
                try:
                    json.loads(auth_path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    auth_storage_state_error = "Auth profile storage state could not be loaded."
        except HTTPException:
            auth_storage_state_error = "Auth profile storage state could not be loaded."

    artifacts_dir = artifacts_dir_for(job.id)
    await execution_repository.update_execution(job)

    return WorkerPollResponse(
        job=WorkerJobDto(
            id=job.id,
            test_case_id=job.test_case_id,
            auth_profile_id=job.auth_profile_id,
            execution_mode=job.execution_mode,
            started_at=job.started_at,
            test_file=str(test_file) if test_file else None,
            auth_storage_state_path=str(auth_path) if auth_path else None,
            auth_storage_state_error=auth_storage_state_error,
            artifacts_dir=str(artifacts_dir),
            timeout_seconds=60,
        )
    )


@router.post("/result", response_model=WorkerResultResponse)
async def submit_job_result(dto: WorkerResultDto, x_worker_token: Optional[str] = Header(default=None)):
    """Persist test result telemetry from the Node worker."""
    _assert_worker_token(x_worker_token)
    job = await execution_repository.get_execution(dto.execution_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Execution '{dto.execution_id}' not found")

    completed_at = dto.completed_at or datetime.now(timezone.utc).isoformat()
    started_at = dto.started_at or job.started_at or completed_at

    status_map = {
        TestResultStatus.PASSED: ExecutionStatus.PASSED,
        TestResultStatus.FAILED: ExecutionStatus.FAILED,
        TestResultStatus.TIMEOUT: ExecutionStatus.TIMEOUT,
        TestResultStatus.CANCELLED: ExecutionStatus.CANCELLED,
    }
    job_status = status_map.get(dto.status, ExecutionStatus.FAILED)

    result_id = f"res_{uuid.uuid4().hex[:8]}"
    result = TestResult(
        id=result_id,
        execution_id=job.id,
        test_case_id=job.test_case_id,
        auth_profile_id=job.auth_profile_id,
        status=dto.status,
        started_at=started_at,
        completed_at=completed_at,
        duration=dto.duration,
        exit_code=dto.exit_code,
        error_message=dto.error_message,
        stdout_snippet=(dto.stdout or "")[-1500:] or None,
        stderr_snippet=(dto.stderr or "")[-1500:] or None,
        log_file_path=dto.log_file_path,
        artifacts=dto.artifacts or [],
    )
    await execution_repository.create_test_result(result)

    job.status = job_status
    job.completed_at = completed_at
    job.result_id = result_id
    job.error_message = dto.error_message
    await execution_repository.update_execution(job)
    worker_registry.record_result(job.id)

    return WorkerResultResponse(
        execution_id=job.id,
        status=job.status,
        result_id=result_id,
    )
