import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://evolv-dev.revature.io/login?returnTo=%2F")
    page.get_by_role("textbox", name="Email").click()
    page.get_by_role("textbox", name="Email").fill("")
    page.get_by_role("textbox", name="Email").click()
    page.get_by_role("textbox", name="Email").fill("exaflow-admin@yopmail.com")
    page.get_by_role("button", name="Continue").click()
    page.get_by_role("textbox", name="Password").click()
    page.get_by_role("textbox", name="Password").fill("qubzav-keqdAg-buwva1")
    page.get_by_role("button", name="Sign in").click()
    page.get_by_role("link", name="Assessments").click()
    page.get_by_role("link", name="Question Bank").click()
    page.get_by_role("button", name="New question", description="New question").click()
    page.get_by_role("button", name="Continue to the question").click()
    page.get_by_role("textbox", name="Prompt").click()
    page.get_by_role("textbox", name="Prompt").fill("tyui")
    page.get_by_role("textbox", name="Choice A text").click()
    page.get_by_role("textbox", name="Choice A text").fill("1")
    page.get_by_role("textbox", name="Choice B text").click()
    page.get_by_role("textbox", name="Choice B text").fill("2")
    page.get_by_role("button", name="Save to bank").click()
