from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agents.service import agent_service
from app.dependencies.auth import current_actor

router = APIRouter(prefix="/projects/{project_id}/agent-jobs", tags=["agents"])


class CreateAgentJob(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    environmentId: str = ""
    authProfileId: str = ""


class Approval(BaseModel):
    accepted: bool


class PageChoice(BaseModel):
    path: str = Field(min_length=1, max_length=500)


def _user_id(actor: Optional[tuple[str, str]]) -> str:
    return actor[0] if actor else ""


@router.post("")
def create_agent_job(
    project_id: str,
    body: CreateAgentJob,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
):
    return agent_service.create(
        project_id,
        body.prompt,
        _user_id(actor),
        body.environmentId,
        body.authProfileId,
    )


@router.get("/{job_id}")
def get_agent_job(project_id: str, job_id: str, _: Optional[tuple[str, str]] = Depends(current_actor)):
    return agent_service.get(project_id, job_id)


@router.post("/{job_id}/page")
def choose_agent_page(
    project_id: str,
    job_id: str,
    body: PageChoice,
    _: Optional[tuple[str, str]] = Depends(current_actor),
):
    return agent_service.choose_page(project_id, job_id, body.path)


@router.post("/{job_id}/approval")
def approve_agent_job(
    project_id: str,
    job_id: str,
    body: Approval,
    _: Optional[tuple[str, str]] = Depends(current_actor),
):
    return agent_service.approve(project_id, job_id, accepted=body.accepted)


@router.post("/{job_id}/save")
def save_agent_draft(
    project_id: str,
    job_id: str,
    actor: Optional[tuple[str, str]] = Depends(current_actor),
):
    return agent_service.save_draft(project_id, job_id, actor)
