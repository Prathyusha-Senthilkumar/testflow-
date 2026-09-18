import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://www.srmist.edu.in/admissions/")
    page.get_by_role("link", name="Admissions 2026").click()
    page.get_by_role("link", name="Admissions 2026").click()
    page.locator("#sm-1789732759824675-2").get_by_role("link", name="Admissions India").click()
    page.get_by_role("link", name="Admissions").click()
    page.get_by_role("link", name="Admissions India").click()
