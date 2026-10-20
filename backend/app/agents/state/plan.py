"""Turn the tester's sentence into a short step list. The page is not attached."""

import re
from urllib.parse import urlparse

from app.agents.limits import PLAN_LIMITS, LimitReached, LoopState
from app.agents.openrouter import PLAN_SCHEMA, complete_json

_BLOCKED = ("delete", "pay", "purchase", "checkout", "wire", "transfer")

MAX_CASES = 10

SYSTEM = (
    "You write UI test plans. Return only the JSON object. "
    "Split the request into one case per thing that must be true. At most 10 cases. "
    "A list of names, labels, buttons, or results is several cases, even when it is one sentence. "
    "\"Check if Alpha, Beta, and Gamma are listed\" is three cases. Each expected is only that one visible name. "
    "Do not join those names into one expected string. "
    "Cases may share a path and the same steps. "
    "A single sequence that proves one result stays one case. "
    "name is a short test title. "
    "path must be copied exactly from the page list. Do not invent a path. "
    "Each step is one action: goto, click, fill, or press. "
    "target is the visible button, link, or field name. "
    "value is what to type, or an empty string. "
    "Do not include passwords. expected is the short visible text that proves that one case, not a sentence. "
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
    wanted = _norm(path)
    for page in pages:
        found = _norm(str(page.get("path") or ""))
        if found and found == wanted:
            return str(page["path"])
    raise PlanRejected("None of the pages matched. Choose one below.")


def plan(prompt: str, pages: list[dict], loop: LoopState, *, job_cost_cap: float) -> tuple[dict, LoopState]:
    usable = [page for page in pages if str(page.get("path") or "").strip()][:40]
    if not usable:
        raise PlanRejected("No pages were found. Open the app and check that this environment reaches it.")
    try:
        loop.check(PLAN_LIMITS, job_cost_cap=job_cost_cap)
    except LimitReached as exc:
        raise PlanRejected(exc.reason) from exc
    listing = "\n".join(f"{page['path']} — {str(page.get('name') or '').strip()}" for page in usable)
    parsed, spent = complete_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Pages:\n{listing}\n\n{prompt}"},
        ],
        PLAN_SCHEMA,
    )
    cases = build_cases(parsed, usable)
    loop.note("plan", spent)
    return {"cases": cases}, loop


def build_cases(parsed: dict, pages: list[dict]) -> list[dict]:
    """Keep up to 10 cases whose path was actually found. Drop the rest."""
    raw = parsed.get("cases")
    if not isinstance(raw, list):
        raw = [parsed] if parsed.get("path") else []
    chosen: list[dict] = []
    for item in raw:
        if len(chosen) >= MAX_CASES or not isinstance(item, dict):
            continue
        try:
            path = known_page(pages, str(item.get("path") or ""))
        except PlanRejected:
            continue
        steps = item.get("steps") if isinstance(item.get("steps"), list) else []
        expected = str(item.get("expected") or "").strip()
        if not steps and not expected:
            continue
        name = " ".join(str(item.get("name") or expected or "Agent test").split())[:80] or "Agent test"
        for label in _listed_names(expected) or [expected]:
            if len(chosen) >= MAX_CASES:
                break
            title = label if label != expected else name
            chosen.append({"name": title[:80] or name, "path": path, "steps": steps[:12], "expected": label})
    if not chosen:
        raise PlanRejected("None of the pages matched. Choose one below.")
    return chosen


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


def _norm(path: str) -> str:
    text = (path or "").strip()
    if not text:
        return ""
    trimmed = text.rstrip("/")
    return trimmed or "/"
