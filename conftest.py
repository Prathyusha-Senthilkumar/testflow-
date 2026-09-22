import os
import pytest


@pytest.fixture(scope="session")
def browser_type_launch_args():
    return {"headless": True}


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    storage = (os.environ.get("TESTFLOW_STORAGE_STATE") or "").strip()
    if storage:
        return {**browser_context_args, "storage_state": storage}
    return browser_context_args
