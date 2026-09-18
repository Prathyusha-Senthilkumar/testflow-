import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import HTTPException, status
from app.database import get_supabase_client
from app.schemas.project import (
    CreateProjectDto,
    ProjectDetail,
    ProjectSummary,
    SuiteSummary,
    UpdateProjectDto,
)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class ProjectRepository:
    def __init__(self):
        # Demo data fallback when Supabase is not connected
        demo_now = now_iso()
        self.demo_projects: Dict[str, ProjectDetail] = {
            "demo-project": ProjectDetail(
                id="demo-project",
                name="SRM Website Testing",
                baseUrl="https://www.srmist.edu.in/",
                description="Automated tests for the public SRM Institute website.",
                suites=3,
                cases=3,
                passed=3,
                failed=0,
                passRate=100.0,
                lastRun=demo_now,
                lastRunBy="QA User",
                suitesList=[
                    SuiteSummary(
                        id=f"demo-suite-{idx + 1}",
                        name=name,
                        cases=1,
                        passed=1,
                        failed=0,
                        notRun=0,
                        passRate=100.0,
                        lastRun=demo_now,
                        lastRunBy="QA User",
                    )
                    for idx, name in enumerate(["Admissions", "Academics", "Homepage"])
                ],
            )
        }

    async def find_all(self) -> List[ProjectSummary]:
        client = get_supabase_client()
        if not client:
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

        try:
            res = client.from_("project_overview").select("*").order("created_at", desc=True).execute()
            data = res.data or []
            return [self._map_project(row) for row in data]
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database query failed: {str(err)}"
            )

    async def find_by_id(self, project_id: str) -> ProjectDetail:
        client = get_supabase_client()
        if not client:
            project = self.demo_projects.get(project_id)
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            return project

        try:
            p_res = client.from_("project_overview").select("*").eq("id", project_id).single().execute()
            project_row = p_res.data
            if not project_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

            s_res = client.from_("suite_overview").select("*").eq("project_id", project_id).order("name").execute()
            suites_data = s_res.data or []

            summary = self._map_project(project_row)
            return ProjectDetail(
                **summary.model_dump(),
                description=project_row.get("description"),
                suitesList=[self._map_suite(row) for row in suites_data]
            )
        except HTTPException:
            raise
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project not found or query error: {str(err)}"
            )

    async def create(self, input_data: CreateProjectDto) -> ProjectDetail:
        client = get_supabase_client()
        desc = input_data.description.strip() if input_data.description and input_data.description.strip() else None

        if not client:
            p_id = f"demo-{int(time.time() * 1000)}"
            project = ProjectDetail(
                id=p_id,
                name=input_data.name,
                baseUrl=input_data.baseUrl,
                description=desc,
                suites=0,
                cases=0,
                passed=0,
                failed=0,
                passRate=0.0,
                lastRun=None,
                lastRunBy=None,
                suitesList=[],
            )
            self.demo_projects[p_id] = project
            return project

        try:
            insert_data = {
                "name": input_data.name,
                "base_url": input_data.baseUrl,
                "description": desc,
            }
            res = client.from_("projects").insert(insert_data).select("id").single().execute()
            if not res.data or "id" not in res.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not create project"
                )
            return await self.find_by_id(res.data["id"])
        except HTTPException:
            raise
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to create project: {str(err)}"
            )

    async def update(self, project_id: str, input_data: UpdateProjectDto) -> ProjectDetail:
        client = get_supabase_client()
        if not client:
            existing = self.demo_projects.get(project_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

            updated_data = existing.model_dump()
            if input_data.name is not None:
                updated_data["name"] = input_data.name
            if input_data.baseUrl is not None:
                updated_data["baseUrl"] = input_data.baseUrl
            if input_data.description is not None:
                updated_data["description"] = input_data.description

            updated_project = ProjectDetail(**updated_data)
            self.demo_projects[project_id] = updated_project
            return updated_project

        changes = {}
        if input_data.name is not None:
            changes["name"] = input_data.name
        if input_data.baseUrl is not None:
            changes["base_url"] = input_data.baseUrl
        if input_data.description is not None:
            changes["description"] = input_data.description

        try:
            client.from_("projects").update(changes).eq("id", project_id).execute()
            return await self.find_by_id(project_id)
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to update project: {str(err)}"
            )

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
            passRate=float(row.get("pass_rate") or 0.0),
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
            passRate=float(row.get("pass_rate") or 0.0),
            lastRun=row.get("last_run"),
            lastRunBy=row.get("last_run_by"),
        )

# Global singleton repository instance
project_repository = ProjectRepository()
