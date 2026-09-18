import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://www.srmist.edu.in/faculty-gateway/")
    page.get_by_role("button", name="Faculty search").click()
