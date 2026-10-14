"""Archive and restore projects, suites, and test cases.

A suite archive also archives member cases that do not belong to another suite.
A project archive archives every suite and test case in that project.
"""

from fastapi import HTTPException

from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.repositories.test_suite_repository import test_suite_repository
from app.schemas.project import ProjectDetail
from app.schemas.test_case import TestCaseSummary
from app.schemas.test_suite import TestSuiteSummary


class ArchiveService:
    def set_project(self, project_id: str, archived: bool) -> ProjectDetail:
        project_repository.find_base(project_id)
        project_repository.set_archived(project_id, archived)
        test_suite_repository.set_project_archived(project_id, archived)
        test_case_repository.set_archived_ids(
            project_id, test_case_repository.list_ids_for_project(project_id), archived
        )
        return project_repository.find_by_id(project_id)

    def set_suite(self, project_id: str, suite_id: str, archived: bool) -> TestSuiteSummary:
        project = project_repository.find_base(project_id)
        if project.archived and not archived:
            raise HTTPException(
                status_code=400,
                detail="Unarchive the project before restoring this suite.",
            )
        test_suite_repository.set_archived(project_id, suite_id, archived)
        exclusive = [
            case_id
            for case_id in test_suite_repository.list_case_ids(project_id, suite_id)
            if not test_suite_repository.other_suite_ids(case_id, suite_id)
        ]
        test_case_repository.set_archived_ids(project_id, exclusive, archived)
        return test_suite_repository.find_by_id(project_id, suite_id)

    def set_case(self, project_id: str, test_case_id: str, archived: bool) -> TestCaseSummary:
        project = project_repository.find_base(project_id)
        if project.archived and not archived:
            raise HTTPException(
                status_code=400,
                detail="Unarchive the project before restoring this test case.",
            )
        test_case_repository.find_by_id(project_id, test_case_id)
        suite_id = test_suite_repository.primary_suite_id(project_id, test_case_id)
        if suite_id and not archived:
            suite = test_suite_repository.find_by_id(project_id, suite_id)
            if suite.archived and not test_suite_repository.other_suite_ids(test_case_id, suite.id):
                raise HTTPException(
                    status_code=400,
                    detail="Unarchive the suite before restoring this test case.",
                )
        test_case_repository.set_archived(project_id, test_case_id, archived)
        return test_case_repository.find_by_id(project_id, test_case_id)


archive_service = ArchiveService()
