import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import APIRouter

from app.config import settings
from app.middleware.request_id import REQUEST_ID_HEADER, RequestIdMiddleware, request_id_of
from app.routers.dashboard import router as dashboard_router
from app.routers.projects import router as projects_router
from app.routers.crawler import router as crawler_router
from app.routers.test_cases import router as test_cases_router
from app.routers.environments import router as environments_router
from app.routers.test_suites import router as test_suites_router
from app.routers.executions import router as executions_router
from app.routers.test_runs import router as test_runs_router
from app.routers.test_runs import signed_router as test_runs_signed_router
from app.routers.auth_profiles import router as auth_profiles_router
from app.routers.account import public_router as account_public_router
from app.routers.account import router as account_router
from app.routers.health import router as health_router
from app.routers.search import router as search_router
from app.routers.notifications import router as notifications_router
from app.routers.workers import router as workers_router
from app.dependencies.auth import auth_bypass_enabled, require_user

logger = logging.getLogger("testflow.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if auth_bypass_enabled():
        logger.warning("event=auth_bypass_enabled AUTH_DISABLED=true in demo mode; API is unauthenticated")
    elif settings.AUTH_DISABLED:
        logger.warning("event=auth_bypass_ignored AUTH_DISABLED is ignored unless USE_DEMO_DATA=true")
    from app.services.secret_store import is_configured

    if not is_configured():
        logger.warning("event=secret_key_missing TESTFLOW_SECRET_KEY is not a valid Fernet key; Auth Profiles will fail")
    from app.services.batch_queue import consume_forever

    from app.services.run_sweep_service import sweep_forever

    thread = threading.Thread(target=consume_forever, name="batch-queue", daemon=True)
    thread.start()
    logger.info("Batch queue consumer started")
    sweep_stop = threading.Event()
    threading.Thread(target=sweep_forever, args=(sweep_stop,), name="stuck-run-sweep", daemon=True).start()
    logger.info("Stuck-run sweep started")
    yield
    sweep_stop.set()


app = FastAPI(
    title="TestFlow API",
    description="Python FastAPI backend for TestFlow QA Automation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)

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
    # Details stay in server logs; clients only get a generic message and the request id.
    request_id = request_id_of(request)
    logger.exception(
        "event=unhandled_error request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"message": f"Internal server error (request id {request_id})."},
        headers={REQUEST_ID_HEADER: request_id},
    )

# Public /api routes: sign-in, sign-up, refresh, password reset, health. Nothing else.
public_api_router = APIRouter(prefix="/api")
public_api_router.include_router(account_public_router)
public_api_router.include_router(health_router)
# Screenshot images: authorised by a signed, expiring URL instead of a bearer token.
public_api_router.include_router(test_runs_signed_router)

# Every other /api route requires a verified Supabase access token.
api_router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])
api_router.include_router(dashboard_router)
api_router.include_router(projects_router)
api_router.include_router(crawler_router)
api_router.include_router(test_cases_router)
api_router.include_router(environments_router)
api_router.include_router(test_suites_router)
api_router.include_router(executions_router)
api_router.include_router(test_runs_router)
api_router.include_router(auth_profiles_router)
api_router.include_router(account_router)
api_router.include_router(search_router)
api_router.include_router(notifications_router)
api_router.include_router(workers_router)

app.include_router(public_api_router)
app.include_router(api_router)

@app.get("/")
def root():
    return {"message": "TestFlow API is running"}
