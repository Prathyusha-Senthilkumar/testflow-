import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://www.srmist.edu.in/")
    page.get_by_role("link", name="Academics").click()
    page.get_by_label("Academics").get_by_role("link", name="Engineering & Technology").click()
    page.get_by_role("button", name="More on FET").click()
