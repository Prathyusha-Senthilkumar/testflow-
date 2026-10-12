"""Run report as a PDF, built in pure Python (FastAPI never launches Chromium, ADR-008).

Same content as the browser's HTML report (frontend/src/lib/runReport.ts): run details,
each step with its screenshot and failure reason, and a summary.
"""

import re
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlparse

from fpdf import FPDF

_TEXT = (15, 23, 42)
_MUTED = (100, 116, 139)
_FAIL = (185, 28, 28)
_RULE = (226, 232, 240)


def friendly_step_label(raw: str) -> str:
    """Python port of frontend/src/lib/stepLabel.ts, so the PDF and GitHub issues read like the UI."""
    line = re.sub(r";$", "", re.sub(r"^await\s+", "", raw or "")).strip()
    if not line or re.fullmatch(r"final screenshot", line, re.I):
        return "Final screenshot"
    opened = re.search(r"page\.goto\(\s*[\"']([^\"']+)[\"']", line)
    if opened:
        url = urlparse(opened.group(1))
        if url.netloc:
            return f"Open {url.netloc}{'' if url.path in ('', '/') else url.path}"
        return f"Open {opened.group(1)}"
    role = re.search(r"getByRole\(\s*[\"']([^\"']+)[\"']\s*,\s*\{\s*name:\s*[\"']([^\"']+)[\"']", line)
    target = None
    if role:
        target = f"the {role.group(2)} {role.group(1)}"
    else:
        for pattern in (r"getByText", r"getByLabel", r"getByPlaceholder", r"locator"):
            found = re.search(pattern + r"\(\s*[\"']([^\"']+)[\"']", line)
            if found:
                target = found.group(1)
                break
    for method, verb in (("click", "Click"), ("dblclick", "Double-click"), ("hover", "Hover over"),
                         ("check", "Check"), ("uncheck", "Uncheck")):
        if f".{method}(" in line and target:
            return f"{verb} {target}"
    if ".fill(" in line:
        value = re.search(r"\.fill\(\s*[\"']([^\"']*)[\"']", line)
        if target and value:
            return f'Enter "{value.group(1)}" in {target}'
        if target:
            return f"Type into {target}"
    if ".press(" in line:
        key = re.search(r"\.press\(\s*[\"']([^\"']+)[\"']", line)
        if key and target:
            return f"Press {key.group(1)} in {target}"
        return f"Press {key.group(1)}" if key else "Press a key"
    if ".selectOption(" in line and target:
        return f"Choose an option in {target}"
    if "toHaveTitle(" in line:
        title = re.search(r"toHaveTitle\(\s*[\"']([^\"']+)[\"']", line)
        return f'Check the page title is "{title.group(1)}"' if title else "Check the page title"
    if len(line) <= 90 and not re.search(r"page\.|getBy|locator\(", line):
        return line
    return "Complete the next action"


def split_failure(message: str) -> tuple[str, Optional[str]]:
    lines = [line.rstrip() for line in (message or "").splitlines()]
    first = next((i for i, line in enumerate(lines) if line.strip()), 0)
    summary = (lines[first].strip() if lines else message.strip())[:500]
    rest = "\n".join(lines[first + 1:]).strip()
    return summary, rest or None


def _latin(text: str) -> str:
    """Core PDF fonts are Latin-1. Map common punctuation, drop the rest (and ANSI colour codes)."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", text or "")
    for src, dst in (("—", "-"), ("–", "-"), ("…", "..."), ("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("→", "->")):
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


def build_run_pdf(
    report: dict,
    steps: list[dict],
    image_path: Callable[[str], Optional[Path]],
    environment: Optional[str] = None,
) -> bytes:
    """`report` is a test_run_repository report row; `steps` its screenshot_steps entries."""
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    status = str(report.get("status") or "")
    failed = status.lower().startswith("fail")

    def text(value: str, size: float = 10, style: str = "", color=_TEXT, height: float = 5.5):
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(*color)
        pdf.multi_cell(width, height, _latin(value), new_x="LMARGIN", new_y="NEXT")

    def heading(value: str, size: float = 13):
        pdf.ln(3)
        text(value, size, "B", height=7)
        pdf.ln(1)

    text(report.get("testName") or "Test run", 18, "B", height=9)
    text(f"Attest execution report for run {report.get('id')}", 9, color=_MUTED)
    pdf.ln(4)

    failed_index = next((i for i, step in enumerate(steps) if step.get("failed")), -1)
    rows = [
        ("Test case", report.get("testName") or "-"),
        ("Project", report.get("projectName") or "-"),
        ("Suite", report.get("suiteName") or "-"),
        ("Run ID", str(report.get("id") or "-")),
        ("Executed", str(report.get("startedAt") or "-")),
        ("Environment", environment or "Not recorded for this run"),
        ("Result", status or "-"),
        ("Duration", _duration(report.get("durationMs"))),
    ]
    if failed_index >= 0:
        rows.append(("Failed at", f"Step {failed_index + 1} - {friendly_step_label(steps[failed_index].get('label', ''))}"))
    label_width = 34
    for label, value in rows:
        y = pdf.get_y()
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(*_MUTED)
        pdf.cell(label_width, 6.5, _latin(label))
        pdf.set_text_color(*(_FAIL if label == "Result" and failed else _TEXT))
        pdf.multi_cell(width - label_width, 6.5, _latin(value), new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*_RULE)
        pdf.line(pdf.l_margin, max(pdf.get_y(), y + 6.5), pdf.l_margin + width, max(pdf.get_y(), y + 6.5))

    error = str(report.get("errorMessage") or "").strip()
    if failed and error and failed_index < 0:
        summary, details = split_failure(error)
        heading("Failure reason")
        text(summary, color=_FAIL)
        if details:
            text(details, 8, color=_MUTED, height=4.2)

    for index, step in enumerate(steps):
        name = friendly_step_label(step.get("label", ""))
        heading(f"Step {index + 1} - {name}", 11.5)
        text(f"Status: {'Failed' if step.get('failed') else 'Completed'}", 9,
             color=_FAIL if step.get("failed") else _MUTED)
        path = image_path(str(step.get("file") or ""))
        if path is not None:
            try:
                pdf.ln(1)
                pdf.image(str(path), w=width)
            except Exception:  # a corrupt image must not lose the whole report
                text("Screenshot unavailable.", 9, color=_MUTED)
        else:
            text("Screenshot unavailable.", 9, color=_MUTED)
        if step.get("failed"):
            summary, details = split_failure(str(step.get("error") or "Step failed, but no failure details were provided."))
            pdf.ln(1)
            text(f"Failure reason: {summary}", 9.5, color=_FAIL)
            if details:
                text(details, 8, color=_MUTED, height=4.2)

    heading("Summary")
    failed_steps = sum(1 for step in steps if step.get("failed"))
    text(
        f"Result: {status or '-'}. Steps recorded: {len(steps)}. Failed steps: {failed_steps}. "
        f"Duration: {_duration(report.get('durationMs'))}."
    )
    return bytes(pdf.output())


def _duration(ms) -> str:
    if not isinstance(ms, (int, float)):
        return "-"
    seconds = ms / 1000
    return f"{seconds:.1f}s" if seconds < 60 else f"{int(seconds // 60)}m {int(seconds % 60)}s"


def report_file_name(report: dict) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(report.get("testName") or "test").lower()).strip("-")[:40]
    return f"Attest_{slug or 'run'}_{str(report.get('id') or '')[:8]}.pdf"
