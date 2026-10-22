"""Turn the tester's sentence into a short step list. The page is not attached."""

import re
from urllib.parse import urlparse

from app.agents.limits import PLAN_LIMITS, LimitReached, LoopState
from app.agents.openrouter import PLAN_SCHEMA, complete_json
from app.agents.state.routes import match_route, resolve_route, route_key

_BLOCKED = ("delete", "pay", "purchase", "checkout", "wire", "transfer")

MAX_CASES = 10

SYSTEM = (
    "You write UI test plans. Return only the JSON object. "
    "Split the request into one case per thing that must be true. At most 10 cases. "
    "A list of names, labels, buttons, or results is several cases, even when it is one sentence. "
    "\"Check if Alpha, Beta, and Gamma are listed\" is three cases. Each expected is only that one visible name. "
    "Do not join those names into one expected string. "
    "Cases may share a path and the same steps. "
    "Opening a page, using a field, and confirming the result is one case. Do not split that sequence. "
    "Split only a list of names, labels, or results. "
    "name is a short test title. "
    "path must be copied exactly from the page list. Do not invent a path. "
    "Each step is one action: goto, click, fill, or press. "
    "target must be copied from a control name or a page name in the list. Do not invent a button, field, or screen. "
    "value is what the user asked to type, or an empty string when they did not name the text. "
    "Do not include passwords. expected is empty unless that exact text is in the user request or in the control list. "
    "If the landing page is already the right page, use its path and do not add a goto."
)


class PlanRejected(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def intake(prompt: str) -> str:
    text = (prompt or "").strip()
    if not text:
        raise PlanRejected("Describe what to test.")
    if len(text) > 2000:
        raise PlanRejected("The description is too long.")
    lowered = text.lower()
    if any(word in lowered for word in _BLOCKED):
        raise PlanRejected("Delete and payment flows are not started by the agent.")
    return text


def known_page(pages: list[dict], path: str) -> str:
    """Return the discovered path that matches, or reject a path the browser did not find."""
    found = match_route(pages, path)
    if found:
        return found
    raise PlanRejected("None of the pages matched. Choose one below.")


def correction_brief(messages: list[dict], cases: list[dict]) -> str:
    """Later tester messages revise the current cases. The first message is the original request."""
    corrections = [str(item.get("text") or "").strip() for item in messages if item.get("role") == "user"][1:]
    corrections = [item for item in corrections if item]
    if not corrections:
        return ""
    lines = [
        "Current cases:",
    ]
    for case in cases:
        if not isinstance(case, dict):
            continue
        steps = case.get("steps") if isinstance(case.get("steps"), list) else []
        actions = "; ".join(
            " ".join(part for part in (str(step.get("action") or ""), str(step.get("target") or ""), str(step.get("value") or "")) if part).strip()
            for step in steps
            if isinstance(step, dict)
        )
        lines.append(f"- {case.get('name') or 'Case'}: {actions or 'no steps'}. Expected: {case.get('expected') or ''}")
    lines.append("Corrections from the tester, oldest first:")
    lines.extend(f"- {item}" for item in corrections[-6:])
    lines.append(
        "Change the current cases to match the latest correction. "
        "When the tester says these steps are one test case, return exactly one case and keep every step in order. "
        "Do not add a separate case for an earlier step of that sequence."
    )
    return "\n".join(lines)


def plan(
    prompt: str,
    pages: list[dict],
    loop: LoopState,
    *,
    job_cost_cap: float,
    revision: str = "",
) -> tuple[dict, LoopState]:
    usable = [page for page in pages if str(page.get("path") or "").strip()][:40]
    if not usable:
        raise PlanRejected("No pages were found. Open the app and check that this environment reaches it.")
    try:
        loop.check(PLAN_LIMITS, job_cost_cap=job_cost_cap)
    except LimitReached as exc:
        raise PlanRejected(exc.reason) from exc
    listing = _page_listing(usable, prompt)
    request = f"Pages:\n{listing}\n\n{prompt}"
    if revision.strip():
        request = f"{request}\n\n{revision.strip()}"
    parsed, spent = complete_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": request},
        ],
        PLAN_SCHEMA,
    )
    cases = build_cases(parsed, usable, prompt)
    loop.note("plan", spent)
    return {"cases": cases}, loop


def _page_listing(pages: list[dict], prompt: str = "") -> str:
    """List every screen. Include controls only for the landing page and screens the user named."""
    lines: list[str] = []
    detailed = 0
    asked = prompt.lower()
    for index, page in enumerate(pages):
        name = " ".join(str(page.get("name") or "").split())
        if len(name) > 60:
            continue
        path = str(page.get("path") or "").strip()
        lines.append(f"{path} — {name}")
        mentioned = bool(asked) and name.lower() in asked
        if detailed >= 6 or not (index == 0 or mentioned):
            continue
        detailed += 1
        shown = 0
        for control in page.get("controls") or []:
            if shown >= 8 or not isinstance(control, dict):
                continue
            label = " ".join(str(control.get("name") or "").split())
            role = str(control.get("role") or "").strip()
            if not label or len(label) > 40 or re.search(r"password|token|secret", label, re.IGNORECASE):
                continue
            lines.append(f"  {role}: {label}" if role else f"  {label}")
            shown += 1
    return "\n".join(lines)


def build_cases(parsed: dict, pages: list[dict], prompt: str = "") -> list[dict]:
    """Keep up to 10 cases whose path was actually found. Drop the rest."""
    raw = parsed.get("cases")
    if not isinstance(raw, list):
        raw = [parsed] if parsed.get("path") else []
    chosen: list[dict] = []
    for item in raw:
        if len(chosen) >= MAX_CASES or not isinstance(item, dict):
            continue
        path = resolve_route(pages, str(item.get("path") or ""), prompt)
        if not path:
            continue
        steps = _ground_steps(_usable_steps(item.get("steps") if isinstance(item.get("steps"), list) else [], pages, path), prompt)
        expected = _ground_expected(str(item.get("expected") or "").strip(), prompt, pages)
        if any(step.get("action") in {"fill", "press"} for step in steps):
            expected = _clear_screen_name(expected, pages)
        if not steps and not expected:
            continue
        name = " ".join(str(item.get("name") or expected or "Agent test").split())[:80] or "Agent test"
        for label in _listed_names(expected) or [expected]:
            if len(chosen) >= MAX_CASES:
                break
            title = label if label != expected else name
            chosen.append({"name": title[:80] or name, "path": path, "steps": steps, "expected": label})
    if not chosen:
        raise PlanRejected("None of the pages matched. Choose one below.")
    return _one_sequence(chosen)


def url_for_path(landing: str, path: str) -> str:
    """Join a discovered pathname onto the environment origin."""
    parsed = urlparse(landing)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    suffix = path if path.startswith("/") else f"/{path}"
    return origin + suffix


_LIST_SPLIT = re.compile(r"\s*(?:,|;|\band\b|&)\s*", re.IGNORECASE)
# A real sentence stays one case. A list of short names does not.
_SENTENCE = re.compile(
    r"\b(click|open|confirm|check|should|then|when|listed|shows|show|page|button|search|filter)\b",
    re.IGNORECASE,
)


def _listed_names(expected: str) -> list[str]:
    """Split an expected value that is only a list of visible names. Leave a sentence whole."""
    text = re.sub(r"\s+(?:are|is)\s+(?:listed|shown|visible)\.?$", "", expected.strip(), flags=re.IGNORECASE)
    parts = [part.strip(" .") for part in _LIST_SPLIT.split(text) if part.strip(" .")]
    if len(parts) < 2:
        return []
    if any(len(part) > 40 or len(part.split()) > 3 or _SENTENCE.search(part) for part in parts):
        return []
    return parts


def _one_sequence(cases: list[dict]) -> list[dict]:
    """Keep a list of names, or unrelated pages, as separate cases. Join a navigation and the search that follows it."""
    if len(cases) < 2 or not _follows(cases):
        return cases
    steps: list[dict] = []
    for item in cases:
        steps.extend(item["steps"])
    expected = next((str(item.get("expected") or "").strip() for item in reversed(cases) if str(item.get("expected") or "").strip()), "")
    return [{"name": cases[0]["name"], "path": cases[0]["path"], "steps": steps[:12], "expected": expected}]


def _follows(cases: list[dict]) -> bool:
    first = cases[0]["steps"]
    if all(item["steps"] == first for item in cases):
        return False
    paths = {str(cases[0].get("path") or "")}
    for step in first:
        if step.get("action") == "goto" and str(step.get("value") or "").startswith("/"):
            paths.add(str(step["value"]))
    for item in cases[1:]:
        actions = {str(step.get("action") or "") for step in item["steps"]}
        if str(item.get("path") or "") not in paths and not actions <= {"fill", "press"}:
            return False
    return True


def _ground_steps(steps: list[dict], prompt: str) -> list[dict]:
    """Drop a typed value the user did not ask for. Recording then uses text that is on the page."""
    grounded: list[dict] = []
    for step in steps:
        value = str(step.get("value") or "")
        if prompt and step.get("action") in {"fill", "press"} and value.strip() and value.lower() not in prompt.lower():
            value = ""
        grounded.append({**step, "value": value})
    return grounded


def _ground_expected(expected: str, prompt: str, pages: list[dict]) -> str:
    """Keep a result the user named or a control that was seen. Drop a title the model invented."""
    text = expected.strip()
    if not text or not prompt:
        return text
    if text.lower() in prompt.lower():
        return text
    names = [str(page.get("name") or "") for page in pages]
    for page in pages:
        names.extend(str(control.get("name") or "") for control in (page.get("controls") or []) if isinstance(control, dict))
    if any(text.lower() == " ".join(name.lower().split()) for name in names if name.strip()):
        return text
    return ""


def _clear_screen_name(expected: str, pages: list[dict]) -> str:
    """A search confirms the item that was typed. The screen title is not that item."""
    text = " ".join(expected.lower().split())
    if not text:
        return ""
    names = [" ".join(str(page.get("name") or "").lower().split()) for page in pages]
    return "" if text in names else expected.strip()


def _usable_steps(steps: list, pages: list[dict], start: str = "") -> list[dict]:
    """Open the link on the current page. A shared page name elsewhere does not compete with it."""
    cleaned: list[dict] = []
    current = start
    for step in steps:
        if len(cleaned) >= 12 or not isinstance(step, dict):
            continue
        action = str(step.get("action") or "").strip()
        target = " ".join(str(step.get("target") or "").split())
        value = str(step.get("value") or "").strip()
        if action == "click":
            found = _link_path(pages, current, target) or _path_for_label(pages, target)
            if found:
                action, target, value = "goto", found, found
        if action == "goto":
            raw = value if value.startswith("/") or value.startswith("http") else target
            if not raw.startswith("/") and not raw.startswith("http"):
                continue
            destination = match_route(pages, raw) or route_key(raw).split("?", 1)[0]
            if not destination.startswith("/"):
                continue
            target = destination
            value = destination
            current = destination.split("?", 1)[0]
        if action not in {"goto", "click", "fill", "press"}:
            continue
        cleaned.append({"action": action, "target": target, "value": value})
    return cleaned


def _link_path(pages: list[dict], current: str, label: str) -> str:
    wanted = " ".join(label.lower().split())
    if len(wanted) < 3 or not current:
        return ""
    paths: list[str] = []
    for page in pages:
        if _norm(str(page.get("path") or "")) != _norm(current):
            continue
        for control in page.get("controls") or []:
            if not isinstance(control, dict):
                continue
            name = " ".join(str(control.get("name") or "").lower().split())
            path = str(control.get("path") or "").strip()
            role = str(control.get("role") or "")
            if role in {"link", "tab"} and name == wanted and path.startswith("/"):
                paths.append(path)
    chosen = list(dict.fromkeys(paths))
    return chosen[0] if len(chosen) == 1 else ""


def _path_for_label(pages: list[dict], label: str) -> str:
    wanted = " ".join(label.lower().split())
    if len(wanted) < 3:
        return ""
    exact: list[str] = []
    partial: list[str] = []
    for page in pages:
        name = " ".join(str(page.get("name") or "").lower().split())
        path = str(page.get("path") or "").strip()
        if not name or not path.startswith("/"):
            continue
        if name == wanted:
            exact.append(path)
        elif len(name) >= 3 and (wanted in name or name in wanted):
            partial.append(path)
    chosen = list(dict.fromkeys(exact or partial))
    return chosen[0] if len(chosen) == 1 else ""


def _norm(path: str) -> str:
    return route_key(path)
