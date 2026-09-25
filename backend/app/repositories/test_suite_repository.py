import time
from datetime import datetime, timezone
from typing import Dict, List, Set

from fastapi import HTTPException

from app.database import get_supabase_client
from app.schemas.test_suite import (
    CreateTestSuiteDto,
    TestSuiteSummary,
    UpdateTestSuiteDto,
)


def _membership_key(project_id: str, suite_id: str) -> str:
    return f"{project_id}:{suite_id}"


# Deployed schema: test_cases.suite_id is NOT NULL, so every case must belong to
# exactly one suite. Cases removed from a suite are moved here instead of detached.
UNASSIGNED_SUITE_NAME = "Unassigned"


class TestSuiteRepository:
    def __init__(self):
        self.demo_suites: Dict[str, List[TestSuiteSummary]] = {}
        self.demo_suite_cases: Dict[str, Set[str]] = {}

    @property
    def db(self):
        return get_supabase_client()

    # ---- Supabase helpers -------------------------------------------------
    def _count_cases(self, suite_id: str) -> int:
        res = (
            self.db.from_("test_cases")
            .select("id", count="exact")
            .eq("suite_id", suite_id)
            .execute()
        )
        if getattr(res, "count", None) is not None:
            return int(res.count)
        return len(res.data or [])

    def _ensure_unassigned_suite(self, project_id: str) -> str:
        res = (
            self.db.from_("test_suites")
            .select("id")
            .eq("project_id", project_id)
            .eq("name", UNASSIGNED_SUITE_NAME)
            .limit(1)
            .execute()
        )
        if res.data:
            return str(res.data[0]["id"])
        created = (
            self.db.from_("test_suites")
            .insert({"project_id": project_id, "name": UNASSIGNED_SUITE_NAME})
            .execute()
        )
        if not created.data:
            raise HTTPException(status_code=500, detail="Could not create Unassigned suite")
        return str(created.data[0]["id"])

    def _map_row(self, row: dict) -> TestSuiteSummary:
        return TestSuiteSummary(
            id=str(row.get("id")),
            projectId=str(row.get("project_id")),
            name=str(row.get("name")),
            description=row.get("description"),
            category=row.get("category") or "regression",
            caseCount=self._count_cases(str(row.get("id"))),
            createdAt=row.get("created_at"),
        )

    # ---- CRUD -------------------------------------------------------------
    def list_by_project(self, project_id: str) -> List[TestSuiteSummary]:
        if not self.db:
            suites = list(self.demo_suites.get(project_id, []))
            return [self._with_count(project_id, suite) for suite in suites]

        res = (
            self.db.from_("test_suites")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [self._map_row(row) for row in (res.data or [])]

    def find_by_id(self, project_id: str, suite_id: str) -> TestSuiteSummary:
        if not self.db:
            for suite in self.demo_suites.get(project_id, []):
                if suite.id == suite_id:
                    return self._with_count(project_id, suite)
            raise HTTPException(status_code=404, detail="Test suite not found")

        res = (
            self.db.from_("test_suites")
            .select("*")
            .eq("project_id", project_id)
            .eq("id", suite_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Test suite not found")
        return self._map_row(res.data[0])

    def create(self, project_id: str, input_dto: CreateTestSuiteDto) -> TestSuiteSummary:
        if not self.db:
            new_id = f"suite-{int(time.time() * 1000)}"
            suite = TestSuiteSummary(
                id=new_id,
                projectId=project_id,
                name=input_dto.name.strip(),
                description=input_dto.description,
                category=input_dto.category,
                caseCount=0,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
            self.demo_suites.setdefault(project_id, []).insert(0, suite)
            self.demo_suite_cases[_membership_key(project_id, new_id)] = set()
            return suite

        res = (
            self.db.from_("test_suites")
            .insert(
                {
                    "project_id": project_id,
                    "name": input_dto.name.strip(),
                    "description": input_dto.description,
                    "category": input_dto.category,
                }
            )
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=500, detail="Could not create test suite")
        return self._map_row(res.data[0])

    def update(self, project_id: str, suite_id: str, input_dto: UpdateTestSuiteDto) -> TestSuiteSummary:
        if not self.db:
            suite = self.find_by_id(project_id, suite_id)
            updates: dict = {}
            if input_dto.name is not None:
                updates["name"] = input_dto.name.strip()
            if input_dto.description is not None:
                updates["description"] = input_dto.description.strip() or None
            if input_dto.category is not None:
                updates["category"] = input_dto.category
            updated = suite.model_copy(update=updates)
            self._replace(project_id, suite_id, updated)
            return self._with_count(project_id, updated)

        changes: dict = {}
        if input_dto.name is not None:
            changes["name"] = input_dto.name.strip()
        if input_dto.description is not None:
            changes["description"] = input_dto.description.strip() or None
        if input_dto.category is not None:
            changes["category"] = input_dto.category
        if changes:
            self.db.from_("test_suites").update(changes).eq("project_id", project_id).eq(
                "id", suite_id
            ).execute()
        return self.find_by_id(project_id, suite_id)

    def delete(self, project_id: str, suite_id: str) -> None:
        if not self.db:
            suites = self.demo_suites.get(project_id, [])
            next_suites = [suite for suite in suites if suite.id != suite_id]
            if len(next_suites) == len(suites):
                raise HTTPException(status_code=404, detail="Test suite not found")
            self.demo_suites[project_id] = next_suites
            self.demo_suite_cases.pop(_membership_key(project_id, suite_id), None)
            return

        suite = self.find_by_id(project_id, suite_id)
        # suite_id is NOT NULL: relocate member cases instead of deleting them.
        if suite.caseCount:
            if suite.name == UNASSIGNED_SUITE_NAME:
                raise HTTPException(
                    status_code=400,
                    detail="Move or delete its test cases before deleting the Unassigned suite.",
                )
            fallback_id = self._ensure_unassigned_suite(project_id)
            self.db.from_("test_cases").update({"suite_id": fallback_id}).eq(
                "suite_id", suite_id
            ).execute()
        self.db.from_("test_suites").delete().eq("project_id", project_id).eq(
            "id", suite_id
        ).execute()

    def list_case_ids(self, project_id: str, suite_id: str) -> List[str]:
        if not self.db:
            self.find_by_id(project_id, suite_id)
            return sorted(self.demo_suite_cases.get(_membership_key(project_id, suite_id), set()))

        self.find_by_id(project_id, suite_id)
        res = (
            self.db.from_("test_cases")
            .select("id")
            .eq("suite_id", suite_id)
            .order("created_at")
            .execute()
        )
        return [str(row["id"]) for row in (res.data or [])]

    def add_case_ids(self, project_id: str, suite_id: str, test_case_ids: List[str]) -> int:
        if not self.db:
            self.find_by_id(project_id, suite_id)
            key = _membership_key(project_id, suite_id)
            members = self.demo_suite_cases.setdefault(key, set())
            added = 0
            for test_case_id in test_case_ids:
                if test_case_id not in members:
                    members.add(test_case_id)
                    added += 1
            return added

        self.find_by_id(project_id, suite_id)
        existing = set(self.list_case_ids(project_id, suite_id))
        moving = [tc_id for tc_id in test_case_ids if tc_id not in existing]
        # One-to-many: assigning a case to a suite reassigns its suite_id.
        for tc_id in moving:
            self.db.from_("test_cases").update({"suite_id": suite_id}).eq("id", tc_id).execute()
        return len(moving)

    def remove_case_id(self, project_id: str, suite_id: str, test_case_id: str) -> None:
        if not self.db:
            key = _membership_key(project_id, suite_id)
            members = self.demo_suite_cases.get(key)
            if members is None:
                raise HTTPException(status_code=404, detail="Test suite not found")
            if test_case_id not in members:
                raise HTTPException(status_code=404, detail="Test case is not in this suite")
            members.remove(test_case_id)
            return

        suite = self.find_by_id(project_id, suite_id)
        if test_case_id not in set(self.list_case_ids(project_id, suite_id)):
            raise HTTPException(status_code=404, detail="Test case is not in this suite")
        if suite.name == UNASSIGNED_SUITE_NAME:
            raise HTTPException(
                status_code=400,
                detail="Test cases in the Unassigned suite must be moved to another suite.",
            )
        # suite_id is NOT NULL: move the case to the project's Unassigned suite.
        fallback_id = self._ensure_unassigned_suite(project_id)
        self.db.from_("test_cases").update({"suite_id": fallback_id}).eq(
            "id", test_case_id
        ).execute()

    def _with_count(self, project_id: str, suite: TestSuiteSummary) -> TestSuiteSummary:
        count = len(self.demo_suite_cases.get(_membership_key(project_id, suite.id), set()))
        return suite.model_copy(update={"caseCount": count})

    def _replace(self, project_id: str, suite_id: str, updated: TestSuiteSummary) -> None:
        suites = self.demo_suites.get(project_id, [])
        for index, suite in enumerate(suites):
            if suite.id == suite_id:
                suites[index] = updated
                return
        raise HTTPException(status_code=404, detail="Test suite not found")


test_suite_repository = TestSuiteRepository()
