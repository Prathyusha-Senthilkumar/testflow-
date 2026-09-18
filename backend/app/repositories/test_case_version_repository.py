from datetime import datetime, timezone
from typing import Dict, List

from fastapi import HTTPException

from app.schemas.test_case_version import TestCaseVersionDetail, TestCaseVersionSummary


def _version_key(project_id: str, test_case_id: str) -> str:
    return f"{project_id}:{test_case_id}"


def _roman_label(version_number: int) -> str:
    numerals = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ]
    n = version_number
    if n <= 0:
        return "Draft"
    parts: List[str] = []
    for value, symbol in numerals:
        while n >= value:
            parts.append(symbol)
            n -= value
    return f"Version {' '.join(parts)}"


class TestCaseVersionRepository:
    def __init__(self):
        self.demo_versions: Dict[str, List[TestCaseVersionDetail]] = {}

    def list_versions(self, project_id: str, test_case_id: str) -> List[TestCaseVersionSummary]:
        items = self.demo_versions.get(_version_key(project_id, test_case_id), [])
        return [
            TestCaseVersionSummary(
                versionNumber=item.versionNumber,
                label=_roman_label(item.versionNumber),
                publishedAt=item.publishedAt,
            )
            for item in items
        ]

    def get_version(self, project_id: str, test_case_id: str, version_number: int) -> TestCaseVersionDetail:
        for item in self.demo_versions.get(_version_key(project_id, test_case_id), []):
            if item.versionNumber == version_number:
                return item
        raise HTTPException(status_code=404, detail="Published version not found")

    def publish(self, project_id: str, test_case_id: str, snapshot: TestCaseVersionDetail) -> TestCaseVersionDetail:
        key = _version_key(project_id, test_case_id)
        versions = self.demo_versions.setdefault(key, [])
        labeled = snapshot.model_copy(
            update={"label": _roman_label(snapshot.versionNumber)}
        )
        versions.append(labeled)
        return labeled


test_case_version_repository = TestCaseVersionRepository()
