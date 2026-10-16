import pytest
from playwright.sync_api import Page, expect


def test_agent(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/admin/curricula")
    expect(page.get_by_text("java")).to_be_visible()
