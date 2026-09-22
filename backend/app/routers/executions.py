from typing import List, Optional

from fastapi import APIRouter, Depends, Response

from app.schemas.execution import (
    ExecutionStatusResponse,
    ScheduledExecution,
    StartExecutionRequest,
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


@router.get("/{job_id}", response_model=ExecutionStatusResponse)
def get_execution_status(
    job_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.get_status(job_id)
