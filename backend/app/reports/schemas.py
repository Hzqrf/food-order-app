from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

MAX_RANGE_DAYS = 366


class Range(BaseModel):
    date_from: date
    date_to: date
    group_by: Literal["day", "week", "month"] = "day"

    @model_validator(mode="after")
    def _check(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to is before date_from")
        if (self.date_to - self.date_from).days >= MAX_RANGE_DAYS:
            raise ValueError("ranges are limited to one year")
        return self


# --- Dashboard -----------------------------------------------------------------------------------


class Totals(BaseModel):
    sales_sen: int
    orders: int
    avg_order_sen: int
    online_orders: int
    counter_orders: int


class LiveCounts(BaseModel):
    placed: int
    preparing: int
    ready: int
    awaiting_payment: int


class TopItem(BaseModel):
    menu_item_id: int
    name: str
    quantity: int
    sales_sen: int


class DayPoint(BaseModel):
    day: date
    sales_sen: int
    orders: int


class AttentionOrder(BaseModel):
    id: int
    order_number: str
    order_code: str
    business_date: date
    status: str
    payment_status: str
    total_sen: int


class Attention(BaseModel):
    kind: Literal["paid_but_cancelled", "duplicate_payment", "ready_too_long", "auto_closed", "amount_mismatch",
                  "backup_failed", "backup_late"]
    # None for shop-wide problems such as a backup.
    order: AttentionOrder | None = None
    amount_sen: int | None = None
    since: datetime | None = None
    message: str | None = None


class Dashboard(BaseModel):
    business_date: date
    today: Totals
    live: LiveCounts
    accepting_online_orders: bool
    online_payments_enabled: bool
    is_open: bool
    top_items: list[TopItem]
    last_14_days: list[DayPoint]
    needs_attention: list[Attention]


# --- Reports -------------------------------------------------------------------------------------


class PeriodRow(BaseModel):
    period: str  # 2026-10-07, 2026-W41 (week starting Monday), 2026-10
    start: date
    sales_sen: int
    orders: int
    avg_order_sen: int


class HourRow(BaseModel):
    hour: int  # 0-23, shop local time
    orders: int
    sales_sen: int
    avg_daily_sales_sen: int  # averaged over the days in the range, so quiet and busy days are comparable


class ItemRow(BaseModel):
    menu_item_id: int
    name: str
    category: str | None
    quantity: int
    sales_sen: int
    is_active: bool


class ChannelRow(BaseModel):
    channel: str
    orders: int
    sales_sen: int


class PaymentRow(BaseModel):
    """Money that actually moved, by method. Includes charges on orders later cancelled."""

    method: str
    charges: int
    charged_sen: int
    refunds: int
    refunded_sen: int
    net_sen: int


class CancellationRow(BaseModel):
    order: AttentionOrder
    reason: str | None
    cancelled_at: datetime | None
    cancelled_by: str | None
    was_paid: bool


class Cancellations(BaseModel):
    # Cancelled by the shop or the owner (the ones worth reading).
    by_shop: int
    by_shop_value_sen: int
    # Online orders never paid: expired or abandoned by the customer.
    unpaid: int
    refunds: int
    refunded_sen: int
    rows: list[CancellationRow]


class Report(BaseModel):
    date_from: date
    date_to: date
    group_by: str
    totals: Totals
    periods: list[PeriodRow]
    hours: list[HourRow]
    items: list[ItemRow]
    channels: list[ChannelRow]
    payments: list[PaymentRow]
    cancellations: Cancellations


# --- Audit log -----------------------------------------------------------------------------------


class AuditFilter(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    action: str | None = Field(default=None, max_length=50)
    entity_type: str | None = Field(default=None, max_length=50)
    actor_id: int | None = None
    cursor: int | None = None
    limit: int = Field(default=50, ge=1, le=200)


class AuditRow(BaseModel):
    id: int
    created_at: datetime
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: int | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    ip: str | None


class AuditPage(BaseModel):
    rows: list[AuditRow]
    next_cursor: int | None
    actions: list[str]
