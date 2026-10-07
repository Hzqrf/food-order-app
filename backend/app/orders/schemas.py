from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _strip(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class CartLineIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=20)
    option_ids: list[int] = Field(default_factory=list, max_length=20)
    note: str | None = Field(default=None, max_length=200)

    _clean = field_validator("note")(_strip)


class QuoteIn(BaseModel):
    items: list[CartLineIn] = Field(min_length=1, max_length=50)


class QuotedOption(BaseModel):
    option_id: int
    group_name: str
    option_name: str
    price_sen: int


class QuotedLine(BaseModel):
    menu_item_id: int
    item_name: str
    unit_price_sen: int
    options_total_sen: int
    quantity: int
    line_total_sen: int
    options: list[QuotedOption]


class Problem(BaseModel):
    line: int
    reason: str
    menu_item_id: int
    option_id: int | None = None
    option_group_id: int | None = None


class QuoteOut(BaseModel):
    lines: list[QuotedLine]
    subtotal_sen: int
    total_sen: int
    problems: list[Problem]


class CounterPaymentIn(BaseModel):
    method: Literal["cash", "qr_counter", "card_terminal"]
    tendered_sen: int | None = Field(default=None, ge=0, le=100_000_00)


class CounterOrderIn(BaseModel):
    channel: Literal["counter", "phone"] = "counter"
    customer_name: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=200)
    items: list[CartLineIn] = Field(min_length=1, max_length=50)
    payment: CounterPaymentIn
    # What the staff member saw on screen. If the server's total differs, the order is refused.
    expected_total_sen: int | None = None

    _clean = field_validator("customer_name", "note")(_strip)


class OnlineOrderIn(BaseModel):
    # Checkout asks for neither: the order ID identifies the order. Both are kept for API callers.
    customer_name: str | None = Field(default=None, max_length=50)
    customer_phone: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=200)
    items: list[CartLineIn] = Field(min_length=1, max_length=50)
    # The total the customer saw. If the server's total differs, the order is refused for review.
    expected_total_sen: int

    _clean = field_validator("customer_name", "customer_phone", "note")(_strip)


class OnlineOrderOut(BaseModel):
    order_number: str
    order_code: str
    token: str
    status: str
    total_sen: int
    # None when the gateway could not be reached; the tracking page offers "Pay now" to retry.
    payment_url: str | None
    expires_at: datetime


class PaymentLinkOut(BaseModel):
    payment_url: str


class TrackingLine(BaseModel):
    menu_item_id: int
    item_name: str
    quantity: int
    line_total_sen: int
    note: str | None
    option_ids: list[int]
    option_names: list[str]


class TrackingOut(BaseModel):
    order_number: str
    order_code: str
    status: str
    payment_status: str
    shop_name: str
    # True 48 hours after completion: the link then only says the order was completed.
    detail_hidden: bool = False
    customer_name: str | None = None
    channel: str | None = None
    items: list[TrackingLine] = []
    total_sen: int | None = None
    note: str | None = None
    prep_minutes: int | None = None
    created_at: datetime | None = None
    placed_at: datetime | None = None
    ready_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    expires_at: datetime | None = None
    can_pay: bool = False
    can_cancel: bool = False


class TransitionIn(BaseModel):
    to: Literal["placed", "preparing", "ready", "completed"]
    version: int
    note: str | None = Field(default=None, max_length=200)


class CancelIn(BaseModel):
    version: int
    reason: str = Field(min_length=1, max_length=200)
    # Required when the order was paid: how the money goes back. "later" is for online payments:
    # the owner refunds through the gateway and records it, so the order shows as paid but cancelled.
    refund_method: Literal["cash", "original", "later"] | None = None


class RefundIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)
    refund_method: Literal["cash", "original"]


class OrderOption(BaseModel):
    group_name: str
    option_name: str
    price_sen: int


class OrderLine(BaseModel):
    id: int
    menu_item_id: int
    item_name: str
    quantity: int
    unit_price_sen: int
    options_total_sen: int
    line_total_sen: int
    note: str | None
    options: list[OrderOption]


class OrderSummary(BaseModel):
    id: int
    order_number: str
    # Permanent order ID, unique across all days. order_number repeats daily.
    order_code: str
    business_date: str
    channel: str
    status: str
    payment_status: str
    customer_name: str | None
    note: str | None
    subtotal_sen: int
    total_sen: int
    version: int
    auto_closed: bool
    cancel_reason: str | None
    created_by_name: str | None
    created_at: datetime
    placed_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    items: list[OrderLine]


class OrderEvent(BaseModel):
    from_status: str | None
    to_status: str
    actor_type: str
    actor_name: str | None
    note: str | None
    created_at: datetime


class OrderPayment(BaseModel):
    id: int
    kind: str
    method: str
    amount_sen: int
    status: str
    paid_at: datetime | None
    recorded_by_name: str | None


class OrderDetail(OrderSummary):
    customer_phone: str | None
    events: list[OrderEvent]
    payments: list[OrderPayment]


class CounterOrderOut(OrderSummary):
    change_sen: int | None
