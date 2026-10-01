from pathlib import Path

from app.execution.paths import get_testflow_project_root


def ensure_runner_config_for_script(
    script_path: str,
    title: str = "TestFlow test case",
) -> str:
    """
    Ensure data.json (and test_case.md) exist beside the Playwright script.

    Friday recording writes these via PlaywrightRecorder; older cases may only have
    test_recorded.py + testflow.meta.json until the first async run.
    """
    root = get_testflow_project_root()
    normalized_script = script_path.strip().replace("\\", "/")
    script_file = (root / normalized_script).resolve()
    case_dir = script_file.parent

    try:
        script_file.relative_to(root.resolve())
    except ValueError:
        raise ValueError("scriptPath must stay inside the TestFlow project root") from None

    if not script_file.is_file():
        raise ValueError(f"Script file not found: {normalized_script}")

    relative_test = script_file.relative_to(root).as_posix()
    test_case_path = case_dir / "test_case.md"
    data_path = case_dir / "data.json"
    relative_md = test_case_path.relative_to(root).as_posix()
    relative_data = data_path.relative_to(root).as_posix()

    if not test_case_path.is_file():
        test_case_path.write_text(
            f"""# {title}

## Objective
Verify that the automated browser flow executes successfully.

## Automated Test Script
`{relative_test}`
""",
            encoding="utf-8",
        )

    if not data_path.is_file():
        import json

        payload = {
            "title": title,
            "test_file_location": relative_test,
            "test_case_location": relative_md,
            "test_result": "Not Run",
        }
        data_path.write_text(json.dumps(payload, indent=4) + "\n", encoding="utf-8")

    return relative_data
