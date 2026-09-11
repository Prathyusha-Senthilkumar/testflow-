import json
from pathlib import Path


def load_config(config_path: str | Path) -> dict:
    path = Path(config_path)
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_config(config_path: str | Path, data: dict) -> None:
    path = Path(config_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=4)
        file.write("\n")


def load_framework_config(project_root: str | Path) -> dict:
    path = Path(project_root) / "automation" / "config" / "framework.json"
    return load_config(path)
