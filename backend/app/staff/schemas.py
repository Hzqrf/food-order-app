from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

USERNAME = r"^[a-z0-9._-]{3,50}$"


class StaffOut(BaseModel):
    id: int
    role: str
    username: str
    email: str | None
    full_name: str
    phone: str | None
    position: str | None
    joined_on: date | None
    left_on: date | None
    is_active: bool
    has_pin: bool
    totp_enabled: bool


class StaffIn(BaseModel):
    role: Literal["staff", "admin"] = "staff"
    username: str = Field(pattern=USERNAME)
    email: EmailStr | None = None
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    position: str | None = Field(default=None, max_length=50)
    joined_on: date | None = None
    password: str = Field(min_length=10, max_length=200)
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")

    @field_validator("username", mode="before")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower() if isinstance(v, str) else v


class StaffPatch(BaseModel):
    role: Literal["staff", "admin"] | None = None
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    position: str | None = Field(default=None, max_length=50)
    joined_on: date | None = None


class PasswordResetIn(BaseModel):
    password: str = Field(min_length=10, max_length=200)


class PinIn(BaseModel):
    pin: str = Field(pattern=r"^\d{4,6}$")
