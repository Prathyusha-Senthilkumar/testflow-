from pathlib import Path

REQUIRED_FIELDS = (
    "title",
    "test_file_location",
    "test_case_location",
    "test_result",
)


def validate_config(data: dict, project_root: Path) -> list[str]:
    """Return validation errors. An empty list means the config is valid."""
    errors: list[str] = []

    for field in REQUIRED_FIELDS:
        if field not in data:
            errors.append(f"Missing required field: {field}")

    if errors:
        return errors

    if not isinstance(data["title"], str) or not data["title"].strip():
        errors.append("title must be a non-empty string")

    for key in ("test_file_location", "test_case_location"):
        value = data[key]
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{key} must be a non-empty relative path")
            continue

        candidate = (project_root / value).resolve()
        try:
            candidate.relative_to(project_root.resolve())
        except ValueError:
            errors.append(f"{key} must stay inside the project directory")
            continue

        if not candidate.is_file():
            errors.append(f"File not found for {key}: {value}")

    result = data["test_result"]
    if result not in ("", "Pass", "Fail", "Not Run"):
        errors.append('test_result must be "Pass", "Fail", "Not Run", or empty')

    return errors
