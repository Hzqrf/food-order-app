"""Numbers above the kitchen queue. Counts and minutes only: no money, so staff and the locked tablet see them."""
import math
from datetime import date, datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import Branch, Order, utcnow
from app.orders import schemas
from app.orders import state_machine as sm
from app.reports.queries import SALES_STATUSES, placed_by
from app.shop.service import business_date


def _avg_prep_minutes(db: Session, branch: Branch, day: date) -> float | None:
    rows = db.execute(select(Order.preparing_at, Order.ready_at).where(
        Order.branch_id == branch.id, Order.business_date == day,
        Order.preparing_at.is_not(None), Order.ready_at.is_not(None))).all()
    if not rows:
        return None
    total = sum((ready - started).total_seconds() for started, ready in rows)
    return round(total / len(rows) / 60, 1)


def _orders_on(db: Session, branch: Branch, day: date, until: datetime | None = None) -> int:
    return db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.business_date == day, Order.status.in_(SALES_STATUSES),
        *placed_by(until))) or 0


def _late(branch: Branch, now: datetime) -> tuple:
    """Not ready yet and past its due time: the pickup time of a pre-order, else placed + prep."""
    prep = timedelta(minutes=branch.prep_minutes)
    return (Order.branch_id == branch.id, Order.status.in_((sm.PLACED, sm.PREPARING)),
            or_(and_(Order.pickup_at.is_(None), Order.placed_at < now - prep),
                and_(Order.pickup_at.is_not(None), Order.pickup_at < now)))


def _not_later(branch: Branch, now: datetime):
    """Excludes pre-orders still waiting for their start time (pickup - prep)."""
    prep = timedelta(minutes=branch.prep_minutes)
    return or_(Order.pickup_at.is_(None), Order.status != sm.PLACED, Order.pickup_at <= now + prep)


EXTRA_WAIT_MIN_LATE = 2
EXTRA_WAIT_CAP = 60


def extra_wait_minutes(db: Session, branch: Branch, now: datetime | None = None) -> int:
    """How much longer pickups are running, for the customers' busy banner. 0 unless at least two
    orders are late; then their average lateness, rounded up to 5 minutes and capped at an hour."""
    now = now or utcnow()
    # Today's orders only: one left open from yesterday must not keep the banner up all day.
    late = db.execute(select(Order.placed_at, Order.pickup_at).where(
        *_late(branch, now), Order.business_date == business_date(branch, now))).all()
    if len(late) < EXTRA_WAIT_MIN_LATE:
        return 0
    promise = timedelta(minutes=branch.prep_minutes)
    due = [pickup or placed + promise for placed, pickup in late]
    avg = sum((now - d).total_seconds() for d in due) / len(due) / 60
    return min(EXTRA_WAIT_CAP, math.ceil(avg / 5) * 5)


def queue_metrics(db: Session, branch: Branch, now: datetime | None = None) -> schemas.QueueMetrics:
    now = now or utcnow()
    today = business_date(branch, now)
    last_week = today - timedelta(days=7)
    # What the kitchen should be working on now: pre-orders waiting for their start time don't count.
    open_orders = db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.status.in_(sm.ACTIVE), _not_later(branch, now))) or 0
    todays_preorders = (Order.branch_id == branch.id, Order.business_date == today,
                        Order.pickup_at.is_not(None), Order.status != sm.CANCELLED)
    running_late = db.scalar(select(func.count(Order.id)).where(*_late(branch, now))) or 0
    return schemas.QueueMetrics(
        open_orders=open_orders,
        avg_prep_minutes=_avg_prep_minutes(db, branch, today),
        avg_prep_minutes_last_week=_avg_prep_minutes(db, branch, last_week),
        running_late=running_late,
        orders_today=_orders_on(db, branch, today),
        orders_same_day_last_week=_orders_on(db, branch, last_week, until=now - timedelta(days=7)),
        preorders_today=db.scalar(select(func.count(Order.id)).where(*todays_preorders)) or 0,
        next_preorder_at=db.scalar(select(func.min(Order.pickup_at)).where(
            *todays_preorders, Order.status == sm.PLACED, Order.pickup_at > now)),
    )
