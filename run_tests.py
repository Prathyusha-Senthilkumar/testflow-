"""Backward-compatible entry point for the Python Playwright framework."""
from automation.framework.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
