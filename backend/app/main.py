from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import APIRouter

from app.config import settings
from app.routers.dashboard import router as dashboard_router
from app.routers.projects import router as projects_router
from app.routers.crawler import router as crawler_router
from app.routers.test_cases import router as test_cases_router
from app.routers.environments import router as environments_router
from app.routers.test_suites import router as test_suites_router

app = FastAPI(
    title="TestFlow API",
    description="Python FastAPI backend for TestFlow QA Automation platform",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers for frontend compatibility ({ "message": "..." })
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

# Routers with /api prefix
api_router = APIRouter(prefix="/api")
api_router.include_router(dashboard_router)
api_router.include_router(projects_router)
api_router.include_router(crawler_router)
api_router.include_router(test_cases_router)
api_router.include_router(environments_router)
api_router.include_router(test_suites_router)

app.include_router(api_router)

@app.get("/")
def root():
    return {"message": "TestFlow API is running"}
