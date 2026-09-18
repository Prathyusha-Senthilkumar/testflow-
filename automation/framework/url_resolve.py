from urllib.parse import urljoin, urlparse, urlunparse


def normalize_start_path(start_path: str | None) -> str:
    """Canonical relative start path for storage (or absolute http(s) override)."""
    path = (start_path or "/").strip()
    if not path:
        return "/"
    if path.startswith("http://") or path.startswith("https://"):
        return path
    while path.startswith("//"):
        path = path[1:]
    if not path.startswith("/"):
        path = f"/{path}"
    return path


def _collapse_path_slashes(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path or "/"
    while "//" in path:
        path = path.replace("//", "/")
    return urlunparse(parsed._replace(path=path))


def resolve_start_url(base_url: str, start_path: str = "/") -> str:
    base = (base_url or "").strip()
    if not base:
        raise ValueError("Project base URL is required")

    path = normalize_start_path(start_path)
    if path.startswith("http://") or path.startswith("https://"):
        return path

    parsed_base = urlparse(base if "://" in base else f"https://{base}")
    if not parsed_base.scheme:
        parsed_base = urlparse(f"https://{base}")

    origin = f"{parsed_base.scheme}://{parsed_base.netloc}/"
    relative = path.lstrip("/")
    if not relative:
        return _collapse_path_slashes(origin)

    joined = urljoin(origin, relative)
    return _collapse_path_slashes(joined)
