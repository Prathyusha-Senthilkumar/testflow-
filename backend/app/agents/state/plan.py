"""Turn the tester's sentence into a short step list. The page is not attached."""

from app.agents.limits import PLAN_LIMITS, LimitReached, LoopState
from app.agents.openrouter import PLAN_SCHEMA, complete_json

_BLOCKED = ("delete", "pay", "purchase", "checkout", "wire", "transfer")

SYSTEM = (
    "You write a short UI test plan. Return only the JSON object. "
    "Each step is one action: goto, click, fill, or press. "
    "target is the visible button, link, or field name. "
    "value is what to type, or an empty string. "
    "Do not include passwords. expected is the short visible text that proves the test passed, such as a name on the page, not a sentence."
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


def plan(prompt: str, start_path: str, loop: LoopState, *, job_cost_cap: float) -> tuple[dict, LoopState]:
    try:
        loop.check(PLAN_LIMITS, job_cost_cap=job_cost_cap)
    except LimitReached as exc:
        raise PlanRejected(exc.reason) from exc
    parsed, spent = complete_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Start path: {start_path or '/'}\n\n{prompt}"},
        ],
        PLAN_SCHEMA,
    )
    steps = parsed.get("steps") or []
    if not steps:
        raise PlanRejected("The plan had no steps.")
    loop.note("plan", spent)
    return {"steps": steps[:12], "expected": str(parsed.get("expected") or "").strip()}, loop
