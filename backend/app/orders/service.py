import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.audit import audit
from app.deps import actor_type
from app.errors import AppError, not_found
from app.models import (Branch, MenuItem, MenuItemOptionGroup, Option, OptionGroup, Order, OrderCounter,
                        OrderItem, OrderItemOption, OrderStatusEvent, Payment, User, utcnow)
from app.orders import pricing, schemas
from app.orders import state_machine as sm
from app.payments import service as payments
from app.phone import normalize_my_phone
from app.security import limiter
from app.shop.service import business_date, is_open

STAFF_SEARCH_DAYS = 7


# --- Pricing -------------------------------------------------------------------------------------


def load_menu_index(db: Session, item_ids: set[int]) -> pricing.MenuIndex:
    rows = db.scalars(
        select(MenuItem).where(MenuItem.id.in_(item_ids))
        .options(selectinload(MenuItem.category),
                 selectinload(MenuItem.group_links).selectinload(MenuItemOptionGroup.group)
                 .selectinload(OptionGroup.options))
    ).all()
    items, groups, options = {}, {}, {}
    for row in rows:
        group_ids = []
        for link in row.group_links:
            g = link.group
            if not g.is_active:
                continue
            group_ids.append(g.id)
            groups[g.id] = pricing.MenuGroup(
                id=g.id, name=g.name, min_select=g.min_select, max_select=g.max_select,
                option_ids=tuple(o.id for o in g.options if o.is_active))
            for o in g.options:
                options[o.id] = pricing.MenuOption(id=o.id, group_id=g.id, name=o.name,
                                                   price_delta_sen=o.price_delta_sen,
                                                   available=o.is_active and not o.is_sold_out)
        items[row.id] = pricing.MenuItem(id=row.id, name=row.name, price_sen=row.price_sen,
                                         active=row.is_active and row.category.is_active,
                                         sold_out=row.is_sold_out, group_ids=tuple(group_ids))
    return pricing.MenuIndex(items=items, groups=groups, options=options)


def price(db: Session, lines: list[schemas.CartLineIn]) -> pricing.PriceResult:
    cart = [pricing.CartLine(menu_item_id=line.menu_item_id, quantity=line.quantity,
                             option_ids=tuple(line.option_ids), note=line.note) for line in lines]
    return pricing.price_cart(cart, load_menu_index(db, {line.menu_item_id for line in lines}))


def quote(db: Session, body: schemas.QuoteIn) -> schemas.QuoteOut:
    result = price(db, body.items)
    return schemas.QuoteOut(
        lines=[schemas.QuotedLine(
            menu_item_id=line.menu_item_id, item_name=line.item_name, unit_price_sen=line.unit_price_sen,
            options_total_sen=line.options_total_sen, quantity=line.quantity, line_total_sen=line.line_total_sen,
            options=[schemas.QuotedOption(**o.__dict__) for o in line.options],
        ) for line in result.lines],
        subtotal_sen=result.subtotal_sen,
        total_sen=result.subtotal_sen,
        problems=[schemas.Problem(**p.as_dict()) for p in result.problems],
    )


def priced_or_conflict(db: Session, lines: list[schemas.CartLineIn],
                       expected_total_sen: int | None) -> pricing.PriceResult:
    result = price(db, lines)
    if not result.ok:
        raise AppError("cart_changed", "Some items changed since you added them.", 409,
                       [p.as_dict() for p in result.problems])
    if expected_total_sen is not None and expected_total_sen != result.subtotal_sen:
        raise AppError("cart_changed", "The total has changed.", 409,
                       [{"reason": "total_changed", "new_total_sen": result.subtotal_sen}])
    return result


# --- Creating orders -----------------------------------------------------------------------------


def lock_counter(db: Session, branch_id: int, day) -> OrderCounter:
    """Create-or-lock the day's counter row in one statement, held until the transaction ends.

    Order creation is serialised on this row, so numbers are never handed out twice. A plain
    INSERT racing other INSERTs of the same key can deadlock on MySQL; the upsert cannot.
    """
    if db.bind.dialect.name == "mysql":
        stmt = mysql_insert(OrderCounter).values(branch_id=branch_id, business_date=day, last_number=0)
        db.execute(stmt.on_duplicate_key_update(last_number=stmt.inserted.last_number + OrderCounter.last_number))
    else:
        db.execute(sqlite_insert(OrderCounter).values(branch_id=branch_id, business_date=day, last_number=0)
                   .on_conflict_do_nothing())
    return db.scalar(select(OrderCounter)
                     .where(OrderCounter.branch_id == branch_id, OrderCounter.business_date == day)
                     .with_for_update().execution_options(populate_existing=True))


def next_order_number(db: Session, branch_id: int, day) -> int:
    counter = lock_counter(db, branch_id, day)
    counter.last_number += 1
    db.flush()
    return counter.last_number


def find_by_idempotency_key(db: Session, key: str) -> Order | None:
    return db.scalar(select(Order).where(Order.idempotency_key == key))


def check_idempotency_key(key: str | None) -> str:
    if not key or not (8 <= len(key) <= 64):
        raise AppError("idempotency_key_required", "An Idempotency-Key header (8 to 64 characters) is required.", 400)
    return key


def _build_order(branch: Branch, result: pricing.PriceResult, **fields) -> Order:
    order = Order(branch_id=branch.id, public_token=secrets.token_urlsafe(24), subtotal_sen=result.subtotal_sen,
                  discount_sen=0, tax_sen=0, total_sen=result.subtotal_sen, version=1, **fields)
    for line in result.lines:
        item = OrderItem(menu_item_id=line.menu_item_id, item_name=line.item_name,
                         unit_price_sen=line.unit_price_sen, options_total_sen=line.options_total_sen,
                         quantity=line.quantity, line_total_sen=line.line_total_sen, note=line.note)
        item.options = [OrderItemOption(option_id=o.option_id, group_name=o.group_name,
                                        option_name=o.option_name, price_sen=o.price_sen) for o in line.options]
        order.items.append(item)
    return order


def _insert_numbered(db: Session, branch: Branch, result: pricing.PriceResult, idempotency_key: str, now,
                     **fields) -> tuple[Order, bool]:
    """Number and insert a new order. Returns (order, created); a repeated key returns the first order."""
    day = business_date(branch, now)
    counter = lock_counter(db, branch.id, day)
    # Checked again under the lock: a simultaneous duplicate has committed by now and is visible.
    if existing := find_by_idempotency_key(db, idempotency_key):
        return existing, False
    counter.last_number += 1
    order = _build_order(branch, result, business_date=day, order_number=counter.last_number,
                         idempotency_key=idempotency_key, **fields)
    try:
        with db.begin_nested():
            db.add(order)
            db.flush()
    except IntegrityError:
        if existing := find_by_idempotency_key(db, idempotency_key):
            return existing, False
        raise
    return order, True


def create_counter_order(db: Session, branch: Branch, user: User, body: schemas.CounterOrderIn,
                         idempotency_key: str) -> tuple[Order, int | None, bool]:
    """Order and payment in one action, so there is never an unpaid counter order.

    Returns (order, change in sen for cash, created). A repeated key returns the first order.
    """
    if existing := find_by_idempotency_key(db, idempotency_key):
        return existing, _change_from(existing), False

    result = priced_or_conflict(db, body.items, body.expected_total_sen)
    total = result.subtotal_sen
    change = None
    if body.payment.method == "cash":
        tendered = body.payment.tendered_sen if body.payment.tendered_sen is not None else total
        if tendered < total:
            raise AppError("insufficient_cash", "The amount given is less than the total.", 422)
        change = tendered - total

    now = utcnow()
    order, created = _insert_numbered(
        db, branch, result, idempotency_key, now,
        channel=body.channel, created_by_user_id=user.id, customer_name=body.customer_name, note=body.note,
        status=sm.PLACED, payment_status="paid", placed_at=now,
    )
    if not created:
        return order, _change_from(order), False
    db.add(Payment(order_id=order.id, kind="charge", method=body.payment.method, amount_sen=total,
                   status="succeeded", paid_at=now, recorded_by_user_id=user.id,
                   raw_payload={"tendered_sen": body.payment.tendered_sen, "change_sen": change}))
    sm.record_creation(db, order, actor_type(user), user.id)
    db.flush()
    return order, change, True


MAX_UNPAID_PER_PHONE = 3


def create_online_order(db: Session, branch: Branch, body: schemas.OnlineOrderIn, idempotency_key: str,
                        ip: str) -> tuple[Order, str | None, bool]:
    """Save the order as pending_payment, then open a bill. The kitchen sees it only once paid.

    Returns (order, payment URL, created).
    """
    if existing := find_by_idempotency_key(db, idempotency_key):
        return existing, _payment_url_for(db, existing), False

    if not (is_open(branch) and branch.is_accepting_online_orders):
        raise AppError("shop_closed", "The shop is not taking online orders right now.", 409)
    limiter.hit("online-order", ip, limit=10, window_seconds=600)
    phone = normalize_my_phone(body.customer_phone)
    if phone is None:
        raise AppError("invalid_phone", "Enter a Malaysian phone number, for example 012-345 6789.", 422,
                       [{"field": "customer_phone", "message": "invalid phone number"}])
    unpaid = db.scalar(select(func.count(Order.id)).where(Order.customer_phone == phone,
                                                          Order.status == sm.PENDING_PAYMENT))
    if unpaid >= MAX_UNPAID_PER_PHONE:
        raise AppError("too_many_unpaid", "Finish paying for your earlier orders first.", 429)

    result = priced_or_conflict(db, body.items, body.expected_total_sen)
    order, created = _insert_numbered(
        db, branch, result, idempotency_key, utcnow(),
        channel="online", created_by_user_id=None, customer_name=body.customer_name, customer_phone=phone,
        note=body.note, status=sm.PENDING_PAYMENT, payment_status="unpaid",
    )
    if not created:
        return order, _payment_url_for(db, order), False
    sm.record_creation(db, order, sm.CUSTOMER, None)
    return order, payments.start_payment(db, order), True


def _payment_url_for(db: Session, order: Order) -> str | None:
    if order.status != sm.PENDING_PAYMENT:
        return None
    current = payments.open_payment(db, order)
    return (current.raw_payload or {}).get("payment_url") if current else None


# --- Customer tracking link ----------------------------------------------------------------------

DETAIL_VISIBLE_FOR = timedelta(hours=48)


def by_token(db: Session, token: str, ip: str) -> Order:
    limiter.hit("tracking", ip, limit=120, window_seconds=60)
    order = db.scalar(select(Order).where(Order.public_token == token)
                      .options(selectinload(Order.items).selectinload(OrderItem.options)))
    if order is None:
        raise not_found("Order not found.")
    return order


def _expired(order: Order) -> bool:
    return utcnow() >= payments.expiry_of(order)


def tracking(order: Order, branch: Branch) -> schemas.TrackingOut:
    base = dict(order_number=fmt_number(order.order_number), status=order.status,
                payment_status=order.payment_status, shop_name=branch.name)
    if order.completed_at and utcnow() - order.completed_at > DETAIL_VISIBLE_FOR:
        return schemas.TrackingOut(**base, detail_hidden=True)
    pending = order.status == sm.PENDING_PAYMENT
    return schemas.TrackingOut(
        **base,
        # First name only, and never the phone number.
        customer_name=(order.customer_name or "").split(" ")[0] or None,
        channel=order.channel,
        items=[schemas.TrackingLine(menu_item_id=i.menu_item_id, item_name=i.item_name, quantity=i.quantity,
                                    line_total_sen=i.line_total_sen, note=i.note,
                                    option_ids=[o.option_id for o in i.options],
                                    option_names=[o.option_name for o in i.options]) for i in order.items],
        total_sen=order.total_sen, note=order.note, prep_minutes=branch.prep_minutes,
        created_at=order.created_at, placed_at=order.placed_at, ready_at=order.ready_at,
        completed_at=order.completed_at, cancelled_at=order.cancelled_at, cancel_reason=order.cancel_reason,
        expires_at=payments.expiry_of(order) if pending else None,
        can_pay=pending and not _expired(order), can_cancel=pending,
    )


def pay_again(db: Session, order: Order) -> str:
    if order.status != sm.PENDING_PAYMENT:
        raise AppError("not_payable", "This order does not need paying.", 409)
    if _expired(order):
        raise AppError("order_expired", "This order expired before it was paid. Please order again.", 409)
    url = payments.start_payment(db, order)
    if url is None:
        raise AppError("payment_unavailable", "Payments are not available right now. Try again shortly.", 503)
    return url


def customer_cancel(db: Session, order: Order) -> Order:
    if order.status != sm.PENDING_PAYMENT:
        raise AppError("invalid_transition", "Only unpaid orders can be cancelled here. Please talk to the shop.", 409)
    sm.transition(db, order, sm.CANCELLED, sm.CUSTOMER, cancel_reason="customer_cancelled")
    payments.close_open_payments(db, order)
    return order


def _change_from(order: Order) -> int | None:
    for p in order.payments:
        if p.kind == "charge" and p.raw_payload:
            return p.raw_payload.get("change_sen")
    return None


# --- Reading orders ------------------------------------------------------------------------------

_LOAD = (selectinload(Order.items).selectinload(OrderItem.options), selectinload(Order.created_by))


def board(db: Session, branch: Branch) -> list[Order]:
    return list(db.scalars(
        select(Order).where(Order.branch_id == branch.id, Order.status.in_(sm.ACTIVE))
        .options(*_LOAD).order_by(Order.placed_at, Order.id)
    ))


def get_order(db: Session, order_id: int, user: User, branch: Branch) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id).options(
        *_LOAD, selectinload(Order.events).selectinload(OrderStatusEvent.actor), selectinload(Order.payments)))
    if order is None or (user.role != "admin" and order.business_date < _staff_cutoff(branch)):
        raise not_found("Order not found.")
    return order


def _staff_cutoff(branch: Branch):
    return business_date(branch) - timedelta(days=STAFF_SEARCH_DAYS - 1)


def search(db: Session, q: str, user: User, branch: Branch) -> list[Order]:
    q = q.strip()
    stmt = select(Order).where(Order.branch_id == branch.id, Order.status != sm.PENDING_PAYMENT)
    if user.role != "admin":
        stmt = stmt.where(Order.business_date >= _staff_cutoff(branch))
    if q.isdigit() and len(q) <= 4:
        stmt = stmt.where(Order.order_number == int(q))
    elif phone := normalize_my_phone(q):
        stmt = stmt.where(Order.customer_phone == phone)
    elif len(q) >= 2:
        stmt = stmt.where(Order.customer_name.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    else:
        return []
    return list(db.scalars(stmt.options(*_LOAD).order_by(Order.id.desc()).limit(50)))


# --- Changing orders -----------------------------------------------------------------------------


def _locked(db: Session, order_id: int) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise not_found("Order not found.")
    return order


def move(db: Session, order_id: int, user: User, body: schemas.TransitionIn, ip: str) -> Order:
    order = _locked(db, order_id)
    return sm.transition(db, order, body.to, actor_type(user), user.id, body.version, note=body.note, ip=ip)


def cancel(db: Session, order_id: int, user: User, body: schemas.CancelIn, ip: str) -> Order:
    order = _locked(db, order_id)
    paid = order.payment_status == "paid"
    if paid and body.refund_method is None:
        raise AppError("refund_required", "This order was paid. Choose how the money goes back.", 422)
    charge = _last_charge(db, order) if paid else None
    online = charge is not None and charge.method == "gateway"
    if body.refund_method == "later" and not online:
        raise AppError("refund_required", "Choose how the money goes back.", 422)
    if online and body.refund_method != "later" and user.role != "admin":
        # Staff cannot send money back through the gateway; the owner does, then records it.
        raise AppError("forbidden", "Online payments are refunded by the owner.", 403)
    sm.transition(db, order, sm.CANCELLED, actor_type(user), user.id, body.version, cancel_reason=body.reason)
    if paid and body.refund_method == "later":
        audit(db, user.id, "order_cancelled_after_payment", "order", order.id,
              {"status": "paid"}, {"reason": body.reason, "refund": "owner to refund through the gateway"}, ip)
    elif paid:
        audit(db, user.id, "order_cancelled_after_payment", "order", order.id,
              {"status": "paid"}, {"reason": body.reason}, ip)
        _record_refund(db, order, user, body.refund_method, body.reason, ip)
    return order


def refund(db: Session, order_id: int, admin: User, body: schemas.RefundIn, ip: str) -> Order:
    """A refund that does not change order status, e.g. a completed order the customer was unhappy with."""
    order = _locked(db, order_id)
    if order.payment_status != "paid":
        raise AppError("not_refundable", "Only paid orders can be refunded.", 409)
    _record_refund(db, order, admin, body.refund_method, body.reason, ip)
    return order


def _last_charge(db: Session, order: Order) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.kind == "charge",
                                           Payment.status == "succeeded").order_by(Payment.id.desc()).limit(1))


def _record_refund(db: Session, order: Order, user: User, refund_method: str, reason: str, ip: str) -> None:
    payments = db.scalars(select(Payment).where(Payment.order_id == order.id, Payment.status == "succeeded")).all()
    charges = [p for p in payments if p.kind == "charge"]
    refunded = sum(p.amount_sen for p in payments if p.kind == "refund")
    amount = sum(p.amount_sen for p in charges) - refunded
    if not charges or amount <= 0:
        raise AppError("not_refundable", "There is nothing left to refund on this order.", 409)
    charge = charges[-1]
    method = "cash" if refund_method == "cash" else charge.method
    db.add(Payment(order_id=order.id, kind="refund", method=method, provider=charge.provider, amount_sen=amount,
                   status="succeeded", paid_at=utcnow(), recorded_by_user_id=user.id,
                   refund_of_payment_id=charge.id, raw_payload={"reason": reason}))
    order.payment_status = "refunded"
    audit(db, user.id, "refund_recorded", "order", order.id, None,
          {"amount_sen": amount, "method": method, "reason": reason}, ip)
    db.flush()


# --- Output --------------------------------------------------------------------------------------


def fmt_number(n: int) -> str:
    return f"{n:03d}"


def summary(order: Order) -> dict:
    return dict(
        id=order.id, order_number=fmt_number(order.order_number), business_date=order.business_date.isoformat(),
        channel=order.channel, status=order.status, payment_status=order.payment_status,
        customer_name=order.customer_name, note=order.note, subtotal_sen=order.subtotal_sen,
        total_sen=order.total_sen, version=order.version, auto_closed=order.auto_closed,
        cancel_reason=order.cancel_reason,
        created_by_name=order.created_by.full_name if order.created_by else None,
        created_at=order.created_at, placed_at=order.placed_at, ready_at=order.ready_at,
        completed_at=order.completed_at, cancelled_at=order.cancelled_at,
        items=[schemas.OrderLine(
            id=i.id, menu_item_id=i.menu_item_id, item_name=i.item_name, quantity=i.quantity,
            unit_price_sen=i.unit_price_sen, options_total_sen=i.options_total_sen,
            line_total_sen=i.line_total_sen, note=i.note,
            options=[schemas.OrderOption(group_name=o.group_name, option_name=o.option_name, price_sen=o.price_sen)
                     for o in i.options],
        ) for i in order.items],
    )


def detail(db: Session, order: Order) -> schemas.OrderDetail:
    names = {u.id: u.full_name for u in db.scalars(select(User).where(
        User.id.in_({p.recorded_by_user_id for p in order.payments if p.recorded_by_user_id})))}
    return schemas.OrderDetail(
        **summary(order), customer_phone=order.customer_phone,
        events=[schemas.OrderEvent(from_status=e.from_status, to_status=e.to_status, actor_type=e.actor_type,
                                   actor_name=e.actor.full_name if e.actor else None, note=e.note,
                                   created_at=e.created_at) for e in order.events],
        payments=[schemas.OrderPayment(id=p.id, kind=p.kind, method=p.method, amount_sen=p.amount_sen,
                                       status=p.status, paid_at=p.paid_at,
                                       recorded_by_name=names.get(p.recorded_by_user_id))
                  for p in order.payments],
    )
