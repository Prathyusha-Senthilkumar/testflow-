from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.repositories.test_run_repository import test_run_repository
from app.schemas.test_run import ReportRun, TestRunHistoryItem

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


@router.get("/report", response_model=List[ReportRun])
def list_report_runs(limit: int = Query(500, ge=1, le=1000)):
    """Runs for the Reports screen, including project and suite names."""
    return test_run_repository.list_report(limit)


@router.get("/{run_id}", response_model=ReportRun)
def get_report_run(run_id: str):
    row = test_run_repository.get_report(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Test run not found")
    return row
