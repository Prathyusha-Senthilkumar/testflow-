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

    # GitHub integration: REST API base (GitHub Enterprise can point elsewhere) and how often
    # failed runs are checked for issues to open.
    GITHUB_API_URL: str = "https://api.github.com"
    GITHUB_ISSUE_POLL_SECONDS: int = 30

    # In-app test agent. OPENROUTER_USE_FREE_MODELS=1 uses the free chain.
    # Otherwise DeepSeek V4.1 Flash is used, then GLM 5.3 Flash.
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_USE_FREE_MODELS: bool = False
    OPENROUTER_MODEL: str = "deepseek/deepseek-v4.1-flash"
    OPENROUTER_FALLBACK_MODEL: str = "z-ai/glm-5.3-flash"
    AGENT_MAX_COST_USD: float = 0.50
    AGENT_INPUT_USD_PER_MILLION: float = 0.044
    AGENT_OUTPUT_USD_PER_MILLION: float = 0.60

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
