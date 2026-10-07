from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.audit import audit
from app.config import get_settings
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


def shop_out(branch: Branch) -> schemas.ShopOut:
    open_now = is_open(branch)
    return schemas.ShopOut(
        name=branch.name, is_open=open_now, is_accepting_online_orders=branch.is_accepting_online_orders,
        can_order_online=open_now and branch.is_accepting_online_orders, prep_minutes=branch.prep_minutes,
        opening_hours=branch.opening_hours, timezone=branch.timezone,
    )


def set_online_orders(db: Session, branch: Branch, user: User, accepting: bool, ip: str) -> None:
    if branch.is_accepting_online_orders == accepting:
        return
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
