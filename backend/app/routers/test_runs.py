from typing import List

from fastapi import APIRouter, Query

from app.repositories.test_run_repository import test_run_repository
from app.schemas.test_run import TestRunHistoryItem

router = APIRouter(prefix="/test-runs", tags=["test-runs"])


@router.get("", response_model=List[TestRunHistoryItem])
@router.get("/", response_model=List[TestRunHistoryItem], include_in_schema=False)
def list_test_runs(limit: int = Query(50, ge=1, le=200)):
    """Recent execution history from the existing test_runs table."""
    return test_run_repository.list_recent(limit)
