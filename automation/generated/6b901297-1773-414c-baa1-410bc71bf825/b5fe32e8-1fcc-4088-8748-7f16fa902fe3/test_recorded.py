import pytest
from playwright.sync_api import Page, expect


def test_agent(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/assessments")
    expect(page.get_by_text("Custom MCQ")).to_be_visible()
