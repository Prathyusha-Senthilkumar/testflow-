import pytest
import re
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    return {"storage_state": "C:/sf/testflow-/automation/auth-profiles/6b901297-1773-414c-baa1-410bc71bf825/auth-1791470933283/storage_state.a5c0b67ffe5f48099f4b8258d768cfcc.tmp.json"}


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/tenants")
    page.get_by_role("paragraph").filter(has_text="Tenants").click()
    page.get_by_role("button", name="New tenant").click()
    page.get_by_role("textbox", name="Organization name").click()
    page.get_by_role("textbox", name="Organization name").fill("test tenant")
    page.get_by_role("radio", name="Company").click()
    page.get_by_role("button", name="Create").click()
