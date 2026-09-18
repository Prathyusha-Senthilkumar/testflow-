import argparse
import sys
from pathlib import Path

from .config_loader import load_config, load_framework_config
from .menu import QAMenu
from .recorder import PlaywrightRecorder
from .runner import TestRunner
from .validator import validate_config

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def settings() -> dict:
    return load_framework_config(PROJECT_ROOT)


def find_configs() -> list[Path]:
    test_dir = settings().get("test_directory", "tests")
    return sorted((PROJECT_ROOT / test_dir).glob("**/data.json"))


def cmd_list(_: argparse.Namespace) -> int:
    configs = find_configs()
    if not configs:
        print("No configured tests found.")
        return 0
    print("\nConfigured tests:")
    for config in configs:
        try:
            data = load_config(config)
            print(f"- {data.get('title', '<untitled>')} | {config.relative_to(PROJECT_ROOT)} | result={data.get('test_result', '') or 'Not Run'}")
        except Exception as exc:
            print(f"- {config.relative_to(PROJECT_ROOT)} | invalid config: {exc}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    config = (PROJECT_ROOT / args.config).resolve()
    try:
        data = load_config(config)
    except Exception as exc:
        print(f"Could not read config: {exc}")
        return 2
    errors = validate_config(data, PROJECT_ROOT)
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 2
    print("Validation successful.")
    print(TestRunner(PROJECT_ROOT, settings()).preview(data))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    config = (PROJECT_ROOT / args.config).resolve()
    headed_override = True if args.headed else (False if args.headless else None)
    return TestRunner(PROJECT_ROOT, settings()).run(config, confirm=not args.yes, headed=headed_override)


def cmd_record(args: argparse.Namespace) -> int:
    cfg = settings()
    url = args.url or cfg.get("base_url")
    if not url:
        print("No URL supplied and config/framework.json has no base_url.")
        return 2
    exit_code, _error = PlaywrightRecorder(PROJECT_ROOT, cfg).record(
        title=args.title,
        url=url,
        output=args.output,
        browser=args.browser or cfg.get("browser", "chromium"),
    )
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Configurable Playwright testing framework")
    sub = parser.add_subparsers(dest="command")

    p_list = sub.add_parser("list", help="List configured tests")
    p_list.set_defaults(func=cmd_list)

    p_validate = sub.add_parser("validate", help="Validate a test before execution")
    p_validate.add_argument("--config", required=True, help="Relative path to the test data.json")
    p_validate.set_defaults(func=cmd_validate)

    p_run = sub.add_parser("run", help="Validate, preview, execute, and save Pass/Fail")
    p_run.add_argument("--config", required=True, help="Relative path to the test data.json")
    p_run.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")
    mode = p_run.add_mutually_exclusive_group()
    mode.add_argument("--headed", action="store_true", help="Show the browser for this run")
    mode.add_argument("--headless", action="store_true", help="Hide the browser for this run")
    p_run.set_defaults(func=cmd_run)

    p_record = sub.add_parser("record", help="Record actions and auto-create test metadata/docs")
    p_record.add_argument("--title", required=True, help="Human-readable test title")
    p_record.add_argument("--url", help="Starting URL; defaults to base_url in config/framework.json")
    p_record.add_argument("--output", required=True, help="Relative path for generated .py test")
    p_record.add_argument("--browser", choices=["chromium", "firefox", "webkit"], help="Override configured browser")
    p_record.set_defaults(func=cmd_record)
    return parser


def main() -> int:
    # No command = QA-friendly interactive mode.
    if len(sys.argv) == 1:
        return QAMenu(PROJECT_ROOT, settings()).run()

    args = build_parser().parse_args()
    if not hasattr(args, "func"):
        return QAMenu(PROJECT_ROOT, settings()).run()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
