"""Automation-local entry point. The root run_tests.py is kept for compatibility."""
from automation.framework.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
