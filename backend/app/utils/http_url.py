from urllib.parse import urlparse, urlunparse

from fastapi import HTTPException


def normalize_base_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Base URL is required")
    try:
        parsed = urlparse(raw)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Unsupported protocol")
        path = parsed.path or ""
        if path != "/":
            path = path.rstrip("/")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Enter a valid http:// or https:// URL")
