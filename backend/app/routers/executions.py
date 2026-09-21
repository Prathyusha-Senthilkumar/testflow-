from fastapi import APIRouter, Depends

from app.schemas.execution import ExecutionStatusResponse, StartExecutionRequest
from app.services.execution_service import ExecutionService, get_execution_service

router = APIRouter(prefix="/executions", tags=["executions"])


@router.post("", response_model=ExecutionStatusResponse)
@router.post("/", response_model=ExecutionStatusResponse, include_in_schema=False)
def start_execution(
    body: StartExecutionRequest,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.start(body)


@router.get("/{job_id}", response_model=ExecutionStatusResponse)
def get_execution_status(
    job_id: str,
    service: ExecutionService = Depends(get_execution_service),
):
    return service.get_status(job_id)
