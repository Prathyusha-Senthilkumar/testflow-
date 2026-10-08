from typing import List, Optional

from fastapi import APIRouter, Depends, Response

from app.dependencies.auth import current_actor

from app.schemas.execution import (
    BatchExecutionStatus,
    ExecutionStatusResponse,
    ScheduleProjectBatchRequest,
    ScheduleSuiteBatchRequest,
    ScheduledBatch,
    ScheduledExecution,
    StartExecutionRequest,
    StartProjectBatchRequest,
    StartSuiteBatchRequest,
)
from app.services.execution_service import ExecutionService, get_execution_service

router = APIRouter(prefix="/executions", tags=["executions"])


@router.post("", response_model=ExecutionStatusResponse)
@router.post("/", response_model=ExecutionStatusResponse, include_in_schema=False)
def start_execution(
    body: StartExecutionRequest,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start(body, run_by=actor)


@router.get("/scheduled", response_model=List[ScheduledExecution])
def list_scheduled_executions(
    testCaseId: Optional[str] = None,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.list_scheduled(testCaseId)


@router.delete("/scheduled/{job_id}", status_code=204)
def cancel_scheduled_execution(
    job_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    service.cancel_scheduled(job_id)
    return Response(status_code=204)


@router.post("/suites", response_model=BatchExecutionStatus)
def start_suite_execution(
    body: StartSuiteBatchRequest,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start_suite(
        body.project_id,
        body.suite_id,
        body.environment_id,
        run_by=actor,
    )


@router.post("/projects", response_model=BatchExecutionStatus)
def start_project_execution(
    body: StartProjectBatchRequest,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start_project(
        body.project_id,
        body.suite_category,
        body.environment_id,
        run_by=actor,
    )


@router.post("/suites/schedule", response_model=ScheduledBatch)
def schedule_suite_execution(
    body: ScheduleSuiteBatchRequest,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.schedule_suite(
        body.project_id,
        body.suite_id,
        body.environment_id,
        body.run_at,
        body.time_zone,
        run_by=actor,
    )


@router.post("/projects/schedule", response_model=ScheduledBatch)
def schedule_project_execution(
    body: ScheduleProjectBatchRequest,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.schedule_project(
        body.project_id,
        body.environment_id,
        body.run_at,
        body.time_zone,
        suite_category=body.suite_category,
        run_by=actor,
    )


@router.get("/scheduled-batches", response_model=List[ScheduledBatch])
def list_scheduled_batches(
    projectId: Optional[str] = None,
    suiteId: Optional[str] = None,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.list_scheduled_batches(projectId, suiteId)


@router.delete("/scheduled-batches/{schedule_id}", status_code=204)
def cancel_scheduled_batch(
    schedule_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    service.cancel_scheduled_batch(schedule_id)
    return Response(status_code=204)


@router.post("/batches/{batch_id}/cancel", response_model=BatchExecutionStatus)
def cancel_batch_execution(
    batch_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.cancel_batch(batch_id)


@router.post("/batches/{batch_id}/rerun", response_model=BatchExecutionStatus)
def rerun_batch_execution(
    batch_id: str,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
    service: ExecutionService = Depends(get_execution_service),
):
    return service.rerun_batch(batch_id, run_by=actor)


@router.get("/batches/{batch_id}", response_model=BatchExecutionStatus)
def get_batch_execution(
    batch_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.get_batch(batch_id)


@router.get("/{job_id}", response_model=ExecutionStatusResponse)
def get_execution_status(
    job_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.get_status(job_id)
