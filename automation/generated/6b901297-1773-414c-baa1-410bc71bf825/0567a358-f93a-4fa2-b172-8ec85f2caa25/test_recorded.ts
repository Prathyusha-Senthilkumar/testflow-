import pytest
import re
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    return {"storage_state": "C:/sf/testflow-/automation/auth-profiles/6b901297-1773-414c-baa1-410bc71bf825/auth-1791470933283/storage_state.4c4f9578400748698561c2c7966e6769.tmp.json"}


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/projects")
    page.get_by_role("button", name="New Project").click()
    page.get_by_role("link", name="Milestone project Start from").click()
