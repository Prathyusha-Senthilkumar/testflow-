import logging
from typing import Optional
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("testflow.database")


def _has_credentials() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def _resolve_active_mode() -> str:
    """
    Explicitly resolve storage mode. Never silently fall back to demo when
    Supabase was requested (USE_DEMO_DATA=false) but configuration is invalid.
    """
    if settings.USE_DEMO_DATA:
        return "demo"

    has_url = bool(settings.SUPABASE_URL)
    has_key = bool(settings.SUPABASE_SERVICE_ROLE_KEY)

    if has_url and has_key:
        return "supabase"

    if has_url or has_key:
        raise RuntimeError(
            "Supabase mode requested (USE_DEMO_DATA=false) but configuration is incomplete: "
            "both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. "
            "Set both, or set USE_DEMO_DATA=true for demo mode."
        )

    raise RuntimeError(
        "No storage configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist to "
        "Supabase, or set USE_DEMO_DATA=true to use in-memory demo mode."
    )


def get_active_storage_mode() -> str:
    return _resolve_active_mode()


def get_supabase_client() -> Optional[Client]:
    if _resolve_active_mode() != "supabase":
        return None
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


# Resolved lazily by repositories; not created eagerly so importing this module
# never crashes tooling before configuration is known.
supabase_client: Optional[Client] = None
