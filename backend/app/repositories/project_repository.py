import time
from datetime import datetime, timezone
from typing import List, Dict, Optional
from fastapi import HTTPException
from app.database import get_supabase_client
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
        self.demo_projects: Dict[str, ProjectDetail] = {
            initial_demo_project.id: initial_demo_project.model_copy(deep=True)
        }

    @property
    def db(self):
        return get_supabase_client()

    def find_all(self) -> List[ProjectSummary]:
        if not self.db:
            projects = [
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
            return sorted(projects, key=lambda item: item.id, reverse=True)

        res = (
            self.db.from_("projects")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        if hasattr(res, "error") and res.error:
            raise Exception(res.error)

        projects = res.data or []
        suites = self._all_rows("test_suites", "id,project_id")
        cases = self._all_rows("test_cases", "id,suite_id")
        latest_runs = self._latest_runs([str(c["id"]) for c in cases])

        # Real schema: project -> test_suites(project_id) -> test_cases(suite_id).
        suite_to_project: Dict[str, str] = {
            str(s["id"]): str(s["project_id"]) for s in suites if s.get("project_id")
        }
        suite_counts: Dict[str, int] = {}
        for s in suites:
            pid = str(s.get("project_id"))
            suite_counts[pid] = suite_counts.get(pid, 0) + 1

        cases_by_project: Dict[str, List[str]] = {}
        for case in cases:
            pid = suite_to_project.get(str(case.get("suite_id")))
            if pid:
                cases_by_project.setdefault(pid, []).append(str(case["id"]))

        return [
            self._project_summary_from_base(row, cases_by_project, suite_counts, latest_runs)
            for row in projects
        ]

    def find_by_id(self, id: str) -> ProjectDetail:
        if not self.db:
            project = self.demo_projects.get(id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            return project

        res = (
            self.db.from_("projects")
            .select("*")
            .eq("id", id)
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        project_row = res.data[0]

        suites = self._all_rows("test_suites", "*", ("project_id", id))
        suite_ids = [str(s["id"]) for s in suites]
        cases = self._cases_for_suites(suite_ids)
        case_ids = [str(c["id"]) for c in cases]
        latest_runs = self._latest_runs(case_ids)

        cases_by_project = {id: case_ids}
        suite_counts = {id: len(suites)}
        project_summary = self._project_summary_from_base(
            project_row, cases_by_project, suite_counts, latest_runs
        )

        cases_by_suite: Dict[str, List[str]] = {}
        for case in cases:
            cases_by_suite.setdefault(str(case.get("suite_id")), []).append(str(case["id"]))

        suites_list = [
            self._suite_summary_from_base(s, cases_by_suite, latest_runs) for s in suites
        ]
        suites_list.sort(key=lambda s: s.name.lower())

        return ProjectDetail(
            **project_summary.model_dump(by_alias=True),
            suitesList=suites_list,
        )

    # ---- Base-table aggregation helpers -----------------------------------
    def _all_rows(self, table: str, columns: str, eq: tuple | None = None) -> list:
        query = self.db.from_(table).select(columns)
        if eq is not None:
            query = query.eq(eq[0], eq[1])
        res = query.execute()
        return res.data or []

    def _cases_for_suites(self, suite_ids: List[str]) -> list:
        if not suite_ids:
            return []
        res = (
            self.db.from_("test_cases")
            .select("id,suite_id")
            .in_("suite_id", suite_ids)
            .execute()
        )
        return res.data or []

    def _latest_runs(self, case_ids: List[str]) -> Dict[str, dict]:
        """Latest test_run row per test_case_id (most recent started_at first)."""
        if not case_ids:
            return {}
        res = (
            self.db.from_("test_runs")
            .select("test_case_id,status,started_at,completed_at")
            .in_("test_case_id", case_ids)
            .order("started_at", desc=True)
            .execute()
        )
        latest: Dict[str, dict] = {}
        for row in res.data or []:
            cid = str(row["test_case_id"])
            if cid not in latest:
                latest[cid] = row
        return latest

    def _aggregate(self, case_ids: List[str], latest_runs: Dict[str, dict]) -> dict:
        passed = failed = 0
        last_run = None
        for cid in case_ids:
            run = latest_runs.get(cid)
            if not run:
                continue
            status = run.get("status")
            if status == "Passed":
                passed += 1
            elif status == "Failed":
                failed += 1
            completed = run.get("completed_at")
            if completed and (last_run is None or completed > last_run):
                last_run = completed
        total = len(case_ids)
        pass_rate = round(100.0 * passed / total) if total else 0
        return {
            "cases": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": pass_rate,
            "last_run": last_run,
        }

    def _project_summary_from_base(
        self,
        row: dict,
        cases_by_project: Dict[str, List[str]],
        suite_counts: Dict[str, int],
        latest_runs: Dict[str, dict],
    ) -> ProjectSummary:
        project_id = str(row.get("id"))
        case_ids = cases_by_project.get(project_id, [])
        agg = self._aggregate(case_ids, latest_runs)
        return ProjectSummary(
            id=project_id,
            name=str(row.get("name")),
            baseUrl=str(row.get("base_url")),
            description=row.get("description"),
            suites=suite_counts.get(project_id, 0),
            cases=agg["cases"],
            passed=agg["passed"],
            failed=agg["failed"],
            passRate=agg["pass_rate"],
            lastRun=agg["last_run"],
            lastRunBy=None,
        )

    def _suite_summary_from_base(
        self,
        suite_row: dict,
        cases_by_suite: Dict[str, List[str]],
        latest_runs: Dict[str, dict],
    ) -> SuiteSummary:
        suite_id = str(suite_row.get("id"))
        case_ids = cases_by_suite.get(suite_id, [])
        agg = self._aggregate(case_ids, latest_runs)
        not_run = agg["cases"] - agg["passed"] - agg["failed"]
        return SuiteSummary(
            id=suite_id,
            name=str(suite_row.get("name")),
            cases=agg["cases"],
            passed=agg["passed"],
            failed=agg["failed"],
            notRun=not_run,
            passRate=agg["pass_rate"],
            lastRun=agg["last_run"],
            lastRunBy=None,
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

        # Note: the deployed public.projects table has no `description` column,
        # so it is not persisted. Do not add it here without a schema change.
        res = (
            self.db.from_("projects")
            .insert({
                "name": input_dto.name,
                "base_url": input_dto.baseUrl,
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

        # public.projects has no `description` column; skip it (no schema change).
        changes = {}
        if input_dto.name is not None:
            changes["name"] = input_dto.name
        if input_dto.baseUrl is not None:
            changes["base_url"] = input_dto.baseUrl

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


# Shared demo/in-memory store for all API routers in Phase 1.
project_repository = ProjectRepository()
