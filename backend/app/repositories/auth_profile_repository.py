import json
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import HTTPException

from app.schemas.auth_profile import AuthProfileSummary, CreateAuthProfileDto

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SEGMENT_RE = re.compile(r"^[\w\-]+$")
_PROFILES_ROOT = _REPO_ROOT / "automation" / "auth-profiles"
_META_FILENAME = "profile.json"
_STORAGE_FILENAME = "storage_state.json"


def _validate_segment(value: str, label: str) -> str:
    if not value or not _SEGMENT_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return value


class AuthProfileRepository:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root else _PROFILES_ROOT

    def validate_project_id(self, project_id: str) -> None:
        _validate_segment(project_id, "project id")

    def validate_profile_id(self, profile_id: str) -> None:
        _validate_segment(profile_id, "auth profile id")

    def list_by_project(self, project_id: str) -> List[AuthProfileSummary]:
        project_dir = self._project_dir(project_id)
        if not project_dir.is_dir():
            return []
        profiles: List[AuthProfileSummary] = []
        for child in sorted(project_dir.iterdir(), key=lambda path: path.name):
            if child.is_dir() and (child / _META_FILENAME).is_file():
                profiles.append(self._read(project_id, child.name, child))
        return profiles

    def find_by_id(self, project_id: str, profile_id: str) -> AuthProfileSummary:
        profile_dir = self._profile_dir(project_id, profile_id)
        meta_path = profile_dir / _META_FILENAME
        if not meta_path.is_file():
            raise HTTPException(status_code=404, detail="Auth profile not found")
        return self._read(project_id, profile_id, profile_dir)

    def create(self, project_id: str, input_dto: CreateAuthProfileDto) -> AuthProfileSummary:
        profile_id = f"auth-{int(time.time() * 1000)}"
        profile_dir = self._profile_dir(project_id, profile_id)
        profile_dir.mkdir(parents=True, exist_ok=True)
        created_at = datetime.now(timezone.utc).isoformat()
        payload = {
            "id": profile_id,
            "projectId": project_id,
            "name": input_dto.name.strip(),
            "loginUrl": input_dto.loginUrl,
            "createdAt": created_at,
        }
        (profile_dir / _META_FILENAME).write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )
        return self._read(project_id, profile_id, profile_dir)

    def delete(self, project_id: str, profile_id: str) -> None:
        profile_dir = self._profile_dir(project_id, profile_id)
        if not (profile_dir / _META_FILENAME).is_file():
            raise HTTPException(status_code=404, detail="Auth profile not found")
        shutil.rmtree(profile_dir)

    def storage_state_path(self, project_id: str, profile_id: str) -> Path:
        return self._profile_dir(project_id, profile_id) / _STORAGE_FILENAME

    def _project_dir(self, project_id: str) -> Path:
        return self.root / _validate_segment(project_id, "project id")

    def _profile_dir(self, project_id: str, profile_id: str) -> Path:
        return self._project_dir(project_id) / _validate_segment(profile_id, "auth profile id")

    def _has_storage_state(self, profile_dir: Path) -> bool:
        storage_path = profile_dir / _STORAGE_FILENAME
        return storage_path.is_file() and storage_path.stat().st_size > 0

    def _read(self, project_id: str, profile_id: str, profile_dir: Path) -> AuthProfileSummary:
        meta_path = profile_dir / _META_FILENAME
        try:
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=500, detail=f"Could not read auth profile: {exc}")
        return AuthProfileSummary(
            id=str(payload.get("id") or profile_id),
            projectId=str(payload.get("projectId") or project_id),
            name=str(payload.get("name") or "Untitled"),
            loginUrl=str(payload.get("loginUrl") or ""),
            hasStorageState=self._has_storage_state(profile_dir),
            createdAt=str(payload.get("createdAt") or ""),
        )


auth_profile_repository = AuthProfileRepository()
