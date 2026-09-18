from typing import List, Optional
from fastapi import HTTPException
import logging

from app.models.test_result import (
    TestResult,
    TestResultResponseDto,
    TestCaseHistoryDto
)
from app.repositories.execution_repository import execution_repository

logger = logging.getLogger("testflow.result_service")


class ResultService:
    def __init__(self):
        self.repo = execution_repository

    def _to_response_dto(self, r: TestResult) -> TestResultResponseDto:
        return TestResultResponseDto(
            id=r.id,
            execution_id=r.execution_id,
            test_case_id=r.test_case_id,
            auth_profile_id=r.auth_profile_id,
            status=r.status,
            started_at=r.started_at,
            completed_at=r.completed_at,
            duration=r.duration,
            exit_code=r.exit_code,
            error_message=r.error_message,
            stdout_snippet=r.stdout_snippet,
            stderr_snippet=r.stderr_snippet,
            log_file_path=r.log_file_path,
            artifacts=r.artifacts,
            created_at=r.created_at
        )

    async def list_results(self, limit: int = 50) -> List[TestResultResponseDto]:
        results = await self.repo.list_results(limit=limit)
        return [self._to_response_dto(r) for r in results]

    async def get_result(self, result_id: str) -> TestResultResponseDto:
        result = await self.repo.get_test_result(result_id)
        if not result:
            # Check by execution_id as fallback
            result = await self.repo.get_result_by_execution_id(result_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Test result '{result_id}' not found")
        return self._to_response_dto(result)

    async def get_test_case_history(self, test_case_id: str) -> TestCaseHistoryDto:
        results = await self.repo.list_results_for_test_case(test_case_id)
        total = len(results)
        passed = sum(1 for r in results if r.status == "PASSED")
        failed = sum(1 for r in results if r.status == "FAILED")
        pass_rate = round((passed / total) * 100.0, 1) if total > 0 else 0.0

        return TestCaseHistoryDto(
            test_case_id=test_case_id,
            total_runs=total,
            passed_count=passed,
            failed_count=failed,
            pass_rate=pass_rate,
            results=[self._to_response_dto(r) for r in results]
        )


result_service = ResultService()
