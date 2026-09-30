from pathlib import Path


def resolve_runner_config_path(
    *,
    config_path: str | None = None,
    script_path: str | None = None,
) -> str:
    """
    Resolve automation runner data.json path.

    Demo/frontend test cases expose a Playwright script path; the runner expects
    a sibling data.json in the same directory.
    """
    if config_path and config_path.strip():
        return config_path.strip().replace("\\", "/")

    if script_path and script_path.strip():
        script = Path(script_path.strip().replace("\\", "/"))
        return str(script.parent / "data.json").as_posix()

    raise ValueError("Either configPath or scriptPath is required")
