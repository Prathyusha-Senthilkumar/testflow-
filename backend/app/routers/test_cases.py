from typing import List

from fastapi import APIRouter, Depends

from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.services.test_cases_service import TestCasesService
from app.schemas.test_case import TestCaseSummary, CreateTestCaseDto, UpdateTestCaseDto
from app.schemas.test_case_version import TestCaseVersionDetail, TestCaseVersionSummary
from app.schemas.test_run import TestRunResult
from app.schemas.test_script import TestScriptDto, TestScriptResponse

router = APIRouter(prefix="/projects/{project_id}/test-cases", tags=["test-cases"])

_project_repository = project_repository
_service = TestCasesService(test_case_repository, _project_repository)


def get_test_cases_service() -> TestCasesService:
    return _service


@router.get("", response_model=List[TestCaseSummary])
@router.get("/", response_model=List[TestCaseSummary], include_in_schema=False)
def list_test_cases(
    project_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.list_for_project(project_id)


@router.get("/{test_case_id}", response_model=TestCaseSummary)
def get_test_case(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.get(project_id, test_case_id)


@router.post("", response_model=TestCaseSummary)
@router.post("/", response_model=TestCaseSummary, include_in_schema=False)
def create_test_case(
    project_id: str,
    input_dto: CreateTestCaseDto,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.create(project_id, input_dto)


@router.patch("/{test_case_id}", response_model=TestCaseSummary)
def update_test_case(
    project_id: str,
    test_case_id: str,
    input_dto: UpdateTestCaseDto,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.update(project_id, test_case_id, input_dto)


@router.get("/{test_case_id}/script", response_model=TestScriptResponse)
def get_test_script(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.get_script(project_id, test_case_id)


@router.put("/{test_case_id}/script", response_model=TestCaseSummary)
def save_test_script(
    project_id: str,
    test_case_id: str,
    input_dto: TestScriptDto,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.save_script(project_id, test_case_id, input_dto)


@router.post("/{test_case_id}/publish", response_model=TestCaseSummary)
def publish_test_case(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.publish(project_id, test_case_id)


@router.get("/{test_case_id}/versions", response_model=List[TestCaseVersionSummary])
def list_test_case_versions(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.list_versions(project_id, test_case_id)


@router.get("/{test_case_id}/versions/{version_number}", response_model=TestCaseVersionDetail)
def get_test_case_version(
    project_id: str,
    test_case_id: str,
    version_number: int,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.get_version(project_id, test_case_id, version_number)


@router.post("/{test_case_id}/record", response_model=TestCaseSummary)
def record_test_case(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.record(project_id, test_case_id)


@router.post("/{test_case_id}/run", response_model=TestRunResult)
def run_test_case(
    project_id: str,
    test_case_id: str,
    service: TestCasesService = Depends(get_test_cases_service),
):
    return service.run(project_id, test_case_id)
