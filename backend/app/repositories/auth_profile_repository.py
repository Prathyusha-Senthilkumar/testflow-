import json
import logging
import os
import re
import shutil
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, List, Optional, Tuple

from fastapi import HTTPException

from app.schemas.auth_profile import AuthProfileSummary, AuthRefreshConfig, CreateAuthProfileDto

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SEGMENT_RE = re.compile(r"^[\w\-]+$")
_PROFILES_ROOT = _REPO_ROOT / "automation" / "auth-profiles"
_META_FILENAME = "profile.json"
_STORAGE_FILENAME = "storage_state.json"
_CREDENTIALS_FILENAME = "credentials.enc"
# A session is flagged for renewal once it is inside this window of its expiry.
_EXPIRING_WINDOW = timedelta(hours=24)
# Used when the saved cookies carry no expiry (session cookies only).
_MAX_SESSION_AGE = timedelta(days=7)


logger = logging.getLogger("testflow.auth_profiles")


def _decrypt_for_use(token: str) -> Optional[dict]:
    """Strict decrypt for runs and recording: a bad key is an explicit error, never 'no session'."""
    from app.services.secret_store import SecretDecryptError, SecretUnavailableError, decrypt_mapping

    try:
        return decrypt_mapping(token)
    except SecretUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SecretDecryptError as exc:
        logger.error("event=auth_profile_decrypt_failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _decrypt_for_summary(token: str, profile_id: str, field: str) -> Tuple[Optional[dict], bool]:
    """Listing stays usable when one secret cannot be read. Returns (value, unreadable)."""
    from app.services.secret_store import SecretDecryptError, SecretUnavailableError, decrypt_mapping

    try:
        return decrypt_mapping(token), False
    except (SecretUnavailableError, SecretDecryptError) as exc:
        logger.error(
            "event=auth_profile_decrypt_failed profile_id=%s field=%s reason=%s",
            profile_id,
            field,
            exc.__class__.__name__,
        )
        return None, True


def _write_private(path: Path, text: str) -> None:
    """Create a new 0600 file; fails if it already exists."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)


def _public_refresh(refresh: AuthRefreshConfig) -> dict:
    """Keep only configured names and the endpoint. Drop anything that is not a setting."""
    data = refresh.model_dump(exclude_none=True)
    if refresh.strategy == "cookie":
        return {
            "strategy": "cookie",
            "url": refresh.url.strip(),
            "method": refresh.method,
        }
    stored = {
        "strategy": "localStorage",
        "url": refresh.url.strip(),
        "method": refresh.method,
        "sendToken": refresh.sendToken,
        "authorizationHeader": (refresh.authorizationHeader or "Authorization").strip() or "Authorization",
    }
    for key in ("origin", "accessTokenKey", "refreshTokenKey", "accessTokenJsonPath", "refreshTokenJsonPath"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            stored[key] = value.strip()
    return stored


def _refresh_from_payload(raw: object) -> Optional[AuthRefreshConfig]:
    if not isinstance(raw, dict):
        return None
    try:
        return AuthRefreshConfig.model_validate(raw)
    except Exception:
        return None


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

    def _client(self):
        """Supabase client when persistence is configured. File storage remains the demo path."""
        if self.root != _PROFILES_ROOT:
            return None
        try:
            from app.database import get_supabase_client

            return get_supabase_client()
        except Exception:
            return None

    def validate_project_id(self, project_id: str) -> None:
        _validate_segment(project_id, "project id")

    def validate_profile_id(self, profile_id: str) -> None:
        _validate_segment(profile_id, "auth profile id")

    def list_by_project(self, project_id: str) -> List[AuthProfileSummary]:
        client = self._client()
        if client is not None:
            rows = (
                client.from_("auth_profiles")
                .select("id,project_id,name,login_url,refresh,credentials_enc,storage_state_enc,created_at")
                .eq("project_id", project_id)
                .execute()
                .data
                or []
            )
            return [self._from_row(row) for row in rows]
        project_dir = self._project_dir(project_id)
        if not project_dir.is_dir():
            return []
        profiles: List[AuthProfileSummary] = []
        for child in sorted(project_dir.iterdir(), key=lambda path: path.name):
            if child.is_dir() and (child / _META_FILENAME).is_file():
                profiles.append(self._read(project_id, child.name, child))
        return profiles

    def find_by_id(self, project_id: str, profile_id: str) -> AuthProfileSummary:
        client = self._client()
        if client is not None:
            row = self._row(client, project_id, profile_id)
            if row is None:
                raise HTTPException(status_code=404, detail="Auth profile not found")
            return self._from_row(row)
        profile_dir = self._profile_dir(project_id, profile_id)
        meta_path = profile_dir / _META_FILENAME
        if not meta_path.is_file():
            raise HTTPException(status_code=404, detail="Auth profile not found")
        return self._read(project_id, profile_id, profile_dir)

    def create(self, project_id: str, input_dto: CreateAuthProfileDto) -> AuthProfileSummary:
        profile_id = f"auth-{int(time.time() * 1000)}"
        client = self._client()
        if client is not None:
            created_at = datetime.now(timezone.utc).isoformat()
            client.from_("auth_profiles").insert(
                {
                    "id": profile_id,
                    "project_id": project_id,
                    "name": input_dto.name.strip(),
                    "login_url": input_dto.loginUrl,
                    "created_at": created_at,
                }
            ).execute()
            return self.find_by_id(project_id, profile_id)
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
        client = self._client()
        if client is not None:
            row = self._row(client, project_id, profile_id)
            if row is None:
                raise HTTPException(status_code=404, detail="Auth profile not found")
            client.from_("auth_profiles").delete().eq("id", profile_id).eq("project_id", project_id).execute()
            return
        profile_dir = self._profile_dir(project_id, profile_id)
        if not (profile_dir / _META_FILENAME).is_file():
            raise HTTPException(status_code=404, detail="Auth profile not found")
        shutil.rmtree(profile_dir)

    def storage_state_path(self, project_id: str, profile_id: str) -> Path:
        return self._profile_dir(project_id, profile_id) / _STORAGE_FILENAME

    # ---- Credentials (encrypted at rest, never in profile.json) ----------
    def credentials_path(self, project_id: str, profile_id: str) -> Path:
        return self._profile_dir(project_id, profile_id) / _CREDENTIALS_FILENAME

    def save_credentials(
        self, project_id: str, profile_id: str, username: str, password: str
    ) -> None:
        from app.services.secret_store import SecretUnavailableError, encrypt_mapping

        client = self._client()
        if client is None:
            profile_dir = self._profile_dir(project_id, profile_id)
            if not (profile_dir / _META_FILENAME).is_file():
                raise HTTPException(status_code=404, detail="Auth profile not found")
        try:
            token = encrypt_mapping({"username": username, "password": password})
        except SecretUnavailableError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        client = self._client()
        if client is not None:
            if self._row(client, project_id, profile_id) is None:
                raise HTTPException(status_code=404, detail="Auth profile not found")
            client.from_("auth_profiles").update({"credentials_enc": token}).eq("id", profile_id).eq(
                "project_id", project_id
            ).execute()
            return
        self.credentials_path(project_id, profile_id).write_text(token, encoding="utf-8")

    def read_credentials(self, project_id: str, profile_id: str) -> Optional[dict]:
        """Decrypted {username, password}. Callers must never log or return this."""
        client = self._client()
        token = ""
        if client is not None:
            row = self._row(client, project_id, profile_id)
            token = str((row or {}).get("credentials_enc") or "")
        else:
            path = self.credentials_path(project_id, profile_id)
            if path.is_file():
                token = path.read_text(encoding="utf-8").strip()
        if not token:
            return None
        payload = _decrypt_for_use(token)
        if not payload or not payload.get("username"):
            return None
        return payload

    def save_refresh(
        self, project_id: str, profile_id: str, refresh: Optional[AuthRefreshConfig]
    ) -> None:
        """Store non-secret refresh settings. Credentials stay encrypted."""
        client = self._client()
        if client is not None:
            if self._row(client, project_id, profile_id) is None:
                raise HTTPException(status_code=404, detail="Auth profile not found")
            stored = None if refresh is None else _public_refresh(refresh)
            client.from_("auth_profiles").update({"refresh": stored}).eq("id", profile_id).eq(
                "project_id", project_id
            ).execute()
            return
        profile_dir = self._profile_dir(project_id, profile_id)
        meta_path = profile_dir / _META_FILENAME
        if not meta_path.is_file():
            raise HTTPException(status_code=404, detail="Auth profile not found")
        try:
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=500, detail=f"Could not read auth profile: {exc}") from exc
        if refresh is None:
            payload.pop("refresh", None)
        else:
            payload["refresh"] = _public_refresh(refresh)
        meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def credential_username(self, project_id: str, profile_id: str) -> Optional[str]:
        payload = self.read_credentials(project_id, profile_id)
        return payload.get("username") if payload else None

    def _has_credentials(self, profile_dir: Path) -> bool:
        path = profile_dir / _CREDENTIALS_FILENAME
        return path.is_file() and path.stat().st_size > 0

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
        has_credentials = self._has_credentials(profile_dir)
        # Username is not a secret and helps the tester confirm setup; the
        # password is never read back out to the API layer.
        username = None
        if has_credentials:
            token = (profile_dir / _CREDENTIALS_FILENAME).read_text(encoding="utf-8").strip()
            stored, _ = _decrypt_for_summary(token, profile_id, "credentials")
            username = stored.get("username") if stored else None
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
            hasCredentials=has_credentials,
            username=username,
            refresh=_refresh_from_payload(payload.get("refresh")),
            createdAt=str(payload.get("createdAt") or ""),
        )


    def read_storage_state(self, project_id: str, profile_id: str) -> Optional[dict]:
        """Decrypted Playwright storage state, or None when none is saved. Never log or return it."""
        client = self._client()
        if client is None:
            path = self.storage_state_path(project_id, profile_id)
            if not path.is_file() or path.stat().st_size == 0:
                return None
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return None
            return payload if isinstance(payload, dict) else None
        row = self._row(client, project_id, profile_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Auth profile not found")
        return _decrypt_for_use(str(row.get("storage_state_enc") or ""))

    def save_storage_state(self, project_id: str, profile_id: str, state: dict) -> None:
        """Encrypt a session into Supabase (demo mode: the profile's local file)."""
        client = self._client()
        if client is None:
            path = self.storage_state_path(project_id, profile_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(state), encoding="utf-8")
            return
        from app.services.secret_store import SecretUnavailableError, encrypt_mapping

        try:
            token = encrypt_mapping(state)
        except SecretUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        client.from_("auth_profiles").update({"storage_state_enc": token}).eq("id", profile_id).eq(
            "project_id", project_id
        ).execute()

    @contextmanager
    def session_file(
        self, project_id: str, profile_id: str, *, load: bool = True, save: bool = False
    ) -> Iterator[Path]:
        """A storageState file for tools that only accept a path (Playwright codegen).

        Supabase mode: a private (0600), uniquely named temp file inside the profile folder
        (bind-mounted, so the host recorder can reach it). With load=True it holds the
        decrypted session; with save=True whatever the caller left there is encrypted back
        if it changed. The file is always deleted. Demo mode yields the profile's own file.
        """
        if self._client() is None:
            path = self.storage_state_path(project_id, profile_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            yield path
            return

        profile_dir = self._profile_dir(project_id, profile_id)
        profile_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = profile_dir / f"storage_state.{uuid.uuid4().hex}.tmp.json"
        original = ""
        state = self.read_storage_state(project_id, profile_id) if load else None
        if state is not None:
            original = json.dumps(state)
        # Always pre-create it private, so a tool writing into it keeps 0600.
        _write_private(path, original)
        try:
            yield path
            if save and path.is_file() and path.stat().st_size > 0:
                written = path.read_text(encoding="utf-8")
                if written != original:
                    try:
                        new_state = json.loads(written)
                    except json.JSONDecodeError as exc:
                        raise HTTPException(
                            status_code=400, detail="The recorded session file is not valid JSON."
                        ) from exc
                    if isinstance(new_state, dict):
                        self.save_storage_state(project_id, profile_id, new_state)
        finally:
            path.unlink(missing_ok=True)

    def _row(self, client, project_id: str, profile_id: str) -> Optional[dict]:
        rows = (
            client.from_("auth_profiles")
            .select("id,project_id,name,login_url,refresh,credentials_enc,storage_state_enc,created_at")
            .eq("id", profile_id)
            .eq("project_id", project_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None

    def _from_row(self, row: dict) -> AuthProfileSummary:
        profile_id = str(row.get("id"))
        storage, storage_unreadable = _decrypt_for_summary(
            str(row.get("storage_state_enc") or ""), profile_id, "storage_state"
        )
        status, recorded_at, expires_at = self._session_from_payload(storage, str(row.get("created_at") or None))
        if storage_unreadable:
            # Stored but unreadable with the current key: show it as needing a new login,
            # never as "no session".
            status, expires_at = "expired", None
        credentials, credentials_unreadable = _decrypt_for_summary(
            str(row.get("credentials_enc") or ""), profile_id, "credentials"
        )
        username = credentials.get("username") if isinstance(credentials, dict) else None
        return AuthProfileSummary(
            id=str(row.get("id")),
            projectId=str(row.get("project_id")),
            name=str(row.get("name") or "Untitled"),
            loginUrl=str(row.get("login_url") or ""),
            hasStorageState=status != "none",
            sessionStatus=status,
            sessionRecordedAt=recorded_at,
            sessionExpiresAt=expires_at,
            needsRenewal=status in ("expiring", "expired"),
            hasCredentials=bool(username) or credentials_unreadable,
            username=username,
            refresh=_refresh_from_payload(row.get("refresh")),
            createdAt=str(row.get("created_at") or ""),
        )

    def _session_from_payload(self, payload: Optional[dict], created_at: Optional[str]):
        if not isinstance(payload, dict):
            return "none", None, None
        now = datetime.now(timezone.utc)
        recorded_at = created_at
        expiry = _latest_cookie_expiry(payload)
        if expiry is None:
            return "active", recorded_at, None
        if expiry <= now:
            status = "expired"
        elif expiry <= now + _EXPIRING_WINDOW:
            status = "expiring"
        else:
            status = "active"
        return status, recorded_at, expiry.isoformat()

    def _import_local(self, client, project_id: str) -> None:
        """Copy file profiles into Supabase once. Local files are not deleted."""
        project_dir = self._project_dir(project_id)
        if not project_dir.is_dir():
            return
        existing = {
            str(row.get("id"))
            for row in (
                client.from_("auth_profiles").select("id").eq("project_id", project_id).execute().data or []
            )
        }
        from app.services.secret_store import encrypt_mapping

        for child in project_dir.iterdir():
            if not child.is_dir() or not (child / _META_FILENAME).is_file():
                continue
            if child.name in existing:
                continue
            try:
                meta = json.loads((child / _META_FILENAME).read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            credentials_enc = None
            cred_path = child / _CREDENTIALS_FILENAME
            if cred_path.is_file():
                credentials_enc = cred_path.read_text(encoding="utf-8").strip() or None
            storage_enc = None
            storage_path = child / _STORAGE_FILENAME
            if storage_path.is_file():
                try:
                    storage = json.loads(storage_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    storage = None
                if isinstance(storage, dict):
                    try:
                        storage_enc = encrypt_mapping(storage)
                    except Exception:
                        storage_enc = None
            client.from_("auth_profiles").insert(
                {
                    "id": str(meta.get("id") or child.name),
                    "project_id": project_id,
                    "name": str(meta.get("name") or "Untitled"),
                    "login_url": str(meta.get("loginUrl") or ""),
                    "refresh": meta.get("refresh"),
                    "credentials_enc": credentials_enc,
                    "storage_state_enc": storage_enc,
                    "created_at": meta.get("createdAt") or datetime.now(timezone.utc).isoformat(),
                }
            ).execute()


auth_profile_repository = AuthProfileRepository()
