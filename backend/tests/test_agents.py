from app.agents.limits import PLAN_LIMITS, LimitReached, LoopState
from app.agents.state.plan import PlanRejected, intake
from app.agents.state.record import Control, match_step
from app.agents.state.script import compile_script


def test_intake_blocks_payment_and_empty():
    try:
        intake("   ")
        raise AssertionError("empty prompt should fail")
    except PlanRejected:
        pass
    try:
        intake("pay the invoice")
        raise AssertionError("payment should fail")
    except PlanRejected:
        pass
    assert intake("Create a curriculum named Algebra") == "Create a curriculum named Algebra"


def test_match_is_exact_or_ambiguous():
    controls = [Control("button", "Save"), Control("button", "Save"), Control("link", "Tenants")]
    assert match_step("click", "Tenants", controls).control == controls[2]
    assert match_step("click", "Save", controls).control is None
    assert len(match_step("click", "Save", controls).ambiguous) == 2


def test_script_uses_the_diary_names():
    source = compile_script(
        "https://example.test/admin",
        [{"action": "click", "role": "link", "name": "Tenants", "value": ""}],
        "Algebra is listed",
    )
    assert 'get_by_role("link", name="Tenants")' in source
    assert "Algebra is listed" in source


def test_plan_loop_stops_on_repeat():
    loop = LoopState()
    loop.note("plan", 0)
    loop.note("plan", 0)
    loop.note("plan", 0)
    try:
        loop.check(PLAN_LIMITS, job_cost_cap=0.5)
        raise AssertionError("repeat should stop the loop")
    except LimitReached as exc:
        assert exc.reason == "repeat limit"
