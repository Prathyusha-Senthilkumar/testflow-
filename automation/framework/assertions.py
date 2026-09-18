from playwright.sync_api import Page, expect


def run_assertions(page: Page, assertions: list[dict]) -> None:
    for index, assertion in enumerate(assertions, start=1):
        assertion_type = assertion.get("type")
        value = (assertion.get("value") or "").strip()
        if not value:
            raise AssertionError(f"ASSERT [{index}]: expected value is required")

        if assertion_type == "url_contains":
            if value not in page.url:
                raise AssertionError(
                    f"ASSERT url_contains [{index}]: expected '{value}' in URL, got '{page.url}'"
                )
        elif assertion_type == "page_title_contains":
            title = page.title()
            if value not in title:
                raise AssertionError(
                    f"ASSERT page_title_contains [{index}]: expected '{value}' in title, got '{title}'"
                )
        elif assertion_type == "text_visible":
            expect(page.get_by_text(value, exact=False).first).to_be_visible(timeout=10_000)
        else:
            raise AssertionError(f"ASSERT [{index}]: unsupported assertion type '{assertion_type}'")
