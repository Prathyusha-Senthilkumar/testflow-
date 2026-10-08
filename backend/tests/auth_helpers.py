"""Test-only HS256 tokens. The secret is a throwaway value set for the test process."""

import time
import uuid

import jwt

from app.config import settings

TEST_JWT_SECRET = "test-only-jwt-secret-not-used-anywhere-else-0123456789"
TEST_USER_ID = str(uuid.UUID("11111111-1111-1111-1111-111111111111"))

settings.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
settings.AUTH_DISABLED = False


def make_token(
    *,
    secret: str = TEST_JWT_SECRET,
    exp_offset: int = 3600,
    aud: str = "authenticated",
    sub: str = TEST_USER_ID,
    algorithm: str = "HS256",
) -> str:
    now = int(time.time())
    claims = {
        "sub": sub,
        "aud": aud,
        "exp": now + exp_offset,
        "iat": now,
        "email": "tester@example.com",
        "role": "authenticated",
        "user_metadata": {"full_name": "Test User"},
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


def auth_headers(**kwargs) -> dict:
    return {"Authorization": f"Bearer {make_token(**kwargs)}"}
