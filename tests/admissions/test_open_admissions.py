import re

from playwright.sync_api import Page, expect


def test_example_domain_title(page: Page) -> None:
    page.goto("https://example.com")
    expect(page).to_have_title(re.compile(r"Example Domain"))
