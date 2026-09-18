from typing import List

from fastapi import HTTPException

from app.repositories.project_repository import ProjectRepository
from app.repositories.test_case_repository import TestCaseRepository
from app.repositories.test_suite_repository import TestSuiteRepository
from app.schemas.test_suite import (
    AddTestCasesToSuiteDto,
    CreateTestSuiteDto,
    TestSuiteDetail,
    TestSuiteSummary,
    UpdateTestSuiteDto,
)


class TestSuitesService:
    def __init__(
        self,
        suite_repository: TestSuiteRepository,
        test_case_repository: TestCaseRepository,
        project_repository: ProjectRepository,
    ):
        self.suites = suite_repository
        self.test_cases = test_case_repository
        self.projects = project_repository

    def list_for_project(self, project_id: str) -> List[TestSuiteSummary]:
        self.projects.find_by_id(project_id)
        return self.suites.list_by_project(project_id)

    def get(self, project_id: str, suite_id: str) -> TestSuiteDetail:
        self.projects.find_by_id(project_id)
        suite = self.suites.find_by_id(project_id, suite_id)
        case_ids = self.suites.list_case_ids(project_id, suite_id)
        test_cases = []
        for case_id in case_ids:
            test_cases.append(self.test_cases.find_by_id(project_id, case_id))
        return TestSuiteDetail(
            id=suite.id,
            projectId=suite.projectId,
            name=suite.name,
            description=suite.description,
            caseCount=suite.caseCount,
            createdAt=suite.createdAt,
            testCases=test_cases,
        )

    def create(self, project_id: str, input_dto: CreateTestSuiteDto) -> TestSuiteSummary:
        self.projects.find_by_id(project_id)
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Suite name is required")
        desc = input_dto.description.strip() if input_dto.description and input_dto.description.strip() else None
        return self.suites.create(project_id, CreateTestSuiteDto(name=name, description=desc))

    def update(self, project_id: str, suite_id: str, input_dto: UpdateTestSuiteDto) -> TestSuiteSummary:
        self.projects.find_by_id(project_id)
        if input_dto.name is not None and not input_dto.name.strip():
            raise HTTPException(status_code=400, detail="Suite name is required")
        return self.suites.update(project_id, suite_id, input_dto)

    def delete(self, project_id: str, suite_id: str) -> None:
        self.projects.find_by_id(project_id)
        self.suites.delete(project_id, suite_id)

    def add_test_cases(self, project_id: str, suite_id: str, input_dto: AddTestCasesToSuiteDto) -> TestSuiteDetail:
        self.projects.find_by_id(project_id)
        self.suites.find_by_id(project_id, suite_id)
        if not input_dto.testCaseIds:
            raise HTTPException(status_code=400, detail="At least one test case id is required")

        validated_ids: List[str] = []
        for test_case_id in input_dto.testCaseIds:
            case = self.test_cases.find_by_id(project_id, test_case_id)
            validated_ids.append(case.id)

        self.suites.add_case_ids(project_id, suite_id, validated_ids)
        return self.get(project_id, suite_id)

    def remove_test_case(self, project_id: str, suite_id: str, test_case_id: str) -> TestSuiteDetail:
        self.projects.find_by_id(project_id)
        self.suites.remove_case_id(project_id, suite_id, test_case_id)
        return self.get(project_id, suite_id)
