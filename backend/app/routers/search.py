from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.repositories.search_repository import search_repository
from app.schemas.search import DEFAULT_LIMIT, MAX_LIMIT, SearchResponse, SearchScope
from app.services.search_service import SearchService

router = APIRouter(prefix="/search", tags=["search"])

_service = SearchService(search_repository)


def get_search_service() -> SearchService:
    return _service


@router.get("", response_model=SearchResponse)
@router.get("/", response_model=SearchResponse, include_in_schema=False)
def search(
    q: str = Query("", description="Search text; at least 2 characters after trimming."),
    type: SearchScope = Query("all"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    project_id: Optional[str] = Query(None, alias="projectId"),
    service: SearchService = Depends(get_search_service),
):
    return service.search(q, type, limit, project_id)
