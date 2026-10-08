from fastapi import APIRouter, Depends

from app.repositories.worker_status_repository import batch_queue_depth_repository, worker_status_repository
from app.schemas.worker import WorkerStatus, WorkersResponse
from app.services.worker_status_service import WorkerStatusService

router = APIRouter(prefix="/workers", tags=["workers"])

_service = WorkerStatusService(worker_status_repository, batch_queue_depth_repository)


def get_worker_status_service() -> WorkerStatusService:
    return _service


@router.get("", response_model=WorkersResponse)
@router.get("/", response_model=WorkersResponse, include_in_schema=False)
def list_workers(service: WorkerStatusService = Depends(get_worker_status_service)):
    return service.overview()


@router.get("/{worker_id}", response_model=WorkerStatus)
def get_worker(worker_id: str, service: WorkerStatusService = Depends(get_worker_status_service)):
    return service.worker(worker_id)
