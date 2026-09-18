from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import APIRouter
import logging

from app.config import settings
from app.routers.dashboard import router as dashboard_router
from app.routers.projects import router as projects_router
from app.routers.crawler import router as crawler_router
from app.routers.auth_profiles import router as auth_profiles_router
from app.routers.executions import router as executions_router
from app.routers.results import router as results_router
from app.routers.internal_worker import router as internal_worker_router
from app.routers.health import router as health_router
from app.routers.containers import router as containers_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("testflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TestFlow API ready (execution worker runs as a standalone Node.js process).")
    yield
    logger.info("TestFlow API shutting down.")


app = FastAPI(
    title="TestFlow API",
    description="Python FastAPI backend for TestFlow QA Automation platform (Auth Profiles, Queue, Results). Playwright execution is handled by the Node.js worker.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", []) if str(x) not in ("body",)]
        field_name = loc[-1] if loc else "field"
        msg = err.get("msg", "Invalid value")
        messages.append(f"{field_name}: {msg}")

    message_str = ", ".join(messages) if messages else "Invalid input"
    return JSONResponse(
        status_code=400,
        content={"message": message_str},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": str(exc) or "Internal server error"},
    )

api_router = APIRouter(prefix="/api")
api_router.include_router(dashboard_router)
api_router.include_router(projects_router)
api_router.include_router(crawler_router)
api_router.include_router(auth_profiles_router)
api_router.include_router(executions_router)
api_router.include_router(results_router)
api_router.include_router(internal_worker_router)
api_router.include_router(health_router)
api_router.include_router(containers_router)

app.include_router(api_router)

app.include_router(auth_profiles_router)
app.include_router(executions_router)
app.include_router(results_router)

@app.get("/")
def root():
    return {"message": "TestFlow API is running"}
