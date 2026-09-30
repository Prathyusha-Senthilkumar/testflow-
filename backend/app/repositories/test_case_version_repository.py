from typing import Dict, List

from fastapi import HTTPException

from app.database import get_supabase_client
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

    @property
    def db(self):
        return get_supabase_client()

    def list_versions(self, project_id: str, test_case_id: str) -> List[TestCaseVersionSummary]:
        if not self.db:
            items = self.demo_versions.get(_version_key(project_id, test_case_id), [])
            return [
                TestCaseVersionSummary(
                    versionNumber=item.versionNumber,
                    label=_roman_label(item.versionNumber),
                    publishedAt=item.publishedAt,
                )
                for item in items
            ]

        res = (
            self.db.from_("test_case_versions")
            .select("version_number,label,published_at")
            .eq("test_case_id", test_case_id)
            .order("version_number")
            .execute()
        )
        return [
            TestCaseVersionSummary(
                versionNumber=int(row["version_number"]),
                label=_roman_label(int(row["version_number"])),
                publishedAt=str(row["published_at"]),
            )
            for row in (res.data or [])
        ]

    def get_version(self, project_id: str, test_case_id: str, version_number: int) -> TestCaseVersionDetail:
        if not self.db:
            for item in self.demo_versions.get(_version_key(project_id, test_case_id), []):
                if item.versionNumber == version_number:
                    return item
            raise HTTPException(status_code=404, detail="Published version not found")

        res = (
            self.db.from_("test_case_versions")
            .select("*")
            .eq("test_case_id", test_case_id)
            .eq("version_number", version_number)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Published version not found")
        row = res.data[0]
        snapshot = row.get("snapshot") or {}
        return TestCaseVersionDetail(
            versionNumber=int(row["version_number"]),
            label=str(row.get("label") or _roman_label(int(row["version_number"]))),
            publishedAt=str(row["published_at"]),
            name=snapshot.get("name", ""),
            description=snapshot.get("description"),
            category=snapshot.get("category", "Functional"),
            scenario=snapshot.get("scenario", "Happy Path"),
            environmentId=snapshot.get("environmentId"),
            startPath=snapshot.get("startPath", "/"),
            expectedResult=snapshot.get("expectedResult"),
            testFile=snapshot.get("testFile"),
            scriptSnapshot=snapshot.get("scriptSnapshot"),
        )

    def publish(self, project_id: str, test_case_id: str, snapshot: TestCaseVersionDetail) -> TestCaseVersionDetail:
        labeled = snapshot.model_copy(update={"label": _roman_label(snapshot.versionNumber)})
        if not self.db:
            key = _version_key(project_id, test_case_id)
            versions = self.demo_versions.setdefault(key, [])
            versions.append(labeled)
            return labeled

        snapshot_json = {
            "name": labeled.name,
            "description": labeled.description,
            "category": labeled.category,
            "scenario": labeled.scenario,
            "environmentId": labeled.environmentId,
            "startPath": labeled.startPath,
            "expectedResult": labeled.expectedResult,
            "testFile": labeled.testFile,
            "scriptSnapshot": labeled.scriptSnapshot,
        }
        self.db.from_("test_case_versions").insert(
            {
                "test_case_id": test_case_id,
                "version_number": labeled.versionNumber,
                "label": labeled.label,
                "published_at": labeled.publishedAt,
                "snapshot": snapshot_json,
            }
        ).execute()
        return labeled


test_case_version_repository = TestCaseVersionRepository()
