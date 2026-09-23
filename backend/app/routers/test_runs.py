from typing import List, Optional

from fastapi import APIRouter, Query

from app.repositories.test_run_repository import test_run_repository
from app.schemas.test_run import TestRunHistoryItem

router = APIRouter(prefix="/test-runs", tags=["test-runs"])


@router.get("", response_model=List[TestRunHistoryItem])
@router.get("/", response_model=List[TestRunHistoryItem], include_in_schema=False)
def list_test_runs(
    limit: int = Query(50, ge=1, le=200),
    test_case_id: Optional[str] = Query(None, alias="testCaseId"),
):
    """Recent execution history from the existing test_runs table."""
    if test_case_id:
        return test_run_repository.list_for_test_case(test_case_id, limit)
    return test_run_repository.list_recent(limit)
