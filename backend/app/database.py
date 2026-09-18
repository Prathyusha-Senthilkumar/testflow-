from typing import Optional
from supabase import create_client, Client
from app.config import settings

def get_supabase_client() -> Optional[Client]:
    if settings.USE_DEMO_DATA:
        return None
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return None

supabase_client: Optional[Client] = get_supabase_client()
