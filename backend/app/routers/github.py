from fastapi import APIRouter, Depends, Query, Response

from app.schemas.github import DisconnectResult, GitHubConnection, RunGitHubIssueStatus, SaveGitHubConnection
from app.services.github_service import GitHubService, github_service

router = APIRouter(tags=["github"])


def get_github_service() -> GitHubService:
    return github_service


@router.get("/projects/{project_id}/github", response_model=GitHubConnection)
def get_github_connection(project_id: str, service: GitHubService = Depends(get_github_service)):
    return service.get(project_id)


@router.put("/projects/{project_id}/github", response_model=GitHubConnection)
def save_github_connection(
    project_id: str, body: SaveGitHubConnection, service: GitHubService = Depends(get_github_service)
):
    return service.save(project_id, body)


@router.delete("/projects/{project_id}/github", response_model=DisconnectResult)
def disconnect_github(
    project_id: str,
    revoke: bool = Query(False, description="Also ask GitHub to revoke the token"),
    service: GitHubService = Depends(get_github_service),
):
    return service.disconnect(project_id, revoke=revoke)


@router.get("/test-runs/{run_id}/github-issue", response_model=RunGitHubIssueStatus)
def get_run_github_issue(run_id: str, service: GitHubService = Depends(get_github_service)):
    return service.issue_status(run_id)


@router.post("/test-runs/{run_id}/github-issue", response_model=RunGitHubIssueStatus)
def create_run_github_issue(run_id: str, service: GitHubService = Depends(get_github_service)):
    return service.file_now(run_id)


@router.get("/test-runs/{run_id}/report.pdf")
def get_run_pdf(run_id: str, service: GitHubService = Depends(get_github_service)):
    content, file_name = service.pdf(run_id)
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )
