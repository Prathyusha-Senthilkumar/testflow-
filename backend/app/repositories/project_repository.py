import time
from datetime import datetime, timezone
from typing import List, Dict, Optional
from fastapi import HTTPException
from app.database import supabase_client
from app.schemas.project import (
    ProjectSummary,
    ProjectDetail,
    SuiteSummary,
    CreateProjectDto,
    UpdateProjectDto,
)

def get_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

now_str = get_now_iso()

initial_demo_project = ProjectDetail(
    id="demo-project",
    name="SRM Website Testing",
    baseUrl="https://www.srmist.edu.in/",
    description="Automated tests for the public SRM Institute website.",
    suites=3,
    cases=3,
    passed=3,
    failed=0,
    passRate=100,
    lastRun=now_str,
    lastRunBy="QA User",
    suitesList=[
        SuiteSummary(
            id=f"demo-suite-{i + 1}",
            name=name,
            cases=1,
            passed=1,
            failed=0,
            notRun=0,
            passRate=100,
            lastRun=now_str,
            lastRunBy="QA User",
        )
        for i, name in enumerate(["Admissions", "Academics", "Homepage"])
    ],
)


class ProjectRepository:
    def __init__(self):
        self.db = supabase_client
        self.demo_projects: Dict[str, ProjectDetail] = {
            initial_demo_project.id: initial_demo_project.model_copy(deep=True)
        }

    def find_all(self) -> List[ProjectSummary]:
        if not self.db:
            return [
                ProjectSummary(
                    id=p.id,
                    name=p.name,
                    baseUrl=p.baseUrl,
                    description=p.description,
                    suites=p.suites,
                    cases=p.cases,
                    passed=p.passed,
                    failed=p.failed,
                    passRate=p.passRate,
                    lastRun=p.lastRun,
                    lastRunBy=p.lastRunBy,
                )
                for p in self.demo_projects.values()
            ]

        res = (
            self.db.from_("project_overview")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        if hasattr(res, "error") and res.error:
            raise Exception(res.error)
        return [self._map_project(row) for row in (res.data or [])]

    def find_by_id(self, id: str) -> ProjectDetail:
        if not self.db:
            project = self.demo_projects.get(id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            return project

        res = (
            self.db.from_("project_overview")
            .select("*")
            .eq("id", id)
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")

        project_row = res.data[0]

        suites_res = (
            self.db.from_("suite_overview")
            .select("*")
            .eq("project_id", id)
            .order("name")
            .execute()
        )

        project_summary = self._map_project(project_row)
        suites_list = [self._map_suite(s) for s in (suites_res.data or [])]

        return ProjectDetail(
            **project_summary.model_dump(by_alias=True),
            suitesList=suites_list
        )

    def create(self, input_dto: CreateProjectDto) -> ProjectDetail:
        desc = input_dto.description.strip() if input_dto.description and input_dto.description.strip() else None

        if not self.db:
            new_id = f"demo-{int(time.time() * 1000)}"
            project = ProjectDetail(
                id=new_id,
                name=input_dto.name,
                baseUrl=input_dto.baseUrl,
                description=desc,
                suites=0,
                cases=0,
                passed=0,
                failed=0,
                passRate=0,
                lastRun=None,
                lastRunBy=None,
                suitesList=[],
            )
            self.demo_projects[new_id] = project
            return project

        res = (
            self.db.from_("projects")
            .insert({
                "name": input_dto.name,
                "base_url": input_dto.baseUrl,
                "description": desc,
            })
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise Exception("Could not create project")
        new_id = res.data[0]["id"]
        return self.find_by_id(new_id)

    def update(self, id: str, input_dto: UpdateProjectDto) -> ProjectDetail:
        if not self.db:
            existing = self.demo_projects.get(id)
            if not existing:
                raise HTTPException(status_code=404, detail="Project not found")

            updated_data = existing.model_dump(by_alias=True)
            if input_dto.name is not None:
                updated_data["name"] = input_dto.name
            if input_dto.baseUrl is not None:
                updated_data["baseUrl"] = input_dto.baseUrl
            if input_dto.description is not None:
                updated_data["description"] = input_dto.description

            updated_project = ProjectDetail(**updated_data)
            self.demo_projects[id] = updated_project
            return updated_project

        changes = {}
        if input_dto.name is not None:
            changes["name"] = input_dto.name
        if input_dto.baseUrl is not None:
            changes["base_url"] = input_dto.baseUrl
        if input_dto.description is not None:
            changes["description"] = input_dto.description

        if changes:
            self.db.from_("projects").update(changes).eq("id", id).execute()

        return self.find_by_id(id)

    def save_generated_suites(self, project_id: str, suites: list) -> None:
        """
        Persists generated suites and test cases to Supabase or demo in-memory storage.
        """
        if not self.db:
            project = self.demo_projects.get(project_id)
            if not project:
                # If project doesn't exist in demo, create placeholder
                project = ProjectDetail(
                    id=project_id,
                    name=f"Project {project_id}",
                    baseUrl="https://example.com",
                    description="Auto-generated project",
                    suites=0,
                    cases=0,
                    passed=0,
                    failed=0,
                    passRate=0,
                    lastRun=None,
                    lastRunBy=None,
                    suitesList=[],
                )
                self.demo_projects[project_id] = project

            for suite in suites:
                suite_id = suite.id or f"gen-suite-{int(time.time() * 1000)}-{len(project.suitesList) + 1}"
                suite_summary = SuiteSummary(
                    id=suite_id,
                    name=suite.name,
                    cases=len(suite.cases),
                    passed=0,
                    failed=0,
                    notRun=len(suite.cases),
                    passRate=0,
                    lastRun=None,
                    lastRunBy=None
                )
                project.suitesList.append(suite_summary)
                project.suites += 1
                project.cases += len(suite.cases)
            return

        # Supabase persistence
        for suite in suites:
            # 1. Insert into test_suites
            s_res = (
                self.db.from_("test_suites")
                .insert({
                    "project_id": project_id,
                    "name": suite.name,
                    "source": "Suggested"
                })
                .execute()
            )
            if s_res.data and len(s_res.data) > 0:
                created_suite_id = s_res.data[0]["id"]
                for case in suite.cases:
                    # 2. Insert into test_cases
                    c_res = (
                        self.db.from_("test_cases")
                        .insert({
                            "project_id": project_id,
                            "code": case.code,
                            "name": case.name,
                            "description": case.description,
                            "test_file": case.test_file,
                            "automation_status": "Automated",
                            "suggested_suite_name": suite.name
                        })
                        .execute()
                    )
                    if c_res.data and len(c_res.data) > 0:
                        created_case_id = c_res.data[0]["id"]
                        # 3. Associate via test_suite_cases
                        self.db.from_("test_suite_cases").insert({
                            "test_suite_id": created_suite_id,
                            "test_case_id": created_case_id
                        }).execute()

    def _map_project(self, row: dict) -> ProjectSummary:
        return ProjectSummary(
            id=str(row.get("id")),
            name=str(row.get("name")),
            baseUrl=str(row.get("base_url")),
            description=row.get("description"),
            suites=int(row.get("suites") or 0),
            cases=int(row.get("cases") or 0),
            passed=int(row.get("passed") or 0),
            failed=int(row.get("failed") or 0),
            passRate=float(row.get("pass_rate") or 0),
            lastRun=row.get("last_run"),
            lastRunBy=row.get("last_run_by"),
        )

    def _map_suite(self, row: dict) -> SuiteSummary:
        return SuiteSummary(
            id=str(row.get("id")),
            name=str(row.get("name")),
            cases=int(row.get("cases") or 0),
            passed=int(row.get("passed") or 0),
            failed=int(row.get("failed") or 0),
            notRun=int(row.get("not_run") or 0),
            passRate=float(row.get("pass_rate") or 0),
            lastRun=row.get("last_run"),
            lastRunBy=row.get("last_run_by"),
        )
