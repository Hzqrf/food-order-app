"""Timed jobs. Each one is safe to run twice.

Every minute: ask the gateway about payments whose webhook never came, then expire orders left
unpaid for 15 minutes. Once a day: close the day.
"""
import logging

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Branch, MenuItem, Option, Order
from app.orders import state_machine as sm

log = logging.getLogger("app.jobs")


def close_day(db: Session) -> dict[str, int]:
    """Reset sold-out switches, and complete orders still Ready, flagged for the owner to review."""
    items = db.execute(update(MenuItem).where(MenuItem.is_sold_out.is_(True)).values(is_sold_out=False)).rowcount
    options = db.execute(update(Option).where(Option.is_sold_out.is_(True)).values(is_sold_out=False)).rowcount
    closed = 0
    for order in db.scalars(select(Order).where(Order.status == sm.READY)):
        sm.transition(db, order, sm.COMPLETED, sm.SYSTEM, note="auto-closed at day close")
        order.auto_closed = True
        closed += 1
    from app.menu.service import invalidate_menu_cache
    invalidate_menu_cache()
    result = {"items_reset": items, "options_reset": options, "orders_auto_closed": closed}
    log.info("day closed", extra=result)
    return result


def payments_tick(db: Session) -> dict[str, int]:
    from app.payments.service import expire_unpaid, reconcile
    return {"reconciled": reconcile(db), "expired": expire_unpaid(db)}


def start_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.config import get_settings
    from app.db import SessionLocal

    with SessionLocal() as db:
        branch = db.scalar(select(Branch).order_by(Branch.id).limit(1))
        tz = branch.timezone if branch else "Asia/Kuala_Lumpur"

    def run(job):
        def wrapped():
            try:
                with SessionLocal() as db, db.begin():
                    job(db)
            except Exception:
                log.exception("job failed", extra={"job": job.__name__})
        return wrapped

    scheduler = BackgroundScheduler(timezone=tz)
    scheduler.add_job(run(payments_tick), "interval", minutes=1, id="payments", coalesce=True, max_instances=1)
    scheduler.add_job(run(close_day), "cron", hour=get_settings().day_close_hour, minute=0, id="close_day",
                      coalesce=True, max_instances=1)
    scheduler.start()
    return scheduler
