import uuid
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException

from app.models.execution import (
    ExecutionJob,
    ExecutionStatus,
    ExecutionCreateDto,
    ExecutionResponseDto,
    ExecutionDetailDto,
    ExecutionCancelResponseDto
)
from app.repositories.execution_repository import execution_repository

logger = logging.getLogger("testflow.queue")


class ExecutionQueueService:
    def __init__(self):
        self.repo = execution_repository

    async def enqueue(self, dto: ExecutionCreateDto) -> ExecutionResponseDto:
        if not dto.test_case_id or not dto.test_case_id.strip():
            raise HTTPException(status_code=400, detail="test_case_id is required")

        # Prevent duplicate queued execution for the exact same test case
        current_jobs = await self.repo.list_executions()
        for j in current_jobs:
            if j.test_case_id == dto.test_case_id.strip() and j.status in (ExecutionStatus.QUEUED, ExecutionStatus.RUNNING):
                # If already running or queued, reject or return existing to prevent duplicate execution
                logger.warning(f"Test case {dto.test_case_id} is already in state {j.status} ({j.id})")
                raise HTTPException(
                    status_code=409,
                    detail=f"Test case '{dto.test_case_id}' already has an active execution: {j.id} (Status: {j.status})"
                )

        execution_id = f"exec_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        job = ExecutionJob(
            id=execution_id,
            test_case_id=dto.test_case_id.strip(),
            auth_profile_id=dto.auth_profile_id.strip() if dto.auth_profile_id else None,
            status=ExecutionStatus.QUEUED,
            created_at=now,
            execution_mode=dto.execution_mode or "auto"
        )
        saved = await self.repo.create_execution(job)
        logger.info(f"Execution job queued: {saved.id} for test_case={saved.test_case_id}")
        return ExecutionResponseDto(
            execution_id=saved.id,
            status=saved.status,
            test_case_id=saved.test_case_id,
            auth_profile_id=saved.auth_profile_id,
            created_at=saved.created_at
        )

    async def get_execution(self, execution_id: str) -> ExecutionDetailDto:
        job = await self.repo.get_execution(execution_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")

        return ExecutionDetailDto(
            id=job.id,
            test_case_id=job.test_case_id,
            auth_profile_id=job.auth_profile_id,
            status=job.status,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            result_id=job.result_id,
            execution_mode=job.execution_mode
        )

    async def list_executions(self, limit: int = 50) -> List[ExecutionDetailDto]:
        jobs = await self.repo.list_executions(limit=limit)
        return [
            ExecutionDetailDto(
                id=job.id,
                test_case_id=job.test_case_id,
                auth_profile_id=job.auth_profile_id,
                status=job.status,
                created_at=job.created_at,
                started_at=job.started_at,
                completed_at=job.completed_at,
                error_message=job.error_message,
                result_id=job.result_id,
                execution_mode=job.execution_mode
            )
            for job in jobs
        ]

    async def cancel_execution(self, execution_id: str) -> ExecutionCancelResponseDto:
        job = await self.repo.get_execution(execution_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")

        if job.status in (ExecutionStatus.PASSED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel execution in state '{job.status}'"
            )

        job.status = ExecutionStatus.CANCELLED
        job.completed_at = datetime.now(timezone.utc).isoformat()
        job.error_message = "Execution cancelled by user request"
        await self.repo.update_execution(job)
        logger.info(f"Execution {execution_id} cancelled.")
        return ExecutionCancelResponseDto(
            execution_id=job.id,
            status=job.status,
            message="Execution successfully cancelled"
        )


execution_queue_service = ExecutionQueueService()
