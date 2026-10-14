"""Build a pytest file from the DOM diary. Clicks do not go through the model."""

import json
import re

_SAFE = re.compile(r"[\r\n]+")


def _py(value: str) -> str:
    return json.dumps(_SAFE.sub(" ", value or ""))


def compile_script(start_url: str, diary: list[dict], expected: str) -> str:
    lines = [
        "import pytest",
        "from playwright.sync_api import Page, expect",
        "",
        "",
        "def test_agent(page: Page) -> None:",
        f"    page.goto({_py(start_url)})",
    ]
    for entry in diary:
        role = _py(str(entry.get("role") or "button"))
        name = _py(str(entry.get("name") or ""))
        action = entry.get("action")
        if action == "click":
            lines.append(f"    page.get_by_role({role}, name={name}).click()")
        elif action == "fill":
            lines.append(f"    page.get_by_role({role}, name={name}).fill({_py(str(entry.get('value') or ''))})")
        elif action == "press":
            lines.append(f"    page.get_by_role({role}, name={name}).press({_py(str(entry.get('value') or 'Enter'))})")
        elif action == "goto":
            url = str(entry.get("url") or "")
            if not url.startswith("http") or url.rstrip("/") == start_url.rstrip("/") or "%22" in url:
                continue
            lines.append(f"    page.goto({_py(url)})")
    if expected.strip():
        lines.append(f"    expect(page.get_by_text({_py(expected)})).to_be_visible()")
    lines.append("")
    return "\n".join(lines)
