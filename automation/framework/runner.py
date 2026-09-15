import subprocess
import sys
from pathlib import Path

from .config_loader import load_config
from .result_handler import update_result
from .validator import validate_config


class TestRunner:
    def __init__(self, project_root: Path, settings: dict):
        self.project_root = project_root.resolve()
        self.settings = settings

    def validate(self, config_path: Path) -> tuple[dict, list[str]]:
        try:
            data = load_config(config_path)
        except FileNotFoundError:
            return {}, [f"Configuration file not found: {config_path}"]
        except Exception as exc:
            return {}, [f"Could not read configuration JSON: {exc}"]
        errors = validate_config(data, self.project_root)
        return data, errors

    def preview(self, data: dict, headed: bool | None = None) -> str:
        effective_headed = self.settings.get("headed", False) if headed is None else headed
        return (
            "\nThe framework is about to execute:\n"
            f"  Test title  : {data['title']}\n"
            f"  Test case   : {data['test_case_location']}\n"
            f"  Test script : {data['test_file_location']}\n"
            f"  Browser     : {self.settings.get('browser', 'chromium')}\n"
            f"  Visible     : {'Yes' if effective_headed else 'No'}\n"
            f"  Retries     : {self.settings.get('retry_count', 0)}\n"
            "  Engine      : pytest + Playwright\n"
            "  Outcome     : data.json will be updated to Pass/Fail\n"
        )

    def _build_command(self, test_file: Path, effective_headed: bool) -> list[str]:
        command = [sys.executable, "-m", "pytest", str(test_file), "-v", "-s"]
        if effective_headed:
            command.append("--headed")

        browser = self.settings.get("browser")
        if browser:
            command.extend(["--browser", browser])

        if self.settings.get("trace_on_failure", False):
            command.extend(["--tracing", "retain-on-failure"])
        if self.settings.get("screenshot_on_failure", False):
            command.extend(["--screenshot", "only-on-failure"])

        artifacts_dir = self.settings.get("artifacts_directory")
        if artifacts_dir:
            (self.project_root / artifacts_dir).mkdir(parents=True, exist_ok=True)
            command.extend(["--output", str(self.project_root / artifacts_dir)])
        return command

    def run(self, config_path: Path, confirm: bool = True, headed: bool | None = None) -> int:
        config_path = config_path.resolve()
        data, errors = self.validate(config_path)

        if errors:
            print("\nValidation failed:")
            for error in errors:
                print(f"  - {error}")
            return 2

        effective_headed = self.settings.get("headed", False) if headed is None else headed
        print("\nValidation successful.")
        print(self.preview(data, effective_headed))

        if confirm:
            answer = input("Continue with this test? (y/n): ").strip().lower()
            if answer not in {"y", "yes"}:
                print("Test execution cancelled.")
                return 0

        test_file = self.project_root / data["test_file_location"]
        command = self._build_command(test_file, effective_headed)
        retry_count = max(0, int(self.settings.get("retry_count", 0)))
        timeout_seconds = max(1, int(self.settings.get("execution_timeout_seconds", 300)))

        final_return_code = 1
        for attempt in range(1, retry_count + 2):
            if attempt > 1:
                print(f"\nRetrying test (attempt {attempt}/{retry_count + 1})...")
            try:
                result = subprocess.run(command, cwd=self.project_root, timeout=timeout_seconds)
                final_return_code = result.returncode
            except subprocess.TimeoutExpired:
                final_return_code = 124
                print(f"\nTest exceeded the execution limit of {timeout_seconds} seconds.")
            except OSError as exc:
                final_return_code = 1
                print(f"\nCould not start the test process: {exc}")

            if final_return_code == 0:
                break

        status = "Pass" if final_return_code == 0 else "Fail"
        update_result(config_path, data, status, final_return_code)

        print(f"\nFinal result: {status}")
        print(f"Updated metadata: {config_path.relative_to(self.project_root)}")
        if status == "Fail" and self.settings.get("artifacts_directory"):
            print(f"Failure artifacts (when produced by Playwright): {self.settings['artifacts_directory']}")
        return final_return_code
