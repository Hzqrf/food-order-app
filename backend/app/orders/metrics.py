"""Numbers above the kitchen queue. Counts and minutes only: no money, so staff and the locked tablet see them."""
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


def queue_metrics(db: Session, branch: Branch, now: datetime | None = None) -> schemas.QueueMetrics:
    now = now or utcnow()
    today = business_date(branch, now)
    last_week = today - timedelta(days=7)
    open_orders = db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.status.in_(sm.ACTIVE))) or 0
    promised_before = now - timedelta(minutes=branch.prep_minutes)
    running_late = db.scalar(select(func.count(Order.id)).where(
        Order.branch_id == branch.id, Order.status.in_((sm.PLACED, sm.PREPARING)),
        Order.placed_at < promised_before)) or 0
    return schemas.QueueMetrics(
        open_orders=open_orders,
        avg_prep_minutes=_avg_prep_minutes(db, branch, today),
        avg_prep_minutes_last_week=_avg_prep_minutes(db, branch, last_week),
        running_late=running_late,
        orders_today=_orders_on(db, branch, today),
        orders_same_day_last_week=_orders_on(db, branch, last_week, until=now - timedelta(days=7)),
    )
