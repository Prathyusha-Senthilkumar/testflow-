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


class TestSuiteRepository:
    def __init__(self):
        self.demo_suites: Dict[str, List[TestSuiteSummary]] = {}
        self.demo_suite_cases: Dict[str, Set[str]] = {}

    @property
    def db(self):
        return get_supabase_client()

    def list_by_project(self, project_id: str) -> List[TestSuiteSummary]:
        if not self.db:
            suites = list(self.demo_suites.get(project_id, []))
            return [self._with_count(project_id, suite) for suite in suites]

        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

    def find_by_id(self, project_id: str, suite_id: str) -> TestSuiteSummary:
        if not self.db:
            for suite in self.demo_suites.get(project_id, []):
                if suite.id == suite_id:
                    return self._with_count(project_id, suite)
            raise HTTPException(status_code=404, detail="Test suite not found")
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

    def create(self, project_id: str, input_dto: CreateTestSuiteDto) -> TestSuiteSummary:
        if not self.db:
            new_id = f"suite-{int(time.time() * 1000)}"
            suite = TestSuiteSummary(
                id=new_id,
                projectId=project_id,
                name=input_dto.name.strip(),
                description=input_dto.description,
                caseCount=0,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
            self.demo_suites.setdefault(project_id, []).insert(0, suite)
            self.demo_suite_cases[_membership_key(project_id, new_id)] = set()
            return suite
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

    def update(self, project_id: str, suite_id: str, input_dto: UpdateTestSuiteDto) -> TestSuiteSummary:
        if not self.db:
            suite = self.find_by_id(project_id, suite_id)
            updates: dict = {}
            if input_dto.name is not None:
                updates["name"] = input_dto.name.strip()
            if input_dto.description is not None:
                updates["description"] = input_dto.description.strip() or None
            updated = suite.model_copy(update=updates)
            self._replace(project_id, suite_id, updated)
            return self._with_count(project_id, updated)
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

    def delete(self, project_id: str, suite_id: str) -> None:
        if not self.db:
            suites = self.demo_suites.get(project_id, [])
            next_suites = [suite for suite in suites if suite.id != suite_id]
            if len(next_suites) == len(suites):
                raise HTTPException(status_code=404, detail="Test suite not found")
            self.demo_suites[project_id] = next_suites
            self.demo_suite_cases.pop(_membership_key(project_id, suite_id), None)
            return
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

    def list_case_ids(self, project_id: str, suite_id: str) -> List[str]:
        if not self.db:
            self.find_by_id(project_id, suite_id)
            return sorted(self.demo_suite_cases.get(_membership_key(project_id, suite_id), set()))
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

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
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

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
        raise HTTPException(status_code=501, detail="Test suites require demo mode in Phase 1")

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
