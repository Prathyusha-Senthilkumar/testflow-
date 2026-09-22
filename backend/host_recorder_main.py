"""
Host-side Playwright codegen bridge for Docker development.

Run on Windows/macOS/Linux desktop while TestFlow API runs in Docker.
Writes to the bind-mounted automation/generated/ tree on the host repo.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.services.automation_service import (  # noqa: E402
    run_playwright_login_recording,
    run_playwright_recording,
)

app = FastAPI(title="TestFlow Host Recorder", version="1.0.0")


class HostRecordRequest(BaseModel):
    title: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    output: str = Field(..., min_length=1, description="Relative path under repo root")
    loadStorage: str | None = Field(
        None, description="Relative path to an Auth Profile storage_state.json"
    )


class HostLoginRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Login page URL")
    savePath: str = Field(..., min_length=1, description="Relative path under repo root")


def _safe_relative(raw: str) -> str:
    normalized = raw.replace("\\", "/").strip().lstrip("/")
    if not normalized or ".." in normalized.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    return normalized


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "repoRoot": str(_REPO_ROOT)}


@app.post("/record")
def record(body: HostRecordRequest) -> dict[str, object]:
    normalized = _safe_relative(body.output)
    load_storage = _safe_relative(body.loadStorage) if body.loadStorage else None

    try:
        run_playwright_recording(body.title, body.url, normalized, load_storage)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    script_path = (_REPO_ROOT / normalized).resolve()
    if not script_path.is_file() or script_path.stat().st_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Recording finished but the generated script file is missing or empty.",
        )
    return {"ok": True, "testFile": normalized}


@app.post("/record-login")
def record_login(body: HostLoginRequest) -> dict[str, object]:
    """Open the login page so the tester can log in, then save the storage state."""
    normalized = _safe_relative(body.savePath)

    try:
        run_playwright_login_recording(body.url, normalized)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    storage_path = (_REPO_ROOT / normalized).resolve()
    if not storage_path.is_file() or storage_path.stat().st_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Login recording finished but no session file was saved.",
        )
    return {"ok": True, "storageState": normalized}


def main() -> None:
    host = os.environ.get("HOST_RECORDER_HOST", "127.0.0.1")
    port = int(os.environ.get("HOST_RECORDER_PORT", "8765"))
    print(f"TestFlow host recorder listening on http://{host}:{port} (repo: {_REPO_ROOT})")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
