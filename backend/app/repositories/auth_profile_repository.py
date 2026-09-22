import json
import re
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import HTTPException

from app.schemas.auth_profile import AuthProfileSummary, CreateAuthProfileDto

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SEGMENT_RE = re.compile(r"^[\w\-]+$")
_PROFILES_ROOT = _REPO_ROOT / "automation" / "auth-profiles"
_META_FILENAME = "profile.json"
_STORAGE_FILENAME = "storage_state.json"
# A session is flagged for renewal once it is inside this window of its expiry.
_EXPIRING_WINDOW = timedelta(hours=24)
# Used when the saved cookies carry no expiry (session cookies only).
_MAX_SESSION_AGE = timedelta(days=7)


def _validate_segment(value: str, label: str) -> str:
    if not value or not _SEGMENT_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return value


def _latest_cookie_expiry(payload: object) -> Optional[datetime]:
    """Latest persistent cookie expiry, i.e. the point where nothing is valid anymore."""
    if not isinstance(payload, dict):
        return None
    expiries: List[float] = []
    for cookie in payload.get("cookies") or []:
        if not isinstance(cookie, dict):
            continue
        expires = cookie.get("expires")
        # Playwright stores -1 for session cookies.
        if isinstance(expires, (int, float)) and not isinstance(expires, bool) and expires > 0:
            expiries.append(float(expires))
    if not expiries:
        return None
    return datetime.fromtimestamp(max(expiries), tz=timezone.utc)


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

    def _session_state(
        self, profile_dir: Path
    ) -> Tuple[str, Optional[str], Optional[str]]:
        """Return (status, recorded_at, expires_at) derived from the saved session.

        Only derived timestamps leave this method; session contents are never exposed.
        """
        storage_path = profile_dir / _STORAGE_FILENAME
        if not self._has_storage_state(profile_dir):
            return "none", None, None

        now = datetime.now(timezone.utc)
        recorded_at = datetime.fromtimestamp(storage_path.stat().st_mtime, tz=timezone.utc)
        try:
            payload = json.loads(storage_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return "expired", recorded_at.isoformat(), None

        expiry = _latest_cookie_expiry(payload)
        if expiry is None:
            age = now - recorded_at
            if age >= _MAX_SESSION_AGE:
                status = "expired"
            elif age >= _MAX_SESSION_AGE - _EXPIRING_WINDOW:
                status = "expiring"
            else:
                status = "active"
            return status, recorded_at.isoformat(), None

        if expiry <= now:
            status = "expired"
        elif expiry <= now + _EXPIRING_WINDOW:
            status = "expiring"
        else:
            status = "active"
        return status, recorded_at.isoformat(), expiry.isoformat()

    def _read(self, project_id: str, profile_id: str, profile_dir: Path) -> AuthProfileSummary:
        meta_path = profile_dir / _META_FILENAME
        try:
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=500, detail=f"Could not read auth profile: {exc}")
        session_status, recorded_at, expires_at = self._session_state(profile_dir)
        return AuthProfileSummary(
            id=str(payload.get("id") or profile_id),
            projectId=str(payload.get("projectId") or project_id),
            name=str(payload.get("name") or "Untitled"),
            loginUrl=str(payload.get("loginUrl") or ""),
            hasStorageState=session_status != "none",
            sessionStatus=session_status,
            sessionRecordedAt=recorded_at,
            sessionExpiresAt=expires_at,
            needsRenewal=session_status in ("expiring", "expired"),
            createdAt=str(payload.get("createdAt") or ""),
        )


auth_profile_repository = AuthProfileRepository()
