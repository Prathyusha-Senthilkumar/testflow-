from typing import List, Optional

from fastapi import APIRouter, Depends, Response

from app.schemas.execution import (
    BatchExecutionStatus,
    ExecutionStatusResponse,
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
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start(body)


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
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start_suite(body.project_id, body.suite_id, body.environment_id)


@router.post("/projects", response_model=BatchExecutionStatus)
def start_project_execution(
    body: StartProjectBatchRequest,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start_project(body.project_id, body.suite_category, body.environment_id)


@router.post("/batches/{batch_id}/cancel", response_model=BatchExecutionStatus)
def cancel_batch_execution(
    batch_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.cancel_batch(batch_id)


@router.post("/batches/{batch_id}/rerun", response_model=BatchExecutionStatus)
def rerun_batch_execution(
    batch_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.rerun_batch(batch_id)


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
