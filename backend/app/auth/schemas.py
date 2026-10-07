from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=255, description="Username or email")
    password: str = Field(min_length=1, max_length=200)
    totp_code: str | None = Field(default=None, max_length=10)


class PinIn(BaseModel):
    user_id: int
    pin: str = Field(min_length=4, max_length=6)


class SessionUser(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    totp_enabled: bool


class SessionOut(BaseModel):
    user: SessionUser | None
    via_pin: bool
    device_registered: bool
    branch_name: str | None


class DeviceStaff(BaseModel):
    id: int
    full_name: str


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class TotpCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)
