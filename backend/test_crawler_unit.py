import asyncio
from app.schemas.crawler import AuthConfig, DiscoveredPage, FormInfo, FormInputInfo
from app.services.test_generator_service import test_generator_service
from app.repositories.project_repository import ProjectRepository

def test_unit_generator_and_repo():
    print("Testing TestGeneratorService with mock discovered pages...")
    mock_pages = [
        DiscoveredPage(
            url="https://example.com",
            title="Example Homepage",
            status_code=200,
            forms=[
                FormInfo(
                    action="/search",
                    method="POST",
                    inputs=[
                        FormInputInfo(name="q", type="text", placeholder="Search query", required=True)
                    ],
                    has_submit=True
                )
            ],
            buttons=["Search", "Explore"],
            links=["https://example.com/about", "https://example.com/contact"],
            depth=0
        ),
        DiscoveredPage(
            url="https://example.com/about",
            title="About Us",
            status_code=200,
            forms=[],
            buttons=["Contact Us"],
            links=[],
            depth=1
        )
    ]

    suites = test_generator_service.generate_tests_from_crawled_pages(mock_pages)
    print(f"Generated {len(suites)} suites:")
    for s in suites:
        print(f" - Suite: '{s.name}' ({len(s.cases)} cases)")
        for c in s.cases:
            print(f"     * [{c.code}] {c.name}")

    assert len(suites) >= 2, "Should generate at least Smoke suite and Form/UI suite"
    assert any("Smoke" in s.name for s in suites)
    assert any("Form" in s.name for s in suites)

    print("\nTesting ProjectRepository saving generated suites...")
    repo = ProjectRepository()
    repo.save_generated_suites("demo-project", suites)
    project = repo.find_by_id("demo-project")
    print(f"Updated demo project: {project.name}, total suites: {project.suites}, total cases: {project.cases}")
    assert project.suites > 3
    assert project.cases > 3

    print("\n[SUCCESS] Unit test for Generator and Repository passed!")

if __name__ == "__main__":
    test_unit_generator_and_repo()
