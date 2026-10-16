"""Create a plan, then hand an approved plan to the worker for DOM recording."""

import logging
import uuid
from typing import Any

from fastapi import HTTPException

from app.agents.jobs import claim_plan, enqueue_record, load, new_id, public_view, release_plan, save
from app.agents.limits import LoopState
from app.agents.openrouter import ModelError
from app.agents.state.plan import PlanRejected, intake, known_page, plan, url_for_path
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
        user_id: str,
        environment_id: str = "",
        auth_profile_id: str = "",
    ) -> dict[str, Any]:
        if not (environment_id or "").strip():
            raise HTTPException(status_code=400, detail="Choose an environment.")
        try:
            text = intake(prompt)
        except PlanRejected as exc:
            raise HTTPException(status_code=400, detail=exc.reason) from exc
        landing = self._landing_url(project_id, environment_id)
        job = {
            "id": new_id(),
            "projectId": project_id,
            "userId": user_id,
            "phase": "discovering",
            "prompt": text,
            "startPath": "",
            "startUrl": landing,
            "environmentId": environment_id.strip(),
            "authProfileId": (auth_profile_id or "").strip() or None,
            "pages": [],
            "steps": [],
            "expected": "",
            "diary": [],
            "script": "",
            "costUsd": 0,
            "iterations": 0,
            "error": None,
        }
        save(job)
        enqueue_record(job["id"])
        return public_view(job)

    def get(self, project_id: str, job_id: str) -> dict[str, Any]:
        job = self._materialize(self._owned(project_id, job_id))
        return public_view(job)

    def choose_page(self, project_id: str, job_id: str, path: str) -> dict[str, Any]:
        job = self._owned(project_id, job_id)
        if job.get("phase") != "needs_choice":
            raise HTTPException(status_code=409, detail="This plan is not waiting for a page.")
        try:
            chosen = known_page(job.get("pages") or [], path)
        except PlanRejected as exc:
            raise HTTPException(status_code=400, detail=exc.reason) from exc
        job["pages"] = [page for page in (job.get("pages") or []) if page.get("path") == chosen]
        job["phase"] = "discovered"
        job["error"] = None
        save(job)
        return public_view(self._materialize(job))

    def approve(
        self,
        project_id: str,
        job_id: str,
        *,
        accepted: bool,
        case_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        job = self._owned(project_id, job_id)
        if job.get("phase") != "review":
            raise HTTPException(status_code=409, detail="This plan is no longer waiting for approval.")
        if not str(job.get("startUrl") or "").startswith("http"):
            raise HTTPException(status_code=400, detail="The start URL must be an http address.")
        cases = [item for item in (job.get("cases") or []) if isinstance(item, dict)]
        wanted = {str(item).strip() for item in (case_ids or []) if str(item).strip()}
        if wanted:
            known = {str(item.get("id") or "") for item in cases}
            if any(item not in known for item in wanted):
                raise HTTPException(status_code=400, detail="One of those test cases is no longer in this plan.")
        if not accepted:
            if wanted and cases:
                kept = [item for item in cases if str(item.get("id") or "") not in wanted]
                job["cases"] = kept
                if not kept:
                    job["phase"] = "rejected"
                else:
                    self._focus_case(job, kept[0])
            else:
                job["phase"] = "rejected"
            save(job)
            return public_view(job)
        if cases and wanted:
            chosen = [item for item in cases if str(item.get("id") or "") in wanted]
            if not chosen:
                raise HTTPException(status_code=400, detail="Choose a recommended test case.")
            job["cases"] = chosen
            self._focus_case(job, chosen[0])
        elif cases and not wanted:
            self._focus_case(job, cases[0])
        job["phase"] = "recording"
        save(job)
        enqueue_record(job["id"])
        return public_view(job)

    def _focus_case(self, job: dict, case: dict) -> None:
        if case.get("path"):
            job["startPath"] = case.get("path")
        if case.get("startUrl"):
            job["startUrl"] = case.get("startUrl")
        job["steps"] = case.get("steps") or []
        job["expected"] = case.get("expected") or ""

    def save_draft(
        self,
        project_id: str,
        job_id: str,
        actor: tuple[str, str] | None,
        categories: list[str] | None = None,
        case_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        job = self._materialize(self._owned(project_id, job_id))
        planned = [item for item in (job.get("cases") or []) if isinstance(item, dict)]
        wanted = [str(item).strip() for item in (case_ids or []) if str(item).strip()]
        wanted_set = set(wanted)
        if not planned:
            if wanted_set:
                raise HTTPException(status_code=400, detail="Choose a recorded test case.")
            if job.get("testCaseId"):
                return public_view(job)
            job["testCaseId"] = self._store_case(project_id, job, job, actor)
            job["phase"] = "saved"
            save(job)
            return public_view(job)
        if wanted_set:
            known = {str(item.get("id") or "") for item in planned}
            if any(item not in known for item in wanted):
                raise HTTPException(status_code=400, detail="One of those test cases is no longer in this recording.")
        saved_ids: list[str] = []
        for item in planned:
            if wanted_set and str(item.get("id") or "") not in wanted_set:
                continue
            if item.get("testCaseId"):
                saved_ids.append(str(item["testCaseId"]))
                continue
            script = str(item.get("script") or "")
            if item.get("phase") != "draft" or "page.goto(" not in script:
                continue
            created_id = self._store_case(project_id, job, item, actor)
            item["testCaseId"] = created_id
            item["phase"] = "saved"
            saved_ids.append(created_id)
            job["cases"] = planned
            save(job)
        if not saved_ids:
            raise HTTPException(status_code=409, detail="The recording is not ready to save.")
        if len(saved_ids) >= 2:
            job["suiteId"] = self._attach_suite(project_id, job, saved_ids, categories or [])
        job["testCaseId"] = saved_ids[0]
        job["cases"] = planned
        pending = [
            item
            for item in planned
            if not item.get("testCaseId") and item.get("phase") in {"draft", "recorded"}
        ]
        if not pending:
            job["phase"] = "saved"
        save(job)
        return public_view(job)

    def drop_cases(
        self,
        project_id: str,
        job_id: str,
        case_ids: list[str],
        actor: tuple[str, str] | None,
    ) -> dict[str, Any]:
        job = self._materialize(self._owned(project_id, job_id))
        wanted = {str(item).strip() for item in case_ids if str(item).strip()}
        if not wanted:
            raise HTTPException(status_code=400, detail="Choose at least one test case.")
        planned = [item for item in (job.get("cases") or []) if isinstance(item, dict)]
        kept: list[dict] = []
        removed = False
        for item in planned:
            if str(item.get("id") or "") not in wanted:
                kept.append(item)
                continue
            removed = True
            test_case_id = str(item.get("testCaseId") or "").strip()
            if test_case_id:
                TestCasesService(test_case_repository, project_repository).delete(project_id, test_case_id)
        if not removed:
            raise HTTPException(status_code=400, detail="Choose a recorded test case.")
        job["cases"] = kept
        if not kept:
            job["phase"] = "draft"
            job["testCaseId"] = None
        elif any(not item.get("testCaseId") and item.get("phase") in {"draft", "recorded"} for item in kept):
            job["phase"] = "draft"
        save(job)
        return public_view(job)

    def _materialize(self, job: dict) -> dict:
        if job.get("phase") == "discovered":
            return self._plan(job)
        cases = [item for item in (job.get("cases") or []) if isinstance(item, dict)]
        if cases and job.get("phase") == "recorded":
            for item in cases:
                if item.get("phase") == "recorded" and not item.get("script"):
                    item["script"] = compile_script(item.get("startUrl") or "", item.get("diary") or [], item.get("expected") or "")
                    item["phase"] = "draft"
            ready = next((item for item in cases if item.get("script")), None)
            if ready:
                job["script"] = ready["script"]
                job["startPath"] = ready.get("path") or job.get("startPath")
                job["expected"] = ready.get("expected") or ""
                job["phase"] = "draft"
            else:
                job["phase"] = "failed"
                job["error"] = job.get("error") or "Every test case failed while recording."
            job["cases"] = cases
            save(job)
            return job
        if job.get("phase") == "recorded" and not job.get("script"):
            job["script"] = compile_script(job.get("startUrl") or "", job.get("diary") or [], job.get("expected") or "")
            job["phase"] = "draft"
            save(job)
        return job

    def _plan(self, job: dict) -> dict:
        if not claim_plan(str(job["id"])):
            return load(str(job["id"])) or job
        job["phase"] = "planning"
        save(job)
        try:
            loop = LoopState()
            loop.cost_usd = float(job.get("costUsd") or 0)
            planned, loop = plan(
                str(job.get("prompt") or ""),
                job.get("pages") or [],
                loop,
                job_cost_cap=settings.AGENT_MAX_COST_USD,
            )
            landing = str(job.get("startUrl") or "")
            stored = []
            for item in planned["cases"]:
                stored.append({
                    "id": uuid.uuid4().hex[:12],
                    "name": item["name"],
                    "path": item["path"],
                    "startUrl": url_for_path(landing, item["path"]),
                    "steps": item["steps"],
                    "expected": item["expected"],
                    "phase": "review",
                    "error": None,
                    "diary": [],
                    "script": "",
                    "testCaseId": None,
                })
            first = stored[0]
            job["cases"] = stored
            job["startPath"] = first["path"]
            job["startUrl"] = first["startUrl"]
            job["steps"] = first["steps"]
            job["expected"] = first["expected"]
            job["costUsd"] = loop.cost_usd
            job["iterations"] = loop.iterations
            job["phase"] = "review"
            job["error"] = None
        except PlanRejected as exc:
            job["phase"] = "needs_choice"
            job["error"] = exc.reason
        except ModelError as exc:
            log_failure(logger, "agent.plan", exc)
            job["phase"] = "failed"
            job["error"] = "The planner is unavailable. Try again."
        save(job)
        release_plan(str(job["id"]))
        return job

    def _store_case(self, project_id: str, job: dict, item: dict, actor: tuple[str, str] | None) -> str:
        script = str(item.get("script") or "")
        if "page.goto(" not in script:
            raise HTTPException(status_code=409, detail="The recording is not ready to save.")
        service = TestCasesService(test_case_repository, project_repository)
        name = " ".join(str(item.get("name") or job.get("prompt") or "Agent test").split())[:80] or "Agent test"
        created = service.create(
            project_id,
            CreateTestCaseDto(name=name, description=str(item.get("name") or job.get("prompt") or "")),
            actor,
        )
        relative = f"automation/generated/{project_id}/{created.id}/test_recorded.py"
        write_test_script(relative, script)
        service.test_cases.update_automation(project_id, created.id, relative, "Automated")
        fields: dict[str, Any] = {"startPath": item.get("path") or item.get("startPath") or job.get("startPath") or "/"}
        if item.get("expected"):
            fields["expectedResult"] = item["expected"]
        if job.get("environmentId"):
            fields["environmentId"] = job["environmentId"]
        if job.get("authProfileId"):
            fields["authProfileId"] = job["authProfileId"]
        service.update(project_id, created.id, UpdateTestCaseDto(**fields), actor)
        return created.id

    def _store_suite(self, project_id: str, job: dict, case_ids: list[str], categories: list[str]) -> str:
        from app.repositories.test_suite_repository import test_suite_repository
        from app.schemas.test_suite import AddTestCasesToSuiteDto, CreateTestSuiteDto, normalize_suite_categories
        from app.services.test_suites_service import TestSuitesService

        chosen = normalize_suite_categories(categories)
        if not chosen:
            raise HTTPException(status_code=400, detail="Choose at least one category.")
        name = " ".join(str(job.get("prompt") or "Agent suite").split())[:80] or "Agent suite"
        suites = TestSuitesService(test_suite_repository, test_case_repository, project_repository)
        created = suites.create(
            project_id,
            CreateTestSuiteDto(
                name=name,
                description=str(job.get("prompt") or ""),
                category=chosen[0],
                categories=chosen,
            ),
        )
        suites.add_test_cases(project_id, created.id, AddTestCasesToSuiteDto(testCaseIds=case_ids))
        return created.id

    def _attach_suite(self, project_id: str, job: dict, case_ids: list[str], categories: list[str]) -> str:
        """Group this selection into one suite. A later selection is added to that suite."""
        if job.get("suiteId"):
            from app.repositories.test_suite_repository import test_suite_repository
            from app.schemas.test_suite import AddTestCasesToSuiteDto
            from app.services.test_suites_service import TestSuitesService

            suites = TestSuitesService(test_suite_repository, test_case_repository, project_repository)
            suites.add_test_cases(project_id, str(job["suiteId"]), AddTestCasesToSuiteDto(testCaseIds=case_ids))
            return str(job["suiteId"])
        return self._store_suite(project_id, job, case_ids, categories)

    def _landing_url(self, project_id: str, environment_id: str) -> str:
        from app.repositories.environment_repository import environment_repository
        from app.services.environments_service import EnvironmentsService

        env = EnvironmentsService(environment_repository, project_repository).environments.find_by_id(
            project_id, environment_id
        )
        landing = (env.baseUrl or "").strip()
        if not landing.lower().startswith("http"):
            raise HTTPException(status_code=400, detail="The environment URL must be an http address.")
        return landing

    def _owned(self, project_id: str, job_id: str) -> dict:
        job = load(job_id)
        if not job or job.get("projectId") != project_id:
            raise HTTPException(status_code=404, detail="Agent job not found.")
        return job


agent_service = AgentService()
