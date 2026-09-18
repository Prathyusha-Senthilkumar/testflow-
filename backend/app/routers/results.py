from typing import List
from fastapi import APIRouter
from app.models.test_result import (
    TestResultResponseDto,
    TestCaseHistoryDto
)
from app.services.result_service import result_service

router = APIRouter(tags=["Test Results"])


@router.get("/results", response_model=List[TestResultResponseDto])
async def list_results(limit: int = 50):
    """List all stored test results."""
    return await result_service.list_results(limit=limit)


@router.get("/results/{id:path}", response_model=TestResultResponseDto)
async def get_result(id: str):
    """Get details for a specific test result or execution ID."""
    return await result_service.get_result(id)


@router.get("/test-cases/{test_case_id:path}/results", response_model=TestCaseHistoryDto)
async def get_test_case_results(test_case_id: str):
    """Retrieve full execution history, duration, and pass rate for a given test case."""
    return await result_service.get_test_case_history(test_case_id)
