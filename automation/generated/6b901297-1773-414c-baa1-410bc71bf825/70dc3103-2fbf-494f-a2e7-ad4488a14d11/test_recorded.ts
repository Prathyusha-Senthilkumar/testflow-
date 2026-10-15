import pytest
import re
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    return {"storage_state": "C:/sf/testflow-/automation/auth-profiles/6b901297-1773-414c-baa1-410bc71bf825/auth-1790159757408/storage_state.3d8ede1bb7f6482d81689ea8c0fc47ed.tmp.json"}


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/reports")
    page.get_by_role("button", name="New report").click()
    page.get_by_role("button", name="Continue").click()
    page.get_by_role("textbox", name="Name").click()
    page.get_by_role("textbox", name="Name").fill("abcd")
    page.get_by_role("textbox", name="Name").press("Tab")
    page.get_by_role("textbox", name="Description").fill("abcd")
    page.get_by_role("button", name="Save").click()
