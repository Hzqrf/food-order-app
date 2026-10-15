"""The owner's numbers. Plain GROUP BY queries on orders, order lines and payments.

Revenue, everywhere: orders that are paid and not cancelled, by business date. A refunded order no
longer counts (refunds are whole-order today). Payment reports instead show money that actually moved.
"""
import csv
import io
import json
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (AuditLog, Branch, MenuCategory, MenuItem, Order, OrderItem, OrderStatusEvent, Payment,
                        User, utcnow)
from app.orders import state_machine as sm
from app.orders.service import fmt_number, refundable_by_charge
from app.reports import schemas
from app.shop.service import business_date, is_open

SALES_STATUSES = (sm.PLACED, sm.PREPARING, sm.READY, sm.COMPLETED)
UNPAID_REASONS = ("payment_expired", "customer_cancelled")
READY_TOO_LONG = timedelta(minutes=30)


def _sales(branch: Branch, start: date, end: date):
    return (Order.branch_id == branch.id, Order.business_date >= start, Order.business_date <= end,
            Order.status.in_(SALES_STATUSES), Order.payment_status == "paid")


def placed_by(until: datetime | None) -> tuple:
    """Only orders placed by `until`, so "same day last week" stops at the same time of day as now."""
    return () if until is None else (func.coalesce(Order.placed_at, Order.created_at) <= until,)


def day_bounds(branch: Branch, start: date, end: date) -> tuple[datetime, datetime]:
    """UTC instants covering business dates start..end. A business day starts at the day-close hour."""
    tz = ZoneInfo(branch.timezone)
    hour = time(get_settings().day_close_hour)
    lo = datetime.combine(start, hour, tz).astimezone(UTC)
    hi = datetime.combine(end + timedelta(days=1), hour, tz).astimezone(UTC)
    return lo, hi


def _attention_order(o: Order) -> schemas.AttentionOrder:
    return schemas.AttentionOrder(id=o.id, order_number=fmt_number(o.order_number), order_code=o.order_code,
                                  business_date=o.business_date, status=o.status,
                                  payment_status=o.payment_status, total_sen=o.total_sen)


# --- Building blocks -----------------------------------------------------------------------------


def _money(db: Session, branch: Branch, start: date, end: date, until: datetime | None = None):
    """(business_date, method, kind, amount) for succeeded payments on non-cancelled orders of these dates."""
    return db.execute(
        select(Order.business_date, Payment.method, Payment.kind, func.coalesce(func.sum(Payment.amount_sen), 0))
        .join(Order, Order.id == Payment.order_id)
        .where(Order.branch_id == branch.id, Order.business_date >= start, Order.business_date <= end,
               Order.status.in_(SALES_STATUSES), Payment.status == "succeeded", *placed_by(until))
        .group_by(Order.business_date, Payment.method, Payment.kind)
    ).all()


def totals(db: Session, branch: Branch, start: date, end: date, until: datetime | None = None) -> schemas.Totals:
    count, sales, online = db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.total_sen), 0),
               func.coalesce(func.sum(case((Order.channel == "online", 1), else_=0)), 0))
        .where(*_sales(branch, start, end), *placed_by(until))
    ).one()
    count, sales, online = int(count), int(sales), int(online)
    gross = refunds = 0
    for _, _, kind, amount in _money(db, branch, start, end, until):
        if kind == "charge":
            gross += int(amount)
        else:
            refunds += int(amount)
    return schemas.Totals(sales_sen=sales, orders=count, avg_order_sen=sales // count if count else 0,
                          online_orders=online, counter_orders=count - online,
                          gross_sen=gross, refunds_sen=refunds, net_sen=gross - refunds)


def daily(db: Session, branch: Branch, start: date, end: date) -> dict[date, tuple[int, int]]:
    rows = db.execute(
        select(Order.business_date, func.coalesce(func.sum(Order.total_sen), 0), func.count(Order.id))
        .where(*_sales(branch, start, end)).group_by(Order.business_date)
    ).all()
    return {d: (int(s), int(c)) for d, s, c in rows}


def _period_start(d: date, group_by: str) -> date:
    if group_by == "week":
        return d - timedelta(days=d.weekday())
    if group_by == "month":
        return d.replace(day=1)
    return d


def _period_label(d: date, group_by: str) -> str:
    if group_by == "week":
        year, week, _ = d.isocalendar()
        return f"{year}-W{week:02d}"
    if group_by == "month":
        return d.strftime("%Y-%m")
    return d.isoformat()


def periods(db: Session, branch: Branch, start: date, end: date, group_by: str) -> list[schemas.PeriodRow]:
    by_day = daily(db, branch, start, end)
    buckets: dict[date, list[int]] = {}
    d = start
    while d <= end:  # every period in the range, including empty ones
        key = _period_start(d, group_by)
        sales, orders = by_day.get(d, (0, 0))
        bucket = buckets.setdefault(key, [0, 0])
        bucket[0] += sales
        bucket[1] += orders
        d += timedelta(days=1)

    refunds: dict[date, int] = defaultdict(int)
    methods: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for day, method, kind, amount in _money(db, branch, start, end):
        key = _period_start(day, group_by)
        methods[key][method] += int(amount) if kind == "charge" else -int(amount)
        if kind == "refund":
            refunds[key] += int(amount)

    tz = ZoneInfo(branch.timezone)
    hour_sales: dict[date, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for day, at, total in db.execute(select(Order.business_date, func.coalesce(Order.placed_at, Order.created_at),
                                            Order.total_sen).where(*_sales(branch, start, end))).all():
        hour_sales[_period_start(day, group_by)][_local_hour(at, tz)] += total

    def peak(key: date) -> int | None:
        by_hour = hour_sales.get(key)
        return max(by_hour, key=lambda h: (by_hour[h], -h)) if by_hour else None

    return [schemas.PeriodRow(period=_period_label(k, group_by), start=k, sales_sen=s, orders=o,
                              avg_order_sen=s // o if o else 0, refunds_sen=refunds.get(k, 0),
                              methods=dict(methods.get(k, {})), peak_hour=peak(k))
            for k, (s, o) in sorted(buckets.items())]


def _local_hour(at: datetime, tz: ZoneInfo) -> int:
    return (at if at.tzinfo else at.replace(tzinfo=UTC)).astimezone(tz).hour


def hours(db: Session, branch: Branch, start: date, end: date) -> list[schemas.HourRow]:
    """Sales by hour of day in shop time, averaged over the days in the range."""
    tz = ZoneInfo(branch.timezone)
    rows = db.execute(select(func.coalesce(Order.placed_at, Order.created_at), Order.total_sen)
                      .where(*_sales(branch, start, end))).all()
    by_hour = defaultdict(lambda: [0, 0])
    for at, total in rows:
        h = _local_hour(at, tz)
        by_hour[h][0] += 1
        by_hour[h][1] += total
    days = (end - start).days + 1
    return [schemas.HourRow(hour=h, orders=by_hour[h][0], sales_sen=by_hour[h][1],
                            avg_daily_sales_sen=by_hour[h][1] // days) for h in range(24)]


def items(db: Session, branch: Branch, start: date, end: date, limit: int | None = None) -> list[schemas.ItemRow]:
    """Every item sold, plus active items that sold nothing: the worst sellers matter too."""
    sold = {
        mid: (int(q), int(s)) for mid, q, s in db.execute(
            select(OrderItem.menu_item_id, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total_sen))
            .join(Order, Order.id == OrderItem.order_id).where(*_sales(branch, start, end))
            .group_by(OrderItem.menu_item_id)
        ).all()
    }
    menu = db.execute(select(MenuItem.id, MenuItem.name, MenuCategory.name, MenuItem.is_active)
                      .join(MenuCategory, MenuCategory.id == MenuItem.category_id)).all()
    rows = [schemas.ItemRow(menu_item_id=mid, name=name, category=cat, quantity=sold.get(mid, (0, 0))[0],
                            sales_sen=sold.get(mid, (0, 0))[1], is_active=active)
            for mid, name, cat, active in menu if mid in sold or active]
    rows.sort(key=lambda r: (-r.quantity, -r.sales_sen, r.name))
    return rows[:limit] if limit else rows


def channels(db: Session, branch: Branch, start: date, end: date) -> list[schemas.ChannelRow]:
    rows = db.execute(select(Order.channel, func.count(Order.id), func.coalesce(func.sum(Order.total_sen), 0))
                      .where(*_sales(branch, start, end)).group_by(Order.channel)).all()
    return sorted((schemas.ChannelRow(channel=c, orders=int(n), sales_sen=int(s)) for c, n, s in rows),
                  key=lambda r: -r.sales_sen)


def payments(db: Session, branch: Branch, start: date, end: date) -> list[schemas.PaymentRow]:
    """By the moment money moved, so a day's cash total matches the drawer."""
    lo, hi = day_bounds(branch, start, end)
    rows = db.execute(
        select(Payment.method, Payment.kind, func.count(Payment.id), func.coalesce(func.sum(Payment.amount_sen), 0))
        .join(Order, Order.id == Payment.order_id)
        .where(Order.branch_id == branch.id, Payment.status == "succeeded", Payment.paid_at >= lo, Payment.paid_at < hi)
        .group_by(Payment.method, Payment.kind)
    ).all()
    by_method: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for method, kind, n, amount in rows:
        offset = 0 if kind == "charge" else 2
        by_method[method][offset] += int(n)
        by_method[method][offset + 1] += int(amount)
    return sorted((schemas.PaymentRow(method=m, charges=v[0], charged_sen=v[1], refunds=v[2], refunded_sen=v[3],
                                      net_sen=v[1] - v[3]) for m, v in by_method.items()),
                  key=lambda r: -r.charged_sen)


def cancellations(db: Session, branch: Branch, start: date, end: date) -> schemas.Cancellations:
    cancelled = db.scalars(select(Order).where(
        Order.branch_id == branch.id, Order.business_date >= start, Order.business_date <= end,
        Order.status == sm.CANCELLED).order_by(Order.cancelled_at.desc())).all()
    by_shop = [o for o in cancelled if o.cancel_reason not in UNPAID_REASONS]
    who: dict[int, str | None] = {}
    if by_shop:
        events = db.execute(
            select(OrderStatusEvent.order_id, User.full_name, OrderStatusEvent.actor_type)
            .outerjoin(User, User.id == OrderStatusEvent.actor_user_id)
            .where(OrderStatusEvent.order_id.in_([o.id for o in by_shop]),
                   OrderStatusEvent.to_status == sm.CANCELLED)
        ).all()
        who = {oid: name or actor for oid, name, actor in events}
    lo, hi = day_bounds(branch, start, end)
    refunds, refunded = db.execute(
        select(func.count(Payment.id), func.coalesce(func.sum(Payment.amount_sen), 0))
        .join(Order, Order.id == Payment.order_id)
        .where(Order.branch_id == branch.id, Payment.kind == "refund", Payment.status == "succeeded",
               Payment.paid_at >= lo, Payment.paid_at < hi)
    ).one()
    return schemas.Cancellations(
        by_shop=len(by_shop), by_shop_value_sen=sum(o.total_sen for o in by_shop),
        unpaid=len(cancelled) - len(by_shop), refunds=int(refunds), refunded_sen=int(refunded),
        rows=[schemas.CancellationRow(order=_attention_order(o), reason=o.cancel_reason, cancelled_at=o.cancelled_at,
                                      cancelled_by=who.get(o.id), was_paid=o.payment_status in ("paid", "refunded"))
              for o in by_shop[:200]],
    )


# --- The two screens -----------------------------------------------------------------------------


def report(db: Session, branch: Branch, r: schemas.Range) -> schemas.Report:
    return schemas.Report(
        date_from=r.date_from, date_to=r.date_to, group_by=r.group_by,
        totals=totals(db, branch, r.date_from, r.date_to),
        periods=periods(db, branch, r.date_from, r.date_to, r.group_by),
        hours=hours(db, branch, r.date_from, r.date_to),
        items=items(db, branch, r.date_from, r.date_to),
        channels=channels(db, branch, r.date_from, r.date_to),
        payments=payments(db, branch, r.date_from, r.date_to),
        cancellations=cancellations(db, branch, r.date_from, r.date_to),
        previous=totals(db, branch, r.date_from - timedelta(days=(r.date_to - r.date_from).days + 1),
                        r.date_from - timedelta(days=1)),
    )


def backup_attention(now: datetime | None = None) -> schemas.Attention | None:
    """The nightly backup failed, or has not run for too long. There is no error tracker, so this is
    where a broken backup gets noticed. The backup container writes the status file after each run."""
    settings = get_settings()
    path = settings.backup_status_file
    if path is None:
        return None
    try:
        status = json.loads(path.read_text(encoding="utf-8"))
        finished = datetime.fromisoformat(status["finished_at"])
        if finished.tzinfo is None:
            finished = finished.replace(tzinfo=UTC)
    except FileNotFoundError:
        return schemas.Attention(kind="backup_late", message="No backup has run yet.")
    except (OSError, ValueError, KeyError, TypeError):
        return schemas.Attention(kind="backup_failed", message="The backup status file cannot be read.")
    if not status.get("ok"):
        return schemas.Attention(kind="backup_failed", since=finished, message=status.get("message"))
    if (now or utcnow()) - finished > timedelta(hours=settings.backup_max_age_hours):
        return schemas.Attention(kind="backup_late", since=finished)
    return None


def needs_attention(db: Session, branch: Branch, today: date) -> list[schemas.Attention]:
    """What the owner has to act on. Empty on a good day."""
    found: list[schemas.Attention] = []
    if backup := backup_attention():
        found.append(backup)
    base = Order.branch_id == branch.id

    # Money that came in for an order that was then cancelled, not yet refunded.
    for o in db.scalars(select(Order).where(base, Order.status == sm.CANCELLED, Order.payment_status == "paid")
                        .order_by(Order.id.desc()).limit(50)):
        found.append(schemas.Attention(kind="paid_but_cancelled", order=_attention_order(o), amount_sen=o.total_sen,
                                       since=o.cancelled_at))

    # More than one successful charge on an order that is still being sold.
    multi = select(Payment.order_id).where(Payment.kind == "charge", Payment.status == "succeeded") \
        .group_by(Payment.order_id).having(func.count(Payment.id) > 1)
    for o in db.scalars(select(Order).where(base, Order.id.in_(multi), Order.status != sm.CANCELLED).limit(50)):
        extra = sum(left for _, left in refundable_by_charge(db, o)) - o.total_sen
        if extra > 0:
            found.append(schemas.Attention(kind="duplicate_payment", order=_attention_order(o), amount_sen=extra))

    # Waiting at the counter for a long time: called out? collected without a tap?
    for o in db.scalars(select(Order).where(base, Order.status == sm.READY,
                                            Order.ready_at < utcnow() - READY_TOO_LONG).order_by(Order.ready_at)):
        found.append(schemas.Attention(kind="ready_too_long", order=_attention_order(o), since=o.ready_at))

    # Completed by the day close rather than by a person: was it really collected?
    for o in db.scalars(select(Order).where(base, Order.auto_closed.is_(True),
                                            Order.business_date >= today - timedelta(days=1))):
        found.append(schemas.Attention(kind="auto_closed", order=_attention_order(o), since=o.completed_at))

    # The gateway reported a different amount than the bill: the order was not placed.
    mismatched = db.scalars(select(AuditLog.entity_id).where(
        AuditLog.action == "payment_amount_mismatch", AuditLog.created_at >= utcnow() - timedelta(days=7))).all()
    if mismatched:
        for p, o in db.execute(select(Payment, Order).join(Order, Order.id == Payment.order_id).where(
                base, Payment.id.in_(mismatched), Payment.status != "succeeded")).all():
            found.append(schemas.Attention(kind="amount_mismatch", order=_attention_order(o), amount_sen=p.amount_sen,
                                           since=p.updated_at))
    return found


def dashboard(db: Session, branch: Branch) -> schemas.Dashboard:
    today = business_date(branch)
    live = dict(db.execute(select(Order.status, func.count(Order.id)).where(
        Order.branch_id == branch.id,
        Order.status.in_([sm.PENDING_PAYMENT, sm.PLACED, sm.PREPARING, sm.READY])).group_by(Order.status)).all())
    by_day = daily(db, branch, today - timedelta(days=13), today)
    last_week = today - timedelta(days=7)
    return schemas.Dashboard(
        business_date=today,
        today=totals(db, branch, today, today),
        live=schemas.LiveCounts(placed=live.get(sm.PLACED, 0), preparing=live.get(sm.PREPARING, 0),
                                ready=live.get(sm.READY, 0), awaiting_payment=live.get(sm.PENDING_PAYMENT, 0)),
        accepting_online_orders=branch.is_accepting_online_orders,
        online_payments_enabled=get_settings().online_payments_enabled,
        is_open=is_open(branch),
        top_items=[schemas.TopItem(menu_item_id=r.menu_item_id, name=r.name, quantity=r.quantity,
                                   sales_sen=r.sales_sen) for r in items(db, branch, today, today, limit=5)
                   if r.quantity > 0],
        last_14_days=[schemas.DayPoint(day=d, sales_sen=by_day.get(d, (0, 0))[0], orders=by_day.get(d, (0, 0))[1])
                      for d in (today - timedelta(days=13 - i) for i in range(14))],
        needs_attention=needs_attention(db, branch, today),
        same_day_last_week=totals(db, branch, last_week, last_week, until=utcnow() - timedelta(days=7)),
        # Abandoned online checkouts were never orders the shop took, so they are not "cancelled" here.
        cancelled_today=db.scalar(select(func.count(Order.id)).where(
            Order.branch_id == branch.id, Order.business_date == today, Order.status == sm.CANCELLED,
            func.coalesce(Order.cancel_reason, "").not_in(UNPAID_REASONS))) or 0,
        hours_today=hours(db, branch, today, today),
        hours_same_day_last_week=hours(db, branch, last_week, last_week),
    )


def units_sold(db: Session, branch: Branch, days: int) -> list[schemas.UnitsSoldRow]:
    """Units per menu item over the last `days` business days, today included. Unsold items are left out."""
    today = business_date(branch)
    rows = db.execute(
        select(OrderItem.menu_item_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.branch_id == branch.id, Order.status.in_(SALES_STATUSES),
               Order.business_date >= today - timedelta(days=days - 1), Order.business_date <= today)
        .group_by(OrderItem.menu_item_id)
    ).all()
    return [schemas.UnitsSoldRow(menu_item_id=mid, units=int(n)) for mid, n in rows]


# --- CSV for the accountant ----------------------------------------------------------------------


def orders_csv(db: Session, branch: Branch, start: date, end: date) -> str:
    tz = ZoneInfo(branch.timezone)
    rows = db.execute(
        select(Order, User.full_name).outerjoin(User, User.id == Order.created_by_user_id)
        .where(Order.branch_id == branch.id, Order.business_date >= start, Order.business_date <= end,
               Order.status != sm.PENDING_PAYMENT)
        .order_by(Order.business_date, Order.order_number)
    ).all()
    methods = defaultdict(set)
    for oid, method in db.execute(select(Payment.order_id, Payment.method).where(
            Payment.order_id.in_([o.id for o, _ in rows]) if rows else and_(False),
            Payment.kind == "charge", Payment.status == "succeeded")).all():
        methods[oid].add(method)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["business_date", "order_number", "order_id", "time", "channel", "status", "payment_status",
                "payment_method", "subtotal_rm", "tax_rm", "total_rm", "keyed_in_by", "cancel_reason"])
    for o, staff in rows:
        at = o.placed_at or o.created_at
        w.writerow([o.business_date.isoformat(), fmt_number(o.order_number), o.order_code,
                    at.astimezone(tz).strftime("%H:%M"), o.channel, o.status, o.payment_status,
                    "+".join(sorted(methods.get(o.id, []))), f"{o.subtotal_sen / 100:.2f}", f"{o.tax_sen / 100:.2f}",
                    f"{o.total_sen / 100:.2f}", staff or "", o.cancel_reason or ""])
    return out.getvalue()


# --- Audit log -----------------------------------------------------------------------------------


def audit_page(db: Session, branch: Branch, f: schemas.AuditFilter) -> schemas.AuditPage:
    stmt = select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.actor_user_id)
    if f.date_from or f.date_to:
        lo, hi = day_bounds(branch, f.date_from or date(2000, 1, 1), f.date_to or business_date(branch))
        stmt = stmt.where(AuditLog.created_at >= lo, AuditLog.created_at < hi)
    if f.action:
        stmt = stmt.where(AuditLog.action == f.action)
    if f.entity_type:
        stmt = stmt.where(AuditLog.entity_type == f.entity_type)
    if f.actor_id:
        stmt = stmt.where(AuditLog.actor_user_id == f.actor_id)
    if f.cursor:
        stmt = stmt.where(AuditLog.id < f.cursor)
    rows = db.execute(stmt.order_by(AuditLog.id.desc()).limit(f.limit + 1)).all()
    more = len(rows) > f.limit
    rows = rows[:f.limit]
    return schemas.AuditPage(
        rows=[schemas.AuditRow(id=a.id, created_at=a.created_at, actor_name=name, action=a.action,
                               entity_type=a.entity_type, entity_id=a.entity_id, before=a.before, after=a.after,
                               ip=a.ip) for a, name in rows],
        next_cursor=rows[-1][0].id if more else None,
        actions=sorted(db.scalars(select(AuditLog.action).distinct())),
    )
