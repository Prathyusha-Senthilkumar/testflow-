from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from app.dependencies.auth import current_actor

from app.repositories.test_run_repository import test_run_repository
from app.schemas.execution import ExecutionStatusResponse
from app.schemas.test_run import GroupedRun, LatestCaseRun, ReportRun, RunScreenshot, TestRunHistoryItem
from app.services import signed_urls
from app.services.execution_service import get_execution_service

router = APIRouter(prefix="/test-runs", tags=["test-runs"])
# Image endpoints: no bearer token (loaded by <img src>), authorised by a signed, expiring URL.
signed_router = APIRouter(prefix="/test-runs", tags=["test-runs"])


def _require_signature(request: Request, expires: Optional[int], sig: Optional[str]) -> None:
    path = request.url.path.removeprefix("/api")
    if not signed_urls.verify(path, expires, sig):
        raise HTTPException(status_code=401, detail="This image link has expired. Reload the page.")


@signed_router.get("/{run_id}/screenshots/{file_name}")
def get_run_screenshot_file(
    request: Request,
    run_id: str,
    file_name: str,
    expires: Optional[int] = Query(None),
    sig: Optional[str] = Query(None),
):
    _require_signature(request, expires, sig)
    file_path = test_run_repository.screenshot_named(run_id, file_name)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(file_path, media_type="image/png", filename=file_name)


@signed_router.get("/{run_id}/screenshot")
def get_run_screenshot(
    request: Request,
    run_id: str,
    expires: Optional[int] = Query(None),
    sig: Optional[str] = Query(None),
):
    _require_signature(request, expires, sig)
    file_path = test_run_repository.screenshot_file(run_id)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(file_path, media_type="image/png", filename="final-screenshot.png")


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


@router.get("/grouped", response_model=List[GroupedRun])
def list_grouped_runs():
    """Individual runs plus suite and project batches still stored for this execution history."""
    return get_execution_service().list_grouped_runs()


@router.get("/latest", response_model=List[LatestCaseRun])
def list_latest_case_runs(projectId: str = Query(..., min_length=1)):
    """Latest result for each test case in one project."""
    return test_run_repository.list_latest_for_project(projectId)


@router.get("/report", response_model=List[ReportRun])
def list_report_runs(limit: int = Query(500, ge=1, le=1000)):
    """Runs for the Reports screen, including project and suite names."""
    return test_run_repository.list_report(limit)


@router.post("/{run_id}/cancel", status_code=204)
def cancel_test_run(run_id: str):
    get_execution_service().cancel_test_run(run_id)
    return Response(status_code=204)


@router.post("/{run_id}/rerun", response_model=ExecutionStatusResponse)
def rerun_test_run(run_id: str, actor: Optional[tuple[str, str]] = Depends(current_actor)):
    return get_execution_service().rerun_test_run(run_id, run_by=actor)


@router.get("/{run_id}/screenshots", response_model=List[RunScreenshot])
def list_run_screenshots(run_id: str):
    """Step images with short-lived signed URLs that <img src> can load without a bearer token."""
    items = []
    for entry in test_run_repository.screenshot_steps(run_id):
        path = f"/test-runs/{run_id}/screenshots/{entry['file']}"
        items.append({**entry, "url": signed_urls.sign_path(path)})
    return items


@router.get("/{run_id}/screenshot-url")
def get_run_screenshot_url(run_id: str):
    """Signed URL for the final screenshot."""
    if test_run_repository.screenshot_file(run_id) is None:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return {"url": signed_urls.sign_path(f"/test-runs/{run_id}/screenshot")}


@router.get("/{run_id}", response_model=ReportRun)
def get_report_run(run_id: str):
    row = test_run_repository.get_report(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Test run not found")
    return row
