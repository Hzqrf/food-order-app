from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.audit import audit
from app.config import get_settings
from app.errors import AppError
from app.models import Branch, User, utcnow
from app.shop import schemas

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def local_now(branch: Branch, now: datetime | None = None) -> datetime:
    return (now or utcnow()).astimezone(ZoneInfo(branch.timezone))


def business_date(branch: Branch, now: datetime | None = None) -> date:
    """The trading day an instant belongs to. The day turns over at the day-close hour, not midnight,
    so an order at 00:30 after a late night still counts towards the evening before."""
    return (local_now(branch, now) - timedelta(hours=get_settings().day_close_hour)).date()


def is_open(branch: Branch, now: datetime | None = None) -> bool:
    local = local_now(branch, now)
    hhmm = local.strftime("%H:%M")
    today = DAYS[local.weekday()]
    yesterday = DAYS[(local.weekday() - 1) % 7]
    for start, end in branch.opening_hours.get(today, []):
        if start == end:  # open around the clock
            return True
        if start < end and start <= hhmm < end:
            return True
        if start > end and hhmm >= start:  # runs past midnight
            return True
    return any(start > end and hhmm < end for start, end in branch.opening_hours.get(yesterday, []))


def window_close(branch: Branch, now: datetime | None = None) -> datetime | None:
    """When the opening window that `now` falls in closes, in shop-local time. None when closed.

    Open around the clock closes at the next day-close hour, the end of the business day.
    """
    local = local_now(branch, now)
    hhmm = local.strftime("%H:%M")
    today = DAYS[local.weekday()]
    yesterday = DAYS[(local.weekday() - 1) % 7]

    def on(day_offset: int, at: str) -> datetime:
        hours, minutes = int(at[:2]), int(at[3:])
        return (local + timedelta(days=day_offset)).replace(hour=hours, minute=minutes, second=0, microsecond=0)

    for start, end in branch.opening_hours.get(today, []):
        if start == end:
            close_hour = get_settings().day_close_hour
            day = business_date(branch, now) + timedelta(days=1)
            return local.replace(year=day.year, month=day.month, day=day.day, hour=close_hour, minute=0,
                                 second=0, microsecond=0)
        if start < end and start <= hhmm < end:
            return on(0, end)
        if start > end and hhmm >= start:
            return on(1, end)
    for start, end in branch.opening_hours.get(yesterday, []):
        if start > end and hhmm < end:
            return on(0, end)
    return None


def online_payment_ready(branch: Branch) -> bool:
    """Customers can pay online: a gateway is set up and the owner allows it."""
    return get_settings().online_payments_enabled and branch.pay_online


def online_ordering_available(branch: Branch) -> bool:
    """There is some way to pay for an online order: online, or at the counter on pickup."""
    return online_payment_ready(branch) or branch.pay_at_counter


def takes_online_orders(branch: Branch) -> bool:
    """Online ordering needs a payment option, opening hours, and the switch on."""
    return online_ordering_available(branch) and is_open(branch) and branch.is_accepting_online_orders


def shop_out(db: Session, branch: Branch) -> schemas.ShopOut:
    from app.orders.metrics import extra_wait_minutes  # metrics imports this module

    return schemas.ShopOut(
        name=branch.name, is_open=is_open(branch), is_accepting_online_orders=branch.is_accepting_online_orders,
        can_order_online=takes_online_orders(branch), online_payments_enabled=get_settings().online_payments_enabled,
        prep_minutes=branch.prep_minutes, opening_hours=branch.opening_hours, timezone=branch.timezone,
        extra_wait_minutes=extra_wait_minutes(db, branch),
        pay_online_available=online_payment_ready(branch), pay_online_enabled=branch.pay_online,
        pay_at_counter=branch.pay_at_counter, online_ordering_available=online_ordering_available(branch),
        preorders_enabled=branch.preorders_enabled, preorder_slot_limit=branch.preorder_slot_limit,
    )


def set_online_orders(db: Session, branch: Branch, user: User, accepting: bool, ip: str) -> None:
    if branch.is_accepting_online_orders == accepting:
        return
    if accepting and not online_ordering_available(branch):
        raise AppError("no_payment_option", "Turn on a payment option in Settings first.", 409)
    audit(db, user.id, "online_orders_resumed" if accepting else "online_orders_paused", "branch", branch.id,
          {"is_accepting_online_orders": branch.is_accepting_online_orders},
          {"is_accepting_online_orders": accepting}, ip)
    branch.is_accepting_online_orders = accepting


def update_settings(db: Session, branch: Branch, admin: User, body: schemas.SettingsPatch, ip: str) -> None:
    values = body.model_dump(exclude_unset=True)
    if "opening_hours" in values:
        values["opening_hours"] = {d: [list(r) for r in ranges] for d, ranges in values["opening_hours"].items()}
    before = {k: getattr(branch, k) for k in values}
    changed = {k: v for k, v in values.items() if before[k] != v}
    if not changed:
        return
    for k, v in changed.items():
        setattr(branch, k, v)
    audit(db, admin.id, "settings_changed", "branch", branch.id, {k: before[k] for k in changed}, changed, ip)
