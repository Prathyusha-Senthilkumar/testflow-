from app.repositories.project_repository import project_repository, ProjectRepository
from app.schemas.dashboard import DashboardData

class DashboardService:
    def __init__(self, repository: ProjectRepository = project_repository):
        self.repository = repository

    async def get_overview(self) -> DashboardData:
        projects_list = await self.repository.find_all()
        return DashboardData(
            projects=len(projects_list),
            testCases=sum(p.cases for p in projects_list),
            passed=sum(p.passed for p in projects_list),
            failed=sum(p.failed for p in projects_list),
            recentProjects=projects_list[:5],
        )

dashboard_service = DashboardService()
