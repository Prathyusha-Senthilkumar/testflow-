import os

import pytest


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    args = {
        **browser_context_args,
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36 TestFlow/1.0"
        ),
        "viewport": {"width": 1280, "height": 720},
    }
    # The worker runs this harness. The repo-root conftest is not in that image,
    # and this closer fixture overrides it, so the Admin session has to be applied here.
    storage = (os.environ.get("TESTFLOW_STORAGE_STATE") or "").strip()
    if storage:
        args["storage_state"] = storage
    return args
