import pytest
import re
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    return {"storage_state": "C:/sf/testflow-/automation/auth-profiles/6b901297-1773-414c-baa1-410bc71bf825/auth-1790159757408/storage_state.json"}


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/curricula")
    page.get_by_role("textbox", name="Search curricula").click()
    page.get_by_role("link", name="java Hire-train-deploy Active AI Instructor-led 12w · Sep 22, 2026 Data Science").click()
