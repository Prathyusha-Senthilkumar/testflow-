from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException

from app.repositories.project_repository import ProjectRepository
from app.repositories.test_case_repository import TestCaseRepository
from app.repositories.test_case_version_repository import test_case_version_repository
from app.repositories.environment_repository import environment_repository
from app.repositories.auth_profile_repository import auth_profile_repository
from app.schemas.test_case import (
    CreateTestCaseDto,
    StorageEntry,
    TestCaseSummary,
    UpdateTestCaseDto,
)
from app.schemas.test_case_version import TestCaseVersionDetail, TestCaseVersionSummary
from app.schemas.test_run import TestRunResult
from app.schemas.test_script import TestScriptDto, TestScriptResponse
from app.services.automation_service import (
    _REPO_ROOT,
    read_test_script,
    record_test_case,
    relative_script_path,
    run_test_case_script,
    write_test_script,
)
from app.services.environments_service import EnvironmentsService
from app.services.auth_profiles_service import AuthProfilesService

if str(_REPO_ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(_REPO_ROOT))

from automation.framework.testflow_meta import read_meta, write_meta
from automation.framework.url_resolve import normalize_start_path


class TestCasesService:
    def __init__(
        self,
        test_case_repository: TestCaseRepository,
        project_repository: ProjectRepository,
    ):
        self.test_cases = test_case_repository
        self.projects = project_repository
        self.environments = EnvironmentsService(environment_repository, project_repository)
        self.auth_profiles = AuthProfilesService(
            auth_profile_repository, project_repository, test_case_repository
        )
        self.versions = test_case_version_repository

    def list_for_project(self, project_id: str) -> List[TestCaseSummary]:
        self._ensure_project_exists(project_id)
        cases = self.test_cases.list_by_project(project_id)
        return [self._attach_resolved_url(project_id, case) for case in cases]

    def get(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        self._ensure_project_exists(project_id)
        test_case = self.test_cases.find_by_id(project_id, test_case_id)
        test_case = self._ensure_recorded_script_linked(project_id, test_case_id, test_case)
        test_case = self._attach_resolved_url(project_id, test_case)
        return self._with_meta_config(project_id, test_case_id, test_case)

    def create(self, project_id: str, input_dto: CreateTestCaseDto) -> TestCaseSummary:
        self._ensure_project_exists(project_id)
        normalized = self._validate_and_normalize(input_dto)
        created = self.test_cases.create(project_id, normalized)
        return self._attach_resolved_url(project_id, created)

    def update(self, project_id: str, test_case_id: str, input_dto: UpdateTestCaseDto) -> TestCaseSummary:
        self._ensure_project_exists(project_id)
        existing = self.test_cases.find_by_id(project_id, test_case_id)
        if input_dto.startPath is not None:
            input_dto = input_dto.model_copy(
                update={"startPath": normalize_start_path(input_dto.startPath)}
            )
        if "authProfileId" in input_dto.model_fields_set:
            profile_id = (input_dto.authProfileId or "").strip() or None
            if profile_id:
                self.auth_profiles.get(project_id, profile_id)
            input_dto = input_dto.model_copy(update={"authProfileId": profile_id})
        updated = self.test_cases.update(project_id, test_case_id, input_dto)
        if existing.publishedVersion > 0:
            updated = self.test_cases.mark_draft(project_id, test_case_id)
        updated = self._attach_resolved_url(project_id, updated)
        fields_set = input_dto.model_fields_set
        updated = self._with_meta_config(
            project_id,
            test_case_id,
            updated,
            seeds=input_dto.storageSeeds if "storageSeeds" in fields_set else None,
            assertions=(
                input_dto.storageAssertions if "storageAssertions" in fields_set else None
            ),
            accessibility_enabled=(
                input_dto.accessibilityEnabled if "accessibilityEnabled" in fields_set else None
            ),
            network_check_enabled=(
                input_dto.networkCheckEnabled if "networkCheckEnabled" in fields_set else None
            ),
        )
        self._sync_testflow_meta(project_id, test_case_id, updated)
        return updated

    def get_script(self, project_id: str, test_case_id: str) -> TestScriptResponse:
        test_case = self.get(project_id, test_case_id)
        test_case = self._ensure_recorded_script_linked(project_id, test_case_id, test_case)
        if not test_case.testFile:
            return TestScriptResponse(content="", testFile="")
        script_path = test_case.testFile.replace("\\", "/")
        content = read_test_script(script_path)
        return TestScriptResponse(content=content, testFile=script_path)

    def save_script(self, project_id: str, test_case_id: str, input_dto: TestScriptDto) -> TestCaseSummary:
        self._ensure_project_exists(project_id)
        test_case = self.test_cases.find_by_id(project_id, test_case_id)
        test_case = self._ensure_recorded_script_linked(project_id, test_case_id, test_case)
        if not test_case.testFile:
            raise HTTPException(status_code=400, detail="No script path on test case. Record a test first.")
        script_path = test_case.testFile.replace("\\", "/")
        write_test_script(script_path, input_dto.content)
        updated = self.test_cases.update_automation(
            project_id, test_case_id, script_path, "Automated"
        )
        if updated.publishedVersion > 0:
            updated = self.test_cases.mark_draft(project_id, test_case_id)
        updated = self._attach_resolved_url(project_id, updated)
        updated = self._with_meta_config(project_id, test_case_id, updated)
        self._sync_testflow_meta(project_id, test_case_id, updated)
        return updated

    def publish(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        test_case = self.get(project_id, test_case_id)
        version_number = test_case.publishedVersion + 1
        relative = test_case.testFile or relative_script_path(project_id, test_case_id)
        script_snapshot = read_test_script(relative) if test_case.testFile else None
        snapshot = TestCaseVersionDetail(
            versionNumber=version_number,
            label=f"Version {version_number}",
            publishedAt=datetime.now(timezone.utc).isoformat(),
            name=test_case.name,
            description=test_case.description,
            category=test_case.category,
            scenario=test_case.scenario,
            environmentId=test_case.environmentId,
            authProfileId=test_case.authProfileId,
            startPath=test_case.startPath,
            expectedResult=test_case.expectedResult,
            testFile=test_case.testFile,
            scriptSnapshot=script_snapshot or None,
        )
        self.versions.publish(project_id, test_case_id, snapshot)
        updated = self.test_cases.apply_publish_state(project_id, test_case_id, version_number)
        updated = self._attach_resolved_url(project_id, updated)
        return updated

    def list_versions(self, project_id: str, test_case_id: str) -> List[TestCaseVersionSummary]:
        self._ensure_project_exists(project_id)
        self.test_cases.find_by_id(project_id, test_case_id)
        return self.versions.list_versions(project_id, test_case_id)

    def get_version(self, project_id: str, test_case_id: str, version_number: int) -> TestCaseVersionDetail:
        self._ensure_project_exists(project_id)
        self.test_cases.find_by_id(project_id, test_case_id)
        return self.versions.get_version(project_id, test_case_id, version_number)

    def record(self, project_id: str, test_case_id: str) -> TestCaseSummary:
        self._ensure_project_exists(project_id)
        test_case = self.test_cases.find_by_id(project_id, test_case_id)
        resolved = self.environments.resolve_start_url(
            project_id, test_case.startPath, test_case.environmentId
        )
        if not resolved:
            raise HTTPException(status_code=400, detail="A valid environment base URL is required for recording")

        load_storage = None
        if test_case.authProfileId:
            load_storage = self.auth_profiles.require_storage_path(project_id, test_case.authProfileId)

        relative_script = record_test_case(
            title=test_case.name,
            start_url=resolved,
            project_id=project_id,
            test_case_id=test_case_id,
            load_storage=load_storage,
        )
        updated = self.test_cases.update_automation(
            project_id,
            test_case_id,
            relative_script,
            "Automated",
        )
        if updated.publishedVersion > 0:
            updated = self.test_cases.mark_draft(project_id, test_case_id)
        updated = self._attach_resolved_url(project_id, updated)
        updated = self._with_meta_config(project_id, test_case_id, updated)
        self._sync_testflow_meta(project_id, test_case_id, updated)
        return updated

    def run(self, project_id: str, test_case_id: str) -> TestRunResult:
        self._ensure_project_exists(project_id)
        test_case = self.test_cases.find_by_id(project_id, test_case_id)
        test_case = self._ensure_recorded_script_linked(project_id, test_case_id, test_case)
        if not test_case.testFile:
            raise HTTPException(
                status_code=400,
                detail="No recorded script exists for this test case. Record a test first.",
            )

        test_case = self._attach_resolved_url(project_id, test_case)
        test_case = self._with_meta_config(project_id, test_case_id, test_case)
        self._sync_testflow_meta(project_id, test_case_id, test_case)

        storage_state_path = None
        if test_case.authProfileId:
            storage_state_path = self.auth_profiles.require_storage_path(
                project_id, test_case.authProfileId
            )

        try:
            status, duration, error = run_test_case_script(
                test_case.testFile, storage_state_path=storage_state_path
            )
        except HTTPException:
            raise
        except Exception as exc:
            return TestRunResult(status="Failed", duration=0.0, error=str(exc))
        return TestRunResult(status=status, duration=round(duration, 2), error=error)

    def _ensure_recorded_script_linked(
        self, project_id: str, test_case_id: str, test_case: TestCaseSummary
    ) -> TestCaseSummary:
        rel = relative_script_path(project_id, test_case_id)
        script_path = (_REPO_ROOT / rel).resolve()
        canonical_ready = script_path.is_file() and script_path.stat().st_size > 0

        if test_case.testFile:
            stored_path = (_REPO_ROOT / test_case.testFile.replace("\\", "/")).resolve()
            if stored_path.is_file() and stored_path.stat().st_size > 0:
                return test_case
            if canonical_ready:
                return self.test_cases.update_automation(
                    project_id, test_case_id, rel.replace("\\", "/"), "Automated"
                )
            # The stored script is gone from disk. Keep the path (so it can be
            # restored via Record Test or Save Script) but stop reporting the
            # case as Automated, which would wrongly enable Run Test.
            return test_case.model_copy(update={"automationStatus": "Not Configured"})

        if canonical_ready:
            return self.test_cases.update_automation(
                project_id, test_case_id, rel.replace("\\", "/"), "Automated"
            )
        return test_case

    def _sync_test_file_pointer(
        self,
        project_id: str,
        test_case_id: str,
        test_case: TestCaseSummary,
        relative: str,
    ) -> TestCaseSummary:
        normalized = relative.replace("\\", "/")
        if test_case.testFile != normalized:
            script_path = (_REPO_ROOT / normalized).resolve()
            if script_path.is_file() and script_path.stat().st_size > 0:
                return self.test_cases.update_automation(
                    project_id, test_case_id, normalized, test_case.automationStatus or "Automated"
                )
        return test_case

    # ---- Storage / cookie configuration (persisted in testflow.meta.json) ----
    @staticmethod
    def _parse_storage_entries(raw) -> List[StorageEntry]:
        entries: List[StorageEntry] = []
        for item in raw or []:
            if not isinstance(item, dict):
                continue
            try:
                entries.append(StorageEntry(**item))
            except Exception:
                continue
        return entries

    def _with_meta_config(
        self,
        project_id: str,
        test_case_id: str,
        test_case: TestCaseSummary,
        seeds: Optional[List[StorageEntry]] = None,
        assertions: Optional[List[StorageEntry]] = None,
        accessibility_enabled: Optional[bool] = None,
        network_check_enabled: Optional[bool] = None,
    ) -> TestCaseSummary:
        """Use explicitly supplied values, otherwise keep what is already stored."""
        if (
            seeds is None
            or assertions is None
            or accessibility_enabled is None
            or network_check_enabled is None
        ):
            relative = test_case.testFile or relative_script_path(project_id, test_case_id)
            meta = read_meta(_REPO_ROOT, relative)
            if seeds is None:
                seeds = self._parse_storage_entries(meta.get("storageSeeds"))
            if assertions is None:
                assertions = self._parse_storage_entries(meta.get("storageAssertions"))
            if accessibility_enabled is None:
                accessibility_enabled = bool(meta.get("accessibilityEnabled"))
            if network_check_enabled is None:
                network_check_enabled = bool(meta.get("networkCheckEnabled"))
        return test_case.model_copy(
            update={
                "storageSeeds": seeds,
                "storageAssertions": assertions,
                "accessibilityEnabled": bool(accessibility_enabled),
                "networkCheckEnabled": bool(network_check_enabled),
            }
        )

    def _attach_resolved_url(self, project_id: str, test_case: TestCaseSummary) -> TestCaseSummary:
        try:
            resolved = self.environments.resolve_start_url(
                project_id, test_case.startPath, test_case.environmentId
            )
        except (ValueError, HTTPException):
            resolved = None
        return test_case.model_copy(update={"resolvedStartUrl": resolved})

    def _sync_testflow_meta(self, project_id: str, test_case_id: str, test_case: TestCaseSummary) -> None:
        relative = test_case.testFile or relative_script_path(project_id, test_case_id)
        assertions_payload = []
        if test_case.expectedResult:
            assertions_payload = [
                {"id": "expected-result", "type": "text_visible", "value": test_case.expectedResult}
            ]
        write_meta(
            _REPO_ROOT,
            relative,
            test_case.startPath,
            test_case.resolvedStartUrl or "",
            assertions_payload,
            test_case.environmentId,
            test_case.expectedResult,
            test_case.authProfileId,
            [entry.model_dump() for entry in test_case.storageSeeds],
            [entry.model_dump() for entry in test_case.storageAssertions],
            test_case.accessibilityEnabled,
            test_case.networkCheckEnabled,
        )

    def _ensure_project_exists(self, project_id: str):
        return self.projects.find_by_id(project_id)

    def _validate_and_normalize(self, input_dto: CreateTestCaseDto) -> CreateTestCaseDto:
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Test case name is required")
        desc = input_dto.description.strip() if input_dto.description else None
        return CreateTestCaseDto(
            name=name,
            description=desc if desc else None,
            category=input_dto.category,
            scenario=input_dto.scenario,
        )
