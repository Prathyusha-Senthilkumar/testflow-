from typing import List
from fastapi import APIRouter, status
from app.models.execution import (
    ExecutionCreateDto,
    ExecutionResponseDto,
    ExecutionDetailDto,
    ExecutionCancelResponseDto
)
from app.services.execution_queue import execution_queue_service

router = APIRouter(prefix="/executions", tags=["Execution Queue"])


@router.post("", response_model=ExecutionResponseDto, status_code=status.HTTP_201_CREATED)
async def create_execution(dto: ExecutionCreateDto):
    """
    Queue a new test case execution.
    Worker picks up the job asynchronously via the Node.js Playwright worker.
    """
    return await execution_queue_service.enqueue(dto)


@router.get("", response_model=List[ExecutionDetailDto])
async def list_executions(limit: int = 50):
    """List execution jobs with their current lifecycle statuses."""
    return await execution_queue_service.list_executions(limit=limit)


@router.get("/{id}", response_model=ExecutionDetailDto)
async def get_execution(id: str):
    """Get status and details of a single execution job."""
    return await execution_queue_service.get_execution(id)


@router.post("/{id}/cancel", response_model=ExecutionCancelResponseDto)
async def cancel_execution(id: str):
    """Cancel a queued or in-progress execution job."""
    return await execution_queue_service.cancel_execution(id)
