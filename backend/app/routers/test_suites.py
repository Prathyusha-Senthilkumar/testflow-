from typing import List

from fastapi import APIRouter, Depends, Response

from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.repositories.test_suite_repository import test_suite_repository
from app.schemas.test_suite import (
    AddTestCasesToSuiteDto,
    CreateTestSuiteDto,
    TestSuiteDetail,
    TestSuiteSummary,
    UpdateTestSuiteDto,
)
from app.services.test_suites_service import TestSuitesService

router = APIRouter(prefix="/projects/{project_id}/test-suites", tags=["test-suites"])

_service = TestSuitesService(test_suite_repository, test_case_repository, project_repository)


def get_test_suites_service() -> TestSuitesService:
    return _service


@router.get("", response_model=List[TestSuiteSummary])
@router.get("/", response_model=List[TestSuiteSummary], include_in_schema=False)
def list_test_suites(
    project_id: str,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.list_for_project(project_id)


@router.post("", response_model=TestSuiteSummary)
@router.post("/", response_model=TestSuiteSummary, include_in_schema=False)
def create_test_suite(
    project_id: str,
    input_dto: CreateTestSuiteDto,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.create(project_id, input_dto)


@router.get("/{suite_id}", response_model=TestSuiteDetail)
def get_test_suite(
    project_id: str,
    suite_id: str,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.get(project_id, suite_id)


@router.patch("/{suite_id}", response_model=TestSuiteSummary)
def update_test_suite(
    project_id: str,
    suite_id: str,
    input_dto: UpdateTestSuiteDto,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.update(project_id, suite_id, input_dto)


@router.delete("/{suite_id}", status_code=204)
def delete_test_suite(
    project_id: str,
    suite_id: str,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    service.delete(project_id, suite_id)
    return Response(status_code=204)


@router.post("/{suite_id}/test-cases", response_model=TestSuiteDetail)
def add_test_cases_to_suite(
    project_id: str,
    suite_id: str,
    input_dto: AddTestCasesToSuiteDto,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.add_test_cases(project_id, suite_id, input_dto)


@router.delete("/{suite_id}/test-cases/{test_case_id}", response_model=TestSuiteDetail)
def remove_test_case_from_suite(
    project_id: str,
    suite_id: str,
    test_case_id: str,
    service: TestSuitesService = Depends(get_test_suites_service),
):
    return service.remove_test_case(project_id, suite_id, test_case_id)
