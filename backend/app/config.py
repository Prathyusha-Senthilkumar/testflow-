from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PORT: int = 3000
    FRONTEND_URL: str = "http://localhost:5173"
    USE_DEMO_DATA: bool = False
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    REDIS_URL: Optional[str] = None
    RECORDING_DELEGATE_URL: Optional[str] = None

    # API authentication. Access tokens are Supabase JWTs verified locally:
    # HS256 with SUPABASE_JWT_SECRET when set, otherwise the project's JWKS
    # (SUPABASE_URL/auth/v1/.well-known/jwks.json).
    SUPABASE_JWT_SECRET: Optional[str] = None
    # Dev-only bypass. Honoured only together with USE_DEMO_DATA=true.
    AUTH_DISABLED: bool = False

    # Fernet key for Auth Profile credentials and sessions. Required for Auth Profiles.
    TESTFLOW_SECRET_KEY: Optional[str] = None

    # Runs left in Queued/Running longer than this are marked Failed by the sweep.
    STUCK_RUN_AFTER_MINUTES: int = 60
    STUCK_RUN_SWEEP_SECONDS: int = 300

    # Worker heartbeat period (must match the worker's WORKER_STATUS_INTERVAL_MS). A worker whose
    # heartbeat is older than 3x this is reported as stale on the Workers page.
    WORKER_STATUS_INTERVAL_MS: int = 5000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
