import pytest
import re
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    return {"storage_state": "C:/sf/testflow-/automation/auth-profiles/6b901297-1773-414c-baa1-410bc71bf825/auth-1790159757408/storage_state.3f692930b2284e22a96a147e802f2afa.tmp.json"}


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/tenants")
    page.get_by_role("button", name="Delete Demo Tenant").click()
    page.get_by_role("button", name="Delete").click()
