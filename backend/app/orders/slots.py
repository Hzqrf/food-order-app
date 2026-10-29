"""Pickup slots for pre-orders: 15-minute times later today that still have room."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Branch, Order, utcnow
from app.orders import state_machine as sm
from app.orders.timing import SLOT_MINUTES
from app.shop.service import local_now, online_ordering_available, window_close

UTC = ZoneInfo("UTC")


class Slot(BaseModel):
    time: str
    available: bool


def _round_up(t: datetime) -> datetime:
    if t.second or t.microsecond:
        t = t.replace(second=0, microsecond=0) + timedelta(minutes=1)
    return t + timedelta(minutes=(SLOT_MINUTES - t.minute % SLOT_MINUTES) % SLOT_MINUTES)


def _slot_times(db: Session, branch: Branch, now: datetime) -> list[tuple[datetime, bool]]:
    """(local slot time, has room) from the earliest the kitchen can make it to closing time."""
    from app.orders.metrics import extra_wait_minutes  # metrics imports the shop service too

    if not (branch.preorders_enabled and online_ordering_available(branch) and branch.is_accepting_online_orders):
        return []
    close = window_close(branch, now)
    if close is None:
        return []
    ready = timedelta(minutes=branch.prep_minutes + extra_wait_minutes(db, branch, now))
    first = _round_up(local_now(branch, now) + ready)
    if first > close:
        return []
    taken = dict(db.execute(
        select(Order.pickup_at, func.count(Order.id)).where(
            Order.branch_id == branch.id, Order.status != sm.CANCELLED,
            Order.pickup_at >= first.astimezone(UTC), Order.pickup_at <= close.astimezone(UTC))
        .group_by(Order.pickup_at)).all())
    taken = {k.astimezone(UTC): v for k, v in taken.items()}
    out, slot = [], first
    while slot <= close:
        out.append((slot, taken.get(slot.astimezone(UTC), 0) < branch.preorder_slot_limit))
        slot += timedelta(minutes=SLOT_MINUTES)
    return out


def pickup_slots(db: Session, branch: Branch, now: datetime | None = None) -> list[Slot]:
    return [Slot(time=t.strftime("%H:%M"), available=ok) for t, ok in _slot_times(db, branch, now or utcnow())]


def slot_to_utc(db: Session, branch: Branch, hhmm: str, now: datetime | None = None) -> datetime | None:
    """The UTC time of today's slot named "HH:MM", or None if it isn't one of today's slots."""
    for t, _ in _slot_times(db, branch, now or utcnow()):
        if t.strftime("%H:%M") == hhmm:
            return t.astimezone(UTC)
    return None


def count_in_slot(db: Session, branch: Branch, pickup_at: datetime) -> int:
    return db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.pickup_at == pickup_at, Order.status != sm.CANCELLED)) or 0
