import json
from datetime import datetime, timezone
from pathlib import Path

from .config_loader import save_config


def update_result(config_path: Path, data: dict, status: str, return_code: int) -> None:
    data["test_result"] = status
    save_config(config_path, data)

    history_path = config_path.parent / "result_history.json"
    history = []
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []

    history.append(
        {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "title": data["title"],
            "test_file_location": data["test_file_location"],
            "test_case_location": data["test_case_location"],
            "test_result": status,
            "pytest_return_code": return_code,
        }
    )
    history_path.write_text(json.dumps(history, indent=4) + "\n", encoding="utf-8")
