from app.agents.limits import PLAN_LIMITS, LimitReached, LoopState
from app.agents.state.plan import PlanRejected, build_cases, correction_brief, intake, known_page, url_for_path
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


def test_a_full_url_matches_the_discovered_route():
    from app.agents.state.routes import route_key

    pages = [{"name": "Content Lake", "path": "/admin/content"}, {"name": "Home", "path": "/admin"}]
    assert known_page(pages, "https://evolv-dev.revature.io/admin/content") == "/admin/content"
    assert known_page(pages, "evolv-dev.revature.io/admin/content/") == "/admin/content"
    assert known_page(pages, "//evolv-dev.revature.io/admin/content#filters") == "/admin/content"
    assert known_page(pages, "https://evolv-dev.revature.io/admin/content?utm_source=email") == "/admin/content"
    assert route_key("admin/content") == "/admin/content"
    chosen_from_prompt = build_cases(
        {
            "cases": [
                {
                    "name": "Open Content Lake",
                    "path": "/missing",
                    "steps": [{"action": "goto", "target": "/admin/content", "value": "/admin/content"}],
                    "expected": "",
                }
            ]
        },
        pages,
        "Content lake route: <https://evolv-dev.revature.io/admin/content>",
    )
    assert chosen_from_prompt[0]["path"] == "/admin/content"
    chosen = build_cases(
        {
            "cases": [
                {
                    "name": "Open Content Lake",
                    "path": "https://evolv-dev.revature.io/admin/content/",
                    "steps": [
                        {
                            "action": "goto",
                            "target": "https://evolv-dev.revature.io/admin/content",
                            "value": "https://evolv-dev.revature.io/admin/content",
                        }
                    ],
                    "expected": "",
                }
            ]
        },
        pages,
        "Open Content Lake",
    )
    assert chosen[0]["path"] == "/admin/content"
    assert chosen[0]["steps"][0]["value"] == "/admin/content"


def test_path_must_be_one_the_browser_found():
    pages = [{"name": "Curricula", "path": "/admin/curricula"}, {"name": "Home", "path": "/admin"}]
    assert known_page(pages, "/admin/curricula/") == "/admin/curricula"
    assert url_for_path("https://example.test/admin", "/admin/curricula") == "https://example.test/admin/curricula"
    try:
        known_page(pages, "/missing")
        raise AssertionError("unknown path should fail")
    except PlanRejected:
        pass


def test_a_listed_expected_becomes_one_case_per_name():
    pages = [{"name": "Curricula", "path": "/admin/curricula"}]
    parsed = {
        "cases": [
            {
                "name": "Names are listed",
                "path": "/admin/curricula",
                "steps": [{"action": "click", "target": "Curricula", "value": ""}],
                "expected": "curr, curr-1, and java are listed",
            }
        ]
    }
    chosen = build_cases(parsed, pages)
    assert [item["expected"] for item in chosen] == ["curr", "curr-1", "java"]
    assert [item["name"] for item in chosen] == ["curr", "curr-1", "java"]
    assert all(item["steps"] == [{"action": "goto", "target": "/admin/curricula", "value": "/admin/curricula"}] for item in chosen)


def test_a_sentence_expected_stays_one_case():
    pages = [{"name": "Curricula", "path": "/admin/curricula"}]
    chosen = build_cases(
        {"cases": [{"name": "Search", "path": "/admin/curricula", "steps": [], "expected": "Search, then confirm Algebra is listed"}]},
        pages,
    )
    assert len(chosen) == 1
    assert chosen[0]["expected"] == "Search, then confirm Algebra is listed"


def test_one_prompt_keeps_several_cases_and_drops_unknown_paths():
    pages = [{"name": "Curricula", "path": "/admin/curricula"}, {"name": "Home", "path": "/admin"}]
    parsed = {
        "cases": [
            {"name": "Algebra is listed", "path": "/admin/curricula", "steps": [], "expected": "Algebra"},
            {"name": "Missing", "path": "/nope", "steps": [], "expected": "Missing"},
            {"name": "Home loads", "path": "/admin", "steps": [{"action": "click", "target": "Board", "value": ""}], "expected": "Board"},
        ]
    }
    chosen = build_cases(parsed, pages)
    assert [item["name"] for item in chosen] == ["Algebra is listed", "Home loads"]
    assert len(build_cases({"cases": [{"name": f"Case {i}", "path": "/admin", "steps": [], "expected": "Board"} for i in range(12)]}, pages)) == 10
    try:
        build_cases({"cases": [{"name": "Missing", "path": "/nope", "steps": [], "expected": "Missing"}]}, pages)
        raise AssertionError("no matching page should fail")
    except PlanRejected:
        pass


def test_the_listing_shows_controls_on_the_named_screen():
    from app.agents.state.plan import _page_listing

    text = _page_listing(
        [
            {"name": "Admin Dashboard", "path": "/admin", "controls": [{"role": "link", "name": "Content Lake"}]},
            {"name": "Content Lake", "path": "/admin/content", "controls": [{"role": "textbox", "name": "Search courses"}]},
            {"name": "Assessments", "path": "/admin/assessments", "controls": [{"role": "button", "name": "New assessment"}]},
        ],
        "Open Content Lake from the admin dashboard",
    )
    assert "Search courses" in text
    assert "Content Lake" in text
    assert "New assessment" not in text


def test_an_invented_result_is_dropped():
    pages = [{"name": "Content Lake", "path": "/admin/content", "controls": [{"role": "textbox", "name": "Filter by title"}]}]
    chosen = build_cases(
        {
            "cases": [
                {
                    "name": "Search Content Lake",
                    "path": "/admin/content",
                    "steps": [{"action": "fill", "target": "Filter by title", "value": "Sample"}],
                    "expected": "Sample Content",
                }
            ]
        },
        pages,
        "Search the Content Lake",
    )
    assert chosen[0]["expected"] == ""
    assert chosen[0]["steps"][0]["value"] == ""


def test_a_sequence_stays_one_case():
    pages = [{"name": "Content Lake", "path": "/admin/content"}, {"name": "Home", "path": "/admin"}]
    chosen = build_cases(
        {
            "cases": [
                {
                    "name": "Open Content Lake",
                    "path": "/admin",
                    "steps": [{"action": "click", "target": "Content Lake", "value": ""}],
                    "expected": "Content Lake",
                },
                {
                    "name": "Search",
                    "path": "/admin/content",
                    "steps": [{"action": "fill", "target": "Search", "value": "Algebra"}],
                    "expected": "Algebra",
                },
            ]
        },
        pages,
    )
    assert len(chosen) == 1
    assert chosen[0]["expected"] == "Algebra"
    assert [step["action"] for step in chosen[0]["steps"]] == ["goto", "fill"]


def test_a_duplicate_page_name_uses_the_link_on_this_screen():
    pages = [
        {
            "name": "Admin Dashboard",
            "path": "/admin",
            "controls": [{"role": "link", "name": "Content Lake", "path": "/admin/content"}],
        },
        {"name": "Content Lake", "path": "/admin/content"},
        {"name": "Content Lake", "path": "/admin/content-factory/library"},
    ]
    chosen = build_cases(
        {
            "cases": [
                {
                    "name": "Open Content Lake",
                    "path": "/admin",
                    "steps": [
                        {"action": "click", "target": "Content Lake", "value": ""},
                        {"action": "fill", "target": "Search courses", "value": ""},
                    ],
                    "expected": "Content Lake",
                }
            ]
        },
        pages,
        "On the admin dashboard, click Content Lake and search",
    )
    assert chosen[0]["steps"][0] == {"action": "goto", "target": "/admin/content", "value": "/admin/content"}
    assert chosen[0]["expected"] == ""


def test_a_click_on_a_known_page_opens_that_path():
    pages = [{"name": "Content Lake", "path": "/admin/content"}, {"name": "Home", "path": "/admin"}]
    chosen = build_cases(
        {
            "cases": [
                {
                    "name": "Search Content Lake",
                    "path": "/admin",
                    "steps": [
                        {"action": "goto", "target": "", "value": ""},
                        {"action": "click", "target": "Content Lake", "value": ""},
                        {"action": "fill", "target": "Search", "value": "word"},
                    ],
                    "expected": "word",
                }
            ]
        },
        pages,
    )
    assert chosen[0]["steps"] == [
        {"action": "goto", "target": "/admin/content", "value": "/admin/content"},
        {"action": "fill", "target": "Search", "value": "word"},
    ]


def test_a_follow_up_asks_for_one_case():
    brief = correction_brief(
        [
            {"role": "user", "text": "Open Content Lake and search."},
            {"role": "assistant", "text": "2 test cases."},
            {"role": "user", "text": "That is one test case."},
        ],
        [
            {"name": "Open Content Lake", "steps": [{"action": "click", "target": "Content Lake", "value": ""}], "expected": "Content Lake"},
            {"name": "Search", "steps": [{"action": "fill", "target": "Search", "value": "word"}], "expected": "word"},
        ],
    )
    assert "That is one test case." in brief
    assert "return exactly one case" in brief
    assert "Open Content Lake" in brief
    assert correction_brief([{"role": "user", "text": "Only the first request."}], []) == ""


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
