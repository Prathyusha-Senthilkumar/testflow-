import json
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

    # ---- Deployed-schema helpers -----------------------------------------
    # Real schema: project -> test_suites(project_id) -> test_cases(suite_id).
    # There is no test_cases.project_id and no test_suite_cases table.
    def _suite_ids_for_project(self, project_id: str) -> List[str]:
        res = (
            self.db.from_("test_suites")
            .select("id")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        )
        return [str(row["id"]) for row in (res.data or [])]

    def _suite_id_for_create(self, project_id: str, suite_id: str | None) -> str:
        requested = (suite_id or "").strip()
        if not requested:
            return self._default_suite_id(project_id)
        from app.repositories.test_suite_repository import test_suite_repository

        test_suite_repository.find_by_id(project_id, requested)
        return requested

    def _default_suite_id(self, project_id: str) -> str:
        """suite_id is NOT NULL, so new cases need a suite. Reuse the first one."""
        suite_ids = self._suite_ids_for_project(project_id)
        if suite_ids:
            return suite_ids[0]
        from app.repositories.test_suite_repository import test_suite_repository

        return test_suite_repository._ensure_unassigned_suite(project_id)

    def list_by_project(self, project_id: str) -> List[TestCaseSummary]:
        if not self.db:
            return list(self.demo_cases.get(project_id, []))

        suite_ids = self._suite_ids_for_project(project_id)
        if not suite_ids:
            return []
        res = (
            self.db.from_("test_cases")
            .select("*")
            .in_("suite_id", suite_ids)
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
            .eq("id", test_case_id)
            .execute()
        )
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Test case not found")
        row = res.data[0]
        if str(row.get("suite_id")) not in set(self._suite_ids_for_project(project_id)):
            raise HTTPException(status_code=404, detail="Test case not found")
        return self._map_row(row)

    def create(self, project_id: str, input_dto: CreateTestCaseDto) -> TestCaseSummary:
        desc = (
            input_dto.description.strip()
            if input_dto.description and input_dto.description.strip()
            else None
        )
        code = self._next_code(project_id)
        suite_id = self._suite_id_for_create(project_id, input_dto.suiteId)

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

        # Deployed schema: no project_id / automation_status / code columns.
        # suite_id and test_file are NOT NULL.
        res = (
            self.db.from_("test_cases")
            .insert(
                {
                    "suite_id": suite_id,
                    "test_case_code": code,
                    "name": input_dto.name,
                    "description": desc,
                    "category": input_dto.category,
                    "scenario": input_dto.scenario,
                    "start_path": "/",
                    "expected_result": None,
                    "test_file": "",
                    "is_draft": True,
                    "published_version": 0,
                }
            )
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

        # automation_status has no column in the deployed schema; it is derived
        # from test_file in _map_row.
        self.find_by_id(project_id, test_case_id)
        self.db.from_("test_cases").update({"test_file": test_file}).eq(
            "id", test_case_id
        ).execute()
        return self.find_by_id(project_id, test_case_id)

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

        changes: dict = {}
        if input_dto.startPath is not None:
            changes["start_path"] = normalize_start_path(input_dto.startPath)
        if input_dto.expectedResult is not None:
            trimmed = input_dto.expectedResult.strip()
            changes["expected_result"] = trimmed or None
        elif input_dto.assertions is not None:
            changes["expected_result"] = (
                input_dto.assertions[0].value.strip() if input_dto.assertions else None
            )
        if input_dto.category is not None:
            changes["category"] = input_dto.category
        if input_dto.scenario is not None:
            changes["scenario"] = input_dto.scenario
        if input_dto.environmentId is not None:
            changes["environment_id"] = self._normalize_environment_id(input_dto.environmentId)
        if changes:
            self.find_by_id(project_id, test_case_id)
            self.db.from_("test_cases").update(changes).eq("id", test_case_id).execute()
        return self.find_by_id(project_id, test_case_id)

    def clear_auth_profile_refs(self, project_id: str, profile_id: str) -> None:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.authProfileId == profile_id:
                    cases[index] = case.model_copy(update={"authProfileId": None})
        # Auth Profile selection is stored in each case's testflow.meta.json
        # because the deployed test_cases table has no auth_profile_id column.
        generated = _REPO_ROOT / "automation" / "generated" / project_id
        if not generated.is_dir():
            return
        for meta_path in generated.glob("*/testflow.meta.json"):
            try:
                payload = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if not isinstance(payload, dict) or payload.get("authProfileId") != profile_id:
                continue
            payload["authProfileId"] = None
            meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def apply_publish_state(self, project_id: str, test_case_id: str, version_number: int) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    updated = case.model_copy(update={"isDraft": False, "publishedVersion": version_number})
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")

        self.db.from_("test_cases").update(
            {"is_draft": False, "published_version": version_number}
        ).eq("id", test_case_id).execute()
        return self.find_by_id(project_id, test_case_id)

    def mark_draft(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        if not self.db:
            cases = self.demo_cases.get(project_id, [])
            for index, case in enumerate(cases):
                if case.id == test_case_id:
                    updated = case.model_copy(update={"isDraft": True})
                    cases[index] = updated
                    return updated
            raise HTTPException(status_code=404, detail="Test case not found")

        self.db.from_("test_cases").update({"is_draft": True}).eq(
            "id", test_case_id
        ).execute()
        return self.find_by_id(project_id, test_case_id)

    @staticmethod
    def _normalize_environment_id(environment_id: str | None) -> str | None:
        # The sentinel "env-default" means "project default"; store NULL in Supabase.
        if not environment_id or environment_id == DEFAULT_ENVIRONMENT_ID:
            return None
        return environment_id

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
        # Deployed schema stores the code as test_case_code and has no
        # automation_status column, so status is derived from test_file.
        test_file = (row.get("test_file") or "").strip() or None
        automation_status = row.get("automation_status") or (
            "Automated" if test_file else "Not Configured"
        )
        return TestCaseSummary(
            id=str(row.get("id")),
            code=str(row.get("test_case_code") or row.get("code") or ""),
            name=str(row.get("name")),
            description=row.get("description"),
            category=_coerce_category(row.get("category")),
            scenario=_coerce_scenario(row.get("scenario")),
            automationStatus=str(automation_status),
            testFile=test_file,
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
