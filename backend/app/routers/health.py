from fastapi import APIRouter

from app.models.worker import WorkerStatusDto
from app.services.worker_registry import worker_registry

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "testflow-api"}


@router.get("/worker/status", response_model=WorkerStatusDto)
async def worker_status():
    return worker_registry.snapshot()
