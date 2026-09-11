import subprocess
import sys
from pathlib import Path

from .config_loader import save_config


class PlaywrightRecorder:
    def __init__(self, project_root: Path, settings: dict):
        self.project_root = Path(project_root).resolve()
        self.settings = settings

    def record(self, title: str, url: str, output: str, browser: str | None = None) -> int:
        output_path = (self.project_root / output).resolve()
        try:
            output_path.relative_to(self.project_root)
        except ValueError:
            print("Recording output must stay inside the project directory.")
            return 2

        if output_path.suffix.lower() != ".py":
            print("Recording output must be a .py file.")
            return 2

        output_path.parent.mkdir(parents=True, exist_ok=True)
        browser = browser or self.settings.get("browser", "chromium")
        target = self.settings.get("recording_target", "python-pytest")

        command = [
            sys.executable, "-m", "playwright", "codegen",
            "--browser", browser,
            "--target", target,
            "--output", str(output_path),
            url,
        ]

        print("\nRecording configuration:")
        print(f"  Title       : {title}")
        print(f"  Start URL   : {url}")
        print(f"  Browser     : {browser}")
        print(f"  Output      : {output_path.relative_to(self.project_root)}")
        print("\nPlaywright Codegen will open a browser and Inspector.")
        print("Perform the actions you want to record, then close Codegen when finished.\n")

        result = subprocess.run(command, cwd=self.project_root)
        if result.returncode != 0 or not output_path.exists():
            print("\nRecording did not produce a test file.")
            return result.returncode or 1

        folder = output_path.parent
        test_case_path = folder / "test_case.md"
        data_path = folder / "data.json"

        relative_test = output_path.relative_to(self.project_root).as_posix()
        relative_md = test_case_path.relative_to(self.project_root).as_posix()

        test_case_content = f"""# {title}

## Objective
Verify that the recorded browser flow executes successfully.

## Starting URL
{url}

## Automated Test Script
`{relative_test}`

## Recorded Steps
The detailed browser actions are stored in the generated Playwright test script above. Add or refine assertions in that script when a specific expected result must be verified.
"""
        test_case_path.write_text(test_case_content, encoding="utf-8")

        # Keep the manager-required metadata fields exactly as the core schema.
        data = {
            "title": title,
            "test_file_location": relative_test,
            "test_case_location": relative_md,
            "test_result": "Not Run",
        }
        save_config(data_path, data)

        print("\nRecording complete. Framework files created automatically:")
        print(f"  - {relative_test}")
        print(f"  - {relative_md}")
        print(f"  - {data_path.relative_to(self.project_root).as_posix()}")
        print("\nNext: validate or run this test using its data.json file.")
        return 0
