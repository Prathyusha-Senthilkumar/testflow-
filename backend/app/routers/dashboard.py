from fastapi import APIRouter, Depends
from app.routers.projects import get_project_repository
from app.services.dashboard_service import DashboardService
from app.schemas.dashboard import DashboardData

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

def get_dashboard_service() -> DashboardService:
    repo = get_project_repository()
    return DashboardService(repo)

@router.get("", response_model=DashboardData)
@router.get("/", response_model=DashboardData, include_in_schema=False)
def get_dashboard(service: DashboardService = Depends(get_dashboard_service)):
    return service.get_overview()
