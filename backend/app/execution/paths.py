import sys
from functools import lru_cache
from pathlib import Path


@lru_cache
def get_testflow_project_root() -> Path:
    """Repository root (parent of backend/ and automation/)."""
    return Path(__file__).resolve().parents[3]


def ensure_testflow_on_sys_path() -> Path:
    root = get_testflow_project_root()
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    return root
