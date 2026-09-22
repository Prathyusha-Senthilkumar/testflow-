import subprocess
import sys
from pathlib import Path

from .config_loader import save_config


class PlaywrightRecorder:
    def __init__(self, project_root: Path, settings: dict):
        self.project_root = Path(project_root).resolve()
        self.settings = settings

    def record(
        self,
        title: str,
        url: str,
        output: str,
        browser: str | None = None,
        load_storage: str | Path | None = None,
    ) -> tuple[int, str | None]:
        output_path = (self.project_root / output).resolve()
        try:
            output_path.relative_to(self.project_root)
        except ValueError:
            return 2, "Recording output must stay inside the project directory."

        if output_path.suffix.lower() != ".py":
            return 2, "Recording output must be a .py file."

        output_path.parent.mkdir(parents=True, exist_ok=True)
        browser = browser or self.settings.get("browser", "chromium")
        target = self.settings.get("recording_target", "python-pytest")

        # Playwright CLI (Node) accepts forward slashes reliably on Windows.
        output_arg = output_path.as_posix()
        load_storage_arg = self._storage_arg(load_storage)

        command = build_codegen_command(
            browser=browser,
            url=url,
            target=target,
            output=output_arg,
            load_storage=load_storage_arg,
        )

        log_path = output_path.parent / "_codegen_last_run.log"
        log_path.write_text(
            "Playwright codegen launch\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {self.project_root}\n"
            f"output: {output_arg}\n",
            encoding="utf-8",
        )
        print("\nRecording configuration:")
        print(f"  Title       : {title}")
        print(f"  Start URL   : {url}")
        print(f"  Browser     : {browser}")
        print(f"  Target      : {target}")
        print(f"  Command     : {' '.join(command)}")
        print(f"  Output      : {output_arg}")
        if load_storage_arg:
            print(f"  Load storage: {load_storage_arg}")
        print(f"  CWD         : {self.project_root}")
        print("\nPlaywright Codegen will open a browser and Inspector.")
        print("Perform the actions you want to record, then close the Codegen window when finished.\n")

        result = subprocess.run(command, **self._codegen_run_kwargs())

        if output_path.is_file() and output_path.stat().st_size > 0:
            self._write_sidecar_files(title, url, output_path)
            return 0, None

        log_text = (
            f"Playwright codegen exited with code {result.returncode}. "
            f"No script was written to {output_arg}. "
            "Close the Playwright Inspector window after recording (not only the browser tab). "
            f"Launch details: {log_path.as_posix()}"
        )

        print("\nRecording did not produce a test file.")
        print(log_text)
        return result.returncode or 1, log_text

    def _write_sidecar_files(self, title: str, url: str, output_path: Path) -> None:
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

    def record_storage_state(
        self,
        url: str,
        save_path: str | Path,
        browser: str | None = None,
    ) -> tuple[int, str | None]:
        save_file = Path(save_path)
        if not save_file.is_absolute():
            save_file = (self.project_root / save_file).resolve()
        try:
            save_file.relative_to(self.project_root)
        except ValueError:
            return 2, "Auth profile storage must stay inside the project directory."

        save_file.parent.mkdir(parents=True, exist_ok=True)
        browser = browser or self.settings.get("browser", "chromium")
        save_arg = save_file.as_posix()
        command = build_codegen_command(
            browser=browser,
            url=url,
            save_storage=save_arg,
        )

        log_path = save_file.parent / "_codegen_login_last_run.log"
        log_path.write_text(
            "Playwright login capture\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {self.project_root}\n"
            f"save: {save_arg}\n",
            encoding="utf-8",
        )
        print("\nAuth profile login recording:")
        print(f"  Start URL   : {url}")
        print(f"  Browser     : {browser}")
        print(f"  Save storage: {save_arg}")
        print("\nLog in using the Playwright window, then close the Inspector to save the session.\n")

        result = subprocess.run(command, **self._codegen_run_kwargs())

        if save_file.is_file() and save_file.stat().st_size > 0:
            return 0, None

        log_text = (
            f"Playwright codegen exited with code {result.returncode}. "
            f"No storage state was written to {save_arg}. "
            "Close the Playwright Inspector window after logging in. "
            f"Launch details: {log_path.as_posix()}"
        )
        print("\nLogin recording did not save a session.")
        print(log_text)
        return result.returncode or 1, log_text

    def _codegen_run_kwargs(self) -> dict:
        run_kwargs: dict = {
            "cwd": self.project_root,
            "stdin": subprocess.DEVNULL,
            "shell": False,
        }
        if sys.platform == "win32":
            run_kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        return run_kwargs

    def _storage_arg(self, storage_path: str | Path | None) -> str | None:
        if not storage_path:
            return None
        path = Path(storage_path)
        if not path.is_absolute():
            path = (self.project_root / path).resolve()
        return path.as_posix()


def build_codegen_command(
    *,
    browser: str,
    url: str,
    target: str | None = None,
    output: str | None = None,
    load_storage: str | None = None,
    save_storage: str | None = None,
) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "playwright",
        "codegen",
        "--browser",
        browser,
    ]
    if target:
        command.extend(["--target", target])
    if output:
        command.extend(["--output", output])
    if load_storage:
        command.extend(["--load-storage", load_storage])
    if save_storage:
        command.extend(["--save-storage", save_storage])
    command.append(url)
    return command
