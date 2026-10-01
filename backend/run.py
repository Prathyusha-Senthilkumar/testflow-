import uvicorn

from app.config import settings

if __name__ == "__main__":
    # Single process on Windows avoids duplicate :PORT listeners from reload parent/worker pairs.
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=False)
