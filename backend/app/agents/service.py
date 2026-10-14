"""Create a plan, then hand an approved plan to the worker for DOM recording."""

import logging
from typing import Any

from fastapi import HTTPException

from app.agents.jobs import enqueue_record, load, new_id, public_view, save
from app.agents.limits import LoopState
from app.agents.openrouter import ModelError
from app.agents.state.plan import PlanRejected, intake, plan
from app.agents.state.script import compile_script
from app.config import settings
from app.logging_format import log_failure
from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.schemas.test_case import CreateTestCaseDto, UpdateTestCaseDto
from app.services.automation_service import write_test_script
from app.services.test_cases_service import TestCasesService

logger = logging.getLogger("testflow.agents")


class AgentService:
    def create(
        self,
        project_id: str,
        prompt: str,
        start_path: str,
        start_url: str,
        user_id: str,
        environment_id: str = "",
        auth_profile_id: str = "",
    ) -> dict[str, Any]:
        if not start_url.strip().lower().startswith("http"):
            raise HTTPException(status_code=400, detail="The start URL must be an http address.")
        try:
            text = intake(prompt)
            loop = LoopState()
            planned, loop = plan(text, start_path or "/", loop, job_cost_cap=settings.AGENT_MAX_COST_USD)
        except PlanRejected as exc:
            raise HTTPException(status_code=400, detail=exc.reason) from exc
        except ModelError as exc:
            log_failure(logger, "agent.plan", exc)
            raise HTTPException(status_code=503, detail="The planner is unavailable. Try again.") from exc
        job = {
            "id": new_id(),
            "projectId": project_id,
            "userId": user_id,
            "phase": "review",
            "prompt": text,
            "startPath": start_path or "/",
            "startUrl": start_url.strip(),
            "environmentId": (environment_id or "").strip() or None,
            "authProfileId": (auth_profile_id or "").strip() or None,
            "steps": planned["steps"],
            "expected": planned["expected"],
            "diary": [],
            "script": "",
            "costUsd": loop.cost_usd,
            "iterations": loop.iterations,
            "error": None,
        }
        save(job)
        return public_view(job)

    def get(self, project_id: str, job_id: str) -> dict[str, Any]:
        job = self._materialize(self._owned(project_id, job_id))
        return public_view(job)

    def approve(self, project_id: str, job_id: str, *, accepted: bool) -> dict[str, Any]:
        job = self._owned(project_id, job_id)
        if job.get("phase") != "review":
            raise HTTPException(status_code=409, detail="This plan is no longer waiting for approval.")
        if not str(job.get("startUrl") or "").startswith("http"):
            raise HTTPException(status_code=400, detail="The start URL must be an http address.")
        if not accepted:
            job["phase"] = "rejected"
            save(job)
            return public_view(job)
        job["phase"] = "recording"
        save(job)
        enqueue_record(job["id"])
        return public_view(job)

    def save_draft(self, project_id: str, job_id: str, actor: tuple[str, str] | None) -> dict[str, Any]:
        job = self._materialize(self._owned(project_id, job_id))
        if job.get("testCaseId"):
            return public_view(job)
        script = str(job.get("script") or "")
        if job.get("phase") != "draft" or "expect(" not in script:
            raise HTTPException(status_code=409, detail="The recording is not ready to save.")
        cases = TestCasesService(test_case_repository, project_repository)
        name = " ".join(str(job.get("prompt") or "Agent test").split())[:80] or "Agent test"
        created = cases.create(
            project_id,
            CreateTestCaseDto(name=name, description=str(job.get("prompt") or "")),
            actor,
        )
        relative = f"automation/generated/{project_id}/{created.id}/test_recorded.py"
        write_test_script(relative, script)
        cases.test_cases.update_automation(project_id, created.id, relative, "Automated")
        fields: dict[str, Any] = {"startPath": job.get("startPath") or "/"}
        if job.get("expected"):
            fields["expectedResult"] = job["expected"]
        if job.get("environmentId"):
            fields["environmentId"] = job["environmentId"]
        if job.get("authProfileId"):
            fields["authProfileId"] = job["authProfileId"]
        cases.update(project_id, created.id, UpdateTestCaseDto(**fields), actor)
        job["testCaseId"] = created.id
        job["phase"] = "saved"
        save(job)
        return public_view(job)

    def _materialize(self, job: dict) -> dict:
        if job.get("phase") == "recorded" and not job.get("script"):
            job["script"] = compile_script(job.get("startUrl") or "", job.get("diary") or [], job.get("expected") or "")
            job["phase"] = "draft"
            save(job)
        return job

    def _owned(self, project_id: str, job_id: str) -> dict:
        job = load(job_id)
        if not job or job.get("projectId") != project_id:
            raise HTTPException(status_code=404, detail="Agent job not found.")
        return job


agent_service = AgentService()
