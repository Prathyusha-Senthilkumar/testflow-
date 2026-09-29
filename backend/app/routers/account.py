from fastapi import APIRouter, Header, HTTPException

from app.schemas.account import (
    AccountResponse,
    ForgotPasswordDto,
    LoginDto,
    MessageResponse,
    RefreshDto,
    ResetPasswordDto,
    SignupDto,
    UpdatePasswordDto,
    UpdateProfileDto,
)
from app.services import account_service

router = APIRouter(prefix="/auth", tags=["account"])


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return token


@router.post("/login", response_model=AccountResponse)
def login(body: LoginDto) -> AccountResponse:
    return account_service.login(body.email, body.password)


@router.post("/signup", response_model=AccountResponse)
def signup(body: SignupDto) -> AccountResponse:
    return account_service.signup(body.email, body.password, body.name)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordDto) -> MessageResponse:
    reset_link = account_service.request_password_reset(body.email)
    if reset_link:
        return MessageResponse(
            message="The reset email could not be sent. Use this link to choose a new password.",
            resetLink=reset_link,
        )
    return MessageResponse(message="If an account exists for that email, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: ResetPasswordDto) -> MessageResponse:
    account_service.reset_password(body.accessToken, body.password)
    return MessageResponse(message="Password updated. Sign in with your new password.")


@router.post("/refresh", response_model=AccountResponse)
def refresh(body: RefreshDto) -> AccountResponse:
    return account_service.refresh(body.refreshToken)


@router.get("/me", response_model=AccountResponse)
def me(authorization: str | None = Header(default=None)) -> AccountResponse:
    return account_service.current_user(_bearer(authorization))


@router.patch("/profile", response_model=AccountResponse)
def update_profile(
    body: UpdateProfileDto,
    authorization: str | None = Header(default=None),
) -> AccountResponse:
    return account_service.update_profile(_bearer(authorization), body.name)


@router.post("/password", response_model=AccountResponse)
def update_password(
    body: UpdatePasswordDto,
    authorization: str | None = Header(default=None),
) -> AccountResponse:
    return account_service.update_password(_bearer(authorization), body.password)
