"""Online payments. The order always exists before payment starts, and only a verified webhook or a
server-side status query proves that money arrived. The browser redirect never does.
"""
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import audit
from app.config import get_settings
from app.errors import AppError, not_found
from app.models import Order, Payment, utcnow
from app.orders import state_machine as sm
from app.payments.gateway import GatewayError, GatewayResult, get_gateway

log = logging.getLogger("app.payments")

RECONCILE_AFTER = timedelta(minutes=2)


def expiry_of(order: Order):
    return order.created_at + timedelta(minutes=get_settings().unpaid_expiry_minutes)


def open_payment(db: Session, order: Order) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.kind == "charge",
                                           Payment.status == "pending").order_by(Payment.id.desc()).limit(1))


def start_payment(db: Session, order: Order) -> str | None:
    """A payment URL for an unpaid order. Reuses the open bill, so an order has one open payment.

    Returns None if the gateway is unreachable; the order stays unpaid and the customer can retry.
    """
    current = open_payment(db, order)
    if current and current.raw_payload and current.raw_payload.get("payment_url"):
        return current.raw_payload["payment_url"]

    gateway = get_gateway()
    settings = get_settings()
    payment = Payment(order_id=order.id, kind="charge", method="gateway", provider=gateway.provider,
                      amount_sen=order.total_sen, status="pending", raw_payload={})
    db.add(payment)
    db.flush()
    try:
        bill = gateway.create_bill(
            reference=f"P{payment.id}", amount_sen=order.total_sen,
            description=f"Order {order.order_number:03d}", customer_name=order.customer_name or "",
            customer_phone=order.customer_phone or "",
            return_url=f"{settings.public_base_url}/t/{order.public_token}",
            callback_url=f"{settings.public_base_url}/api/v1/webhooks/payments/{gateway.provider}",
        )
    except GatewayError as e:
        log.warning("create_bill failed", extra={"order_id": order.id, "error": str(e)})
        payment.status = "failed"
        payment.raw_payload = {"error": str(e)}
        return None
    payment.provider_ref = bill.provider_ref
    payment.raw_payload = {"payment_url": bill.payment_url}
    return bill.payment_url


def apply_result(db: Session, payment_id: int, result: GatewayResult) -> None:
    """Record what the gateway says about a payment. Safe to call any number of times."""
    payment = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update()
                        .execution_options(populate_existing=True))
    if payment is None or payment.status == "succeeded":
        return  # already applied: a repeated webhook, or the reconcile job got there first
    raw = {**(payment.raw_payload or {}), "result": result.raw}

    if result.status in ("failed", "expired"):
        if payment.status == "pending":
            payment.status, payment.raw_payload = result.status, raw
        return
    if result.status != "paid":
        return

    if result.amount_sen != payment.amount_sen:
        payment.raw_payload = raw
        audit(db, None, "payment_amount_mismatch", "payment", payment.id,
              {"expected_sen": payment.amount_sen}, {"received_sen": result.amount_sen})
        log.error("payment amount mismatch", extra={"payment_id": payment.id})
        return

    payment.status, payment.paid_at, payment.raw_payload = "succeeded", utcnow(), raw
    order = db.scalar(select(Order).where(Order.id == payment.order_id).with_for_update()
                      .execution_options(populate_existing=True))
    if order.status == sm.PENDING_PAYMENT:
        sm.transition(db, order, sm.PLACED, sm.SYSTEM, note="payment confirmed")
        order.payment_status = "paid"
    elif order.payment_status in ("paid", "refunded"):
        # A second bill for the same order was paid too. The owner refunds it.
        audit(db, None, "duplicate_payment", "order", order.id, None,
              {"payment_id": payment.id, "amount_sen": payment.amount_sen})
    else:
        # The money arrived after the order expired or was cancelled. It stays cancelled and shows
        # up as "paid but cancelled" for the owner to refund.
        order.payment_status = "paid"
        audit(db, None, "paid_after_cancel", "order", order.id, None,
              {"payment_id": payment.id, "amount_sen": payment.amount_sen})
    db.flush()


def handle_webhook(db: Session, provider: str, headers: dict[str, str], body: bytes) -> None:
    gateway = get_gateway()
    if provider != gateway.provider:
        raise not_found("Unknown payment provider.")
    result = gateway.verify_webhook({k.lower(): v for k, v in headers.items()}, body)
    if result is None:
        raise AppError("invalid_signature", "Webhook signature is not valid.", 400)
    payment = db.scalar(select(Payment).where(Payment.provider_ref == result.provider_ref))
    if payment is None:
        # Acknowledge so the gateway stops retrying, and leave a trace for investigation.
        log.warning("webhook for unknown payment", extra={"provider_ref": result.provider_ref})
        return
    apply_result(db, payment.id, result)


def _query(db: Session, payment: Payment) -> None:
    try:
        result = get_gateway().get_status(payment.provider_ref)
    except GatewayError as e:
        log.warning("status query failed", extra={"payment_id": payment.id, "error": str(e)})
        return
    if result.status != "pending":
        apply_result(db, payment.id, result)


def reconcile(db: Session) -> int:
    """Ask the gateway about payments still pending after 2 minutes, in case a webhook was lost."""
    cutoff = utcnow() - RECONCILE_AFTER
    pending = db.scalars(select(Payment).where(
        Payment.status == "pending", Payment.method == "gateway", Payment.provider_ref.is_not(None),
        Payment.created_at < cutoff)).all()
    for payment in pending:
        _query(db, payment)
    return len(pending)


def expire_unpaid(db: Session) -> int:
    """Cancel orders unpaid after the expiry window, checking with the gateway one last time first."""
    cutoff = utcnow() - timedelta(minutes=get_settings().unpaid_expiry_minutes)
    expired = 0
    for order in db.scalars(select(Order).where(Order.status == sm.PENDING_PAYMENT, Order.created_at < cutoff)).all():
        for payment in db.scalars(select(Payment).where(Payment.order_id == order.id, Payment.status == "pending",
                                                        Payment.provider_ref.is_not(None))).all():
            _query(db, payment)
        db.refresh(order)
        if order.status != sm.PENDING_PAYMENT:
            continue  # it was paid after all
        sm.transition(db, order, sm.CANCELLED, sm.SYSTEM, cancel_reason="payment_expired")
        close_open_payments(db, order)
        expired += 1
    return expired


def close_open_payments(db: Session, order: Order) -> None:
    for payment in db.scalars(select(Payment).where(Payment.order_id == order.id, Payment.status == "pending")):
        payment.status = "expired"
