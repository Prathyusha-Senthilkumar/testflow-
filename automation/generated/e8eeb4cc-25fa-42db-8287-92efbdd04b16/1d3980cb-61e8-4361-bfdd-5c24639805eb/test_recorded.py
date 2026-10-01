import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://www.srmist.edu.in/admissions/")
    page.get_by_role("link", name="Admissions 2026", exact=True).click()
