from app.repositories.project_repository import ProjectRepository
from app.schemas.dashboard import DashboardData

class DashboardService:
    def __init__(self, repository: ProjectRepository):
        self.repository = repository

    def get_overview(self) -> DashboardData:
        recent_projects = self.repository.find_all()
        return DashboardData(
            projects=len(recent_projects),
            testCases=sum(p.cases for p in recent_projects),
            passed=sum(p.passed for p in recent_projects),
            failed=sum(p.failed for p in recent_projects),
            recentProjects=recent_projects[:5],
        )
