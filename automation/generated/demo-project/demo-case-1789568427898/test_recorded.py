import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://www.srmist.edu.in/")
    page.get_by_role("link", name="Academics").click()
    page.get_by_role("link", name="Academics").click()
    page.get_by_label("Academics").get_by_role("link", name="Science & Humanities").click()
    with page.expect_popup() as page1_info:
        page.get_by_role("button", name="Science & Humanitites UG").click()
    page1 = page1_info.value
    with page.expect_popup() as page2_info:
        page.get_by_role("button", name="B.S Admissions").click()
    page2 = page2_info.value
    with page.expect_popup() as page3_info:
        page.get_by_role("button", name="Science & Humanitites PG").click()
    page3 = page3_info.value
