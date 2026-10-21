"""Numbers above the kitchen queue. Counts and minutes only: no money, so staff and the locked tablet see them."""
import math
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
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
    """Not ready yet and past placed_at + prep_minutes."""
    return (Order.branch_id == branch.id, Order.status.in_((sm.PLACED, sm.PREPARING)),
            Order.placed_at < now - timedelta(minutes=branch.prep_minutes))


EXTRA_WAIT_MIN_LATE = 2
EXTRA_WAIT_CAP = 60


def extra_wait_minutes(db: Session, branch: Branch, now: datetime | None = None) -> int:
    """How much longer pickups are running, for the customers' busy banner. 0 unless at least two
    orders are late; then their average lateness, rounded up to 5 minutes and capped at an hour."""
    now = now or utcnow()
    # Today's orders only: one left open from yesterday must not keep the banner up all day.
    placed = db.scalars(select(Order.placed_at).where(
        *_late(branch, now), Order.business_date == business_date(branch, now))).all()
    if len(placed) < EXTRA_WAIT_MIN_LATE:
        return 0
    promise = timedelta(minutes=branch.prep_minutes)
    avg = sum((now - p - promise).total_seconds() for p in placed) / len(placed) / 60
    return min(EXTRA_WAIT_CAP, math.ceil(avg / 5) * 5)


def queue_metrics(db: Session, branch: Branch, now: datetime | None = None) -> schemas.QueueMetrics:
    now = now or utcnow()
    today = business_date(branch, now)
    last_week = today - timedelta(days=7)
    open_orders = db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.status.in_(sm.ACTIVE))) or 0
    running_late = db.scalar(select(func.count(Order.id)).where(*_late(branch, now))) or 0
    return schemas.QueueMetrics(
        open_orders=open_orders,
        avg_prep_minutes=_avg_prep_minutes(db, branch, today),
        avg_prep_minutes_last_week=_avg_prep_minutes(db, branch, last_week),
        running_late=running_late,
        orders_today=_orders_on(db, branch, today),
        orders_same_day_last_week=_orders_on(db, branch, last_week, until=now - timedelta(days=7)),
    )
