import logging
from app.config import settings

logger = logging.getLogger("uvicorn.error")

supabase_client = None

if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
    try:
        from supabase import create_client, Client
        supabase_client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.warning(f"Failed to initialize Supabase client: {e}. Falling back to demo mode.")
        supabase_client = None
else:
    logger.info("No Supabase credentials configured. Running in demo mode.")

def get_supabase_client():
    return supabase_client
