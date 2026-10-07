from typing import Annotated
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, StringConstraints, field_validator

HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
DAY_KEYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}


class ShopOut(BaseModel):
    name: str
    is_open: bool
    is_accepting_online_orders: bool
    can_order_online: bool
    prep_minutes: int
    opening_hours: dict[str, list[list[str]]]
    timezone: str


class OnlineOrdersIn(BaseModel):
    accepting: bool


class SettingsPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    timezone: str | None = None
    prep_minutes: int | None = Field(default=None, ge=1, le=240)
    opening_hours: dict[str, list[tuple[HHMM, HHMM]]] | None = None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None and v not in available_timezones():
            raise ValueError("unknown timezone")
        return v

    @field_validator("opening_hours")
    @classmethod
    def _days(cls, v):
        if v is not None and not set(v) <= DAY_KEYS:
            raise ValueError("days must be mon..sun")
        return v
