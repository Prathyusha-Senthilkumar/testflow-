from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Liveness only. Public, so it must not reveal configuration or data."""
    return {"status": "ok"}
