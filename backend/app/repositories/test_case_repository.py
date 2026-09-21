import re
import time
from typing import Dict, List
from fastapi import HTTPException
from app.database import get_supabase_client
from app.schemas.test_case import TestCaseSummary, CreateTestCaseDto, UpdateTestCaseDto
from app.schemas.test_assertion import AssertionConfig

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from automation.framework.url_resolve import normalize_start_path
from app.schemas.environment import DEFAULT_ENVIRONMENT_ID
from app.schemas.test_classification import (
    DEFAULT_TEST_CASE_CATEGORY,
    DEFAULT_TEST_CASE_SCENARIO,
    TestCaseCategory,
    TestCaseScenario,
)

_CODE_PATTERN = re.compile(r"^TC-(\d+)$", re.IGNORECASE)


class TestCaseRepository:
    def __init__(self):
        self.demo_cases: Dict[str, List[TestCaseSummary]] = {}

    @property
    def db(self):
        return get_supabase_client()

    def list_by_project(self, project_id: str) -> List[TestCaseSummary]:
        if not self.db:
            return list(self.demo_cases.get(project_id, []))

        res = (
            self.db.from_("test_cases")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        )
        if hasattr(res, "error") and res.error:
            raise Exception(res.error)
        return [self._map_row(row) for row in (res.data or [])]

    def find_by_id(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        if not self.db:
            for case in self.demo_cases.get(project_id, []):
                if case.id == test_case_id:
                    return case
            raise HTTPException(status_code=404, detail="Test case not found")

        res = (
            self.db.from_("test_cases")
            .select("*")
            .eq("project_id", project_id)
            .eq("id", test_case_id)
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Test case not found")
        return self._map_row(res.data[0])

    def create(self, project_id: str, input_dto: CreateTestCaseDto) -> TestCaseSummary:
        desc = (
            input_dto.description.strip()
            if input_dto.description and input_dto.description.strip()
            else None
        )
        code = self._next_code(project_id)

        if not self.db:
            new_id = f"demo-case-{int(time.time() * 1000)}"
            case = TestCaseSummary(
                id=new_id,
                code=code,
                name=input_dto.name,
                description=desc,
                category=input_dto.category,
                scenario=input_dto.scenario,
                automationStatus="Not Configured",
                testFile=None,
                startPath="/",
                environmentId=DEFAULT_ENVIRONMENT_ID,
                authProfileId=None,
                expectedResult=None,
                isDraft=True,
                publishedVersion=0,
                assertions=[],
            )
            self.demo_cases.setdefault(project_id, []).insert(0, case)
            return case

        res = (
            self.db.from_("test_cases")
            .insert(
                {
                    "project_id": project_id,
                    "code": code,
                    "name": input_dto.name,
                    "description": desc,
                    "automation_status": "Not Configured",
                }
            )
            .select("*")
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise Exception("Could not create test case")
        return self._map_row(res.data[0])

    def update_automation(
        self,
        project_id: str,
        test_case_id: str,
        test_file: str,
        automation_status: str,
    ) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    updated = case.model_copy(
                        update={
                            "testFile": test_file,
                            "automationStatus": automation_status,
                        }
                    )
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")

        res = (
            self.db.from_("test_cases")
            .update(
                {
                    "test_file": test_file,
                    "automation_status": automation_status,
                }
            )
            .eq("project_id", project_id)
            .eq("id", test_case_id)
            .select("*")
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Test case not found")
        return self._map_row(res.data[0])

    def update(self, project_id: str, test_case_id: str, input_dto: UpdateTestCaseDto) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    updates: dict = {}
                    if input_dto.startPath is not None:
                        updates["startPath"] = normalize_start_path(input_dto.startPath)
                    if input_dto.expectedResult is not None:
                        trimmed = input_dto.expectedResult.strip()
                        updates["expectedResult"] = trimmed or None
                        updates["assertions"] = []
                    elif input_dto.assertions is not None:
                        if input_dto.assertions:
                            updates["expectedResult"] = input_dto.assertions[0].value.strip()
                        else:
                            updates["expectedResult"] = None
                        updates["assertions"] = []
                    if input_dto.category is not None:
                        updates["category"] = input_dto.category
                    if input_dto.scenario is not None:
                        updates["scenario"] = input_dto.scenario
                    if input_dto.environmentId is not None:
                        updates["environmentId"] = input_dto.environmentId
                    if "authProfileId" in input_dto.model_fields_set:
                        profile_id = (input_dto.authProfileId or "").strip() or None
                        updates["authProfileId"] = profile_id
                    updated = case.model_copy(update=updates)
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")

        raise HTTPException(status_code=501, detail="Test case updates require demo mode in Phase 1")

    def clear_auth_profile_refs(self, project_id: str, profile_id: str) -> None:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.authProfileId == profile_id:
                    cases[index] = case.model_copy(update={"authProfileId": None})
            return

    def apply_publish_state(self, project_id: str, test_case_id: str, version_number: int) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    updated = case.model_copy(update={"isDraft": False, "publishedVersion": version_number})
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")
        raise HTTPException(status_code=501, detail="Test case updates require demo mode in Phase 1")

    def mark_draft(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    if case.publishedVersion <= 0:
                        updated = case.model_copy(update={"isDraft": True})
                    else:
                        updated = case.model_copy(update={"isDraft": True})
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")
        raise HTTPException(status_code=501, detail="Test case updates require demo mode in Phase 1")

    def _next_code(self, project_id: str) -> str:
        existing = self.list_by_project(project_id)
        max_num = 0
        for case in existing:
            match = _CODE_PATTERN.match(case.code.strip())
            if match:
                max_num = max(max_num, int(match.group(1)))
        return f"TC-{max_num + 1:03d}"

    def _map_row(self, row: dict) -> TestCaseSummary:
        raw_assertions = row.get("assertions") or []
        assertions = [AssertionConfig(**item) for item in raw_assertions] if raw_assertions else []
        expected_result = row.get("expected_result") or row.get("expectedResult")
        if not expected_result and assertions:
            expected_result = assertions[0].value
        return TestCaseSummary(
            id=str(row.get("id")),
            code=str(row.get("code")),
            name=str(row.get("name")),
            description=row.get("description"),
            category=_coerce_category(row.get("category")),
            scenario=_coerce_scenario(row.get("scenario")),
            automationStatus=str(row.get("automation_status") or "Not Configured"),
            testFile=row.get("test_file"),
            startPath=str(row.get("start_path") or "/"),
            environmentId=row.get("environment_id") or DEFAULT_ENVIRONMENT_ID,
            authProfileId=row.get("auth_profile_id") or row.get("authProfileId"),
            expectedResult=expected_result,
            isDraft=bool(row.get("is_draft", True)),
            publishedVersion=int(row.get("published_version") or 0),
            assertions=[],
        )


def _coerce_category(value) -> TestCaseCategory:
    if value in ("Functional", "Responsive"):
        return value
    return DEFAULT_TEST_CASE_CATEGORY


def _coerce_scenario(value) -> TestCaseScenario:
    if value in ("Happy Path", "Negative", "Edge Case"):
        return value
    return DEFAULT_TEST_CASE_SCENARIO


test_case_repository = TestCaseRepository()
