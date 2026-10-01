from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LoginDto(BaseModel):
    email: str
    password: str


class SignupDto(BaseModel):
    email: str
    password: str
    name: str


class UpdateProfileDto(BaseModel):
    name: str


class UpdatePasswordDto(BaseModel):
    password: str


class ForgotPasswordDto(BaseModel):
    email: str


class ResetPasswordDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accessToken: str = Field(alias="accessToken")
    password: str


class MessageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    message: str
    resetLink: Optional[str] = Field(default=None, alias="resetLink")


class RefreshDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    refreshToken: str = Field(alias="refreshToken")


class AccountResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    accessToken: Optional[str] = Field(default=None, alias="accessToken")
    refreshToken: Optional[str] = Field(default=None, alias="refreshToken")
    userId: Optional[str] = Field(default=None, alias="userId")
    email: str
    name: str
    confirmationRequired: bool = Field(default=False, alias="confirmationRequired")
