from typing import List

from fastapi import APIRouter, HTTPException

from app.services.container_service import list_execution_containers

router = APIRouter(prefix="/containers", tags=["Containers"])


@router.get("")
async def list_containers() -> List[dict]:
    """List Docker containers named testflow-exec-*."""
    return await list_execution_containers()


@router.get("/{execution_id}")
async def get_container(execution_id: str) -> dict:
    containers = await list_execution_containers(execution_id=execution_id)
    if not containers:
        raise HTTPException(status_code=404, detail=f"No container found for execution '{execution_id}'")
    return containers[0]
