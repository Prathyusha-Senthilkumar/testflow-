import re
from typing import List
from urllib.parse import urlparse
from app.schemas.crawler import DiscoveredPage, GeneratedSuite, GeneratedCase


class TestGeneratorService:
    def __init__(self):
        pass

    def _slugify(self, text: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9_]+", "_", text).strip("_")
        return slug.lower() or "page"

    def generate_tests_from_crawled_pages(self, pages: List[DiscoveredPage]) -> List[GeneratedSuite]:
        """
        Translates crawled pages and interactive elements into structured Test Suites and Cases.
        """
        suites: List[GeneratedSuite] = []

        # 1. Main Availability & Smoke Suite
        smoke_cases: List[GeneratedCase] = []
        for i, page in enumerate(pages):
            parsed = urlparse(page.url)
            path_name = parsed.path.strip("/") or "home"
            smoke_cases.append(
                GeneratedCase(
                    name=f"Verify {page.title[:30]} Loads (HTTP 200)",
                    code=f"TC-SMOKE-{i+1:03d}",
                    description=f"Ensures that {page.url} is accessible, responds with a valid status code, and renders without critical crashes.",
                    test_file=f"tests/automated/test_smoke_{self._slugify(path_name)}.py"
                )
            )

        suites.append(
            GeneratedSuite(
                name="Automated Smoke & Availability Suite",
                cases=smoke_cases
            )
        )

        # 2. Form Validation & Interaction Suite (if any pages contain forms)
        form_pages = [p for p in pages if p.forms]
        if form_pages:
            form_cases: List[GeneratedCase] = []
            case_idx = 1
            for page in form_pages:
                parsed = urlparse(page.url)
                path_name = parsed.path.strip("/") or "form_page"
                for f_idx, form in enumerate(page.forms):
                    required_inputs = [inp.name or inp.placeholder for inp in form.inputs if inp.required]
                    desc = f"Checks form #{f_idx+1} at {page.url}."
                    if required_inputs:
                        desc += f" Asserts validation errors when required fields ({', '.join(required_inputs[:3])}) are empty."
                    else:
                        desc += " Asserts form inputs can be focused and submit button functions."

                    form_cases.append(
                        GeneratedCase(
                            name=f"Validate Form on {page.title[:25]}",
                            code=f"TC-FORM-{case_idx:03d}",
                            description=desc,
                            test_file=f"tests/automated/test_form_{self._slugify(path_name)}_{f_idx+1}.py"
                        )
                    )
                    case_idx += 1

            if form_cases:
                suites.append(
                    GeneratedSuite(
                        name="Automated Form & Input Validation Suite",
                        cases=form_cases
                    )
                )

        # 3. Interactive UI & Navigation Suite (if action buttons found)
        action_pages = [p for p in pages if p.buttons]
        if action_pages:
            action_cases: List[GeneratedCase] = []
            for i, page in enumerate(action_pages[:5]):
                button_samples = ", ".join(f"'{b}'" for b in page.buttons[:3])
                action_cases.append(
                    GeneratedCase(
                        name=f"Button Interactivity - {page.title[:25]}",
                        code=f"TC-UI-{i+1:03d}",
                        description=f"Verifies key action buttons ({button_samples}) are visible, clickable, and responsive.",
                        test_file=f"tests/automated/test_ui_{self._slugify(urlparse(page.url).path or 'home')}.py"
                    )
                )

            suites.append(
                GeneratedSuite(
                    name="UI Controls & Button Interactivity Suite",
                    cases=action_cases
                )
            )

        return suites


test_generator_service = TestGeneratorService()
