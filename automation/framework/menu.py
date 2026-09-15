from pathlib import Path

from .config_loader import load_config
from .recorder import PlaywrightRecorder
from .runner import TestRunner
from .validator import validate_config


class QAMenu:
    """Simple interactive layer so QA users do not need to remember commands."""

    def __init__(self, project_root: Path, settings: dict):
        self.project_root = project_root.resolve()
        self.settings = settings
        self.runner = TestRunner(self.project_root, settings)

    def _find_configs(self) -> list[Path]:
        test_dir = self.settings.get("test_directory", "tests")
        return sorted((self.project_root / test_dir).glob("**/data.json"))

    def _load_test_rows(self) -> list[tuple[Path, dict]]:
        rows: list[tuple[Path, dict]] = []
        for path in self._find_configs():
            try:
                rows.append((path, load_config(path)))
            except Exception as exc:
                rows.append((path, {"title": f"Invalid config ({exc})", "test_result": "Invalid"}))
        return rows

    def _choose_test(self) -> Path | None:
        rows = self._load_test_rows()
        if not rows:
            print("\nNo configured tests were found.")
            return None

        print("\nAvailable tests")
        print("-" * 72)
        for index, (path, data) in enumerate(rows, start=1):
            title = data.get("title", "<untitled>")
            result = data.get("test_result") or "Not Run"
            rel = path.relative_to(self.project_root)
            print(f"{index:>2}. {title} | {result} | {rel}")
        print(" 0. Back")

        while True:
            choice = input("\nSelect a test: ").strip()
            if choice == "0":
                return None
            if choice.isdigit() and 1 <= int(choice) <= len(rows):
                return rows[int(choice) - 1][0]
            print("Please enter one of the numbers shown above.")

    def list_tests(self) -> None:
        rows = self._load_test_rows()
        if not rows:
            print("\nNo configured tests were found.")
            return
        print("\nConfigured tests")
        print("-" * 72)
        for path, data in rows:
            print(
                f"{data.get('title', '<untitled>')} | "
                f"result={data.get('test_result') or 'Not Run'} | "
                f"{path.relative_to(self.project_root)}"
            )

    def run_one(self) -> None:
        config_path = self._choose_test()
        if config_path is None:
            return
        self.runner.run(config_path, confirm=True)

    def run_all(self) -> None:
        rows = self._load_test_rows()
        valid_paths: list[Path] = []
        for path, data in rows:
            if not validate_config(data, self.project_root):
                valid_paths.append(path)

        if not valid_paths:
            print("\nNo valid configured tests were found.")
            return

        print(f"\n{len(valid_paths)} valid test(s) will run.")
        answer = input("Continue? (y/n): ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Run-all cancelled.")
            return

        passed = 0
        failed = 0
        for index, path in enumerate(valid_paths, start=1):
            print(f"\n=== Running {index}/{len(valid_paths)}: {path.relative_to(self.project_root)} ===")
            code = self.runner.run(path, confirm=False)
            if code == 0:
                passed += 1
            else:
                failed += 1
        print(f"\nRun-all complete: {passed} passed, {failed} failed.")

    def validate_one(self) -> None:
        config_path = self._choose_test()
        if config_path is None:
            return
        try:
            data = load_config(config_path)
        except Exception as exc:
            print(f"\nCould not read JSON: {exc}")
            return
        errors = validate_config(data, self.project_root)
        if errors:
            print("\nValidation failed:")
            for error in errors:
                print(f"- {error}")
            return
        print("\nValidation successful.")
        print(self.runner.preview(data))

    def record(self) -> None:
        print("\nRecord a new test")
        title = input("Test title: ").strip()
        if not title:
            print("A title is required.")
            return

        default_url = self.settings.get("base_url", "")
        entered_url = input(f"Start URL [{default_url}]: ").strip()
        url = entered_url or default_url
        if not url:
            print("A start URL is required.")
            return

        folder = input("Test folder name (example: homepage): ").strip().strip("/\\")
        if not folder:
            print("A test folder is required.")
            return
        safe_name = folder.replace(" ", "_").replace("-", "_")
        output = f"tests/{folder}/test_{safe_name}.py"

        recorder = PlaywrightRecorder(self.project_root, self.settings)
        recorder.record(title=title, url=url, output=output, browser=self.settings.get("browser", "chromium"))

    def show_results(self) -> None:
        rows = self._load_test_rows()
        if not rows:
            print("\nNo configured tests were found.")
            return
        print("\nLatest results")
        print("-" * 72)
        for _, data in rows:
            print(f"{data.get('title', '<untitled>')}: {data.get('test_result') or 'Not Run'}")

    def run(self) -> int:
        project_name = self.settings.get("project_name", "Automation Framework")
        while True:
            print("\n" + "=" * 72)
            print(project_name)
            print("=" * 72)
            print("1. Run a test")
            print("2. Run all tests")
            print("3. Validate a test")
            print("4. Record a new test")
            print("5. View latest results")
            print("6. List configured tests")
            print("0. Exit")

            choice = input("\nChoose an option: ").strip()
            if choice == "1":
                self.run_one()
            elif choice == "2":
                self.run_all()
            elif choice == "3":
                self.validate_one()
            elif choice == "4":
                self.record()
            elif choice == "5":
                self.show_results()
            elif choice == "6":
                self.list_tests()
            elif choice == "0":
                print("Goodbye.")
                return 0
            else:
                print("Please choose a valid menu option.")
