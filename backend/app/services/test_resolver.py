from pathlib import Path
from typing import Optional

from app.config import settings


SPEC_SUFFIXES = (".spec.js", ".spec.ts", ".spec.mjs", ".test.js", ".test.ts")


def project_root() -> Path:
    if settings.PROJECT_ROOT:
        return Path(settings.PROJECT_ROOT).resolve()
    return Path(__file__).resolve().parents[3]


def resolve_test_file(test_case_id: str) -> Optional[Path]:
    """Locate a Playwright JS/TS spec for a queued test case id."""
    root = project_root()
    raw = Path(test_case_id)

    candidates = []
    if raw.is_file():
        candidates.append(raw.resolve())
    else:
        candidates.append((root / test_case_id).resolve())

    for cand in candidates:
        if cand.is_file() and _is_spec(cand):
            return cand

    tests_dir = root / "tests"
    if not tests_dir.exists():
        return None

    needle = test_case_id.lower()
    for spec in _iter_specs(tests_dir):
        if needle in spec.stem.lower() or needle in str(spec).replace("\\", "/").lower():
            return spec

    return next(_iter_specs(tests_dir), None)


def resolve_auth_storage_path(storage_state_path: Optional[str]) -> Optional[Path]:
    if not storage_state_path:
        return None
    cand = Path(storage_state_path)
    path = cand if cand.is_absolute() else (project_root() / cand)
    path = path.resolve()
    return path if path.is_file() else None


def artifacts_dir_for(execution_id: str) -> Path:
    path = project_root() / "artifacts" / "executions" / execution_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _is_spec(path: Path) -> bool:
    name = path.name.lower()
    return name.endswith(SPEC_SUFFIXES) or name.endswith(".js") or name.endswith(".ts")


def _iter_specs(tests_dir: Path):
    for suffix in ("*.spec.js", "*.spec.ts", "*.spec.mjs", "*.test.js", "*.test.ts"):
        yield from tests_dir.rglob(suffix)
