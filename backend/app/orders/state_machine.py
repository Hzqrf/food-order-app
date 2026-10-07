"""The allowed status transitions, and the only code that writes orders.status."""
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import audit
from app.errors import AppError
from app.models import Order, OrderStatusEvent, utcnow

PENDING_PAYMENT = "pending_payment"
PLACED = "placed"
PREPARING = "preparing"
READY = "ready"
COMPLETED = "completed"
CANCELLED = "cancelled"

STATUSES = (PENDING_PAYMENT, PLACED, PREPARING, READY, COMPLETED, CANCELLED)
ACTIVE = (PLACED, PREPARING, READY)  # what the kitchen board shows

SYSTEM, CUSTOMER, STAFF, ADMIN = "system", "customer", "staff", "admin"

# (from, to) -> who may make that move. Forward skips are allowed for staff.
_FORWARD = {
    (PENDING_PAYMENT, PLACED): {SYSTEM},
    (PENDING_PAYMENT, CANCELLED): {SYSTEM, CUSTOMER, ADMIN},
    (PLACED, PREPARING): {STAFF, ADMIN},
    (PLACED, READY): {STAFF, ADMIN},
    (PLACED, COMPLETED): {STAFF, ADMIN},
    (PREPARING, READY): {STAFF, ADMIN},
    (PREPARING, COMPLETED): {STAFF, ADMIN},
    (READY, COMPLETED): {STAFF, ADMIN, SYSTEM},
    (PLACED, CANCELLED): {STAFF, ADMIN},
    (PREPARING, CANCELLED): {ADMIN},
    (READY, CANCELLED): {ADMIN},
}
# Corrections of a wrong tap. Admin only, and always audited.
_BACKWARD = {
    (PREPARING, PLACED): {ADMIN},
    (READY, PREPARING): {ADMIN},
    (READY, PLACED): {ADMIN},
    (COMPLETED, READY): {ADMIN},
}
ALLOWED = {**_FORWARD, **_BACKWARD}

_TIMESTAMP = {PLACED: "placed_at", READY: "ready_at", COMPLETED: "completed_at", CANCELLED: "cancelled_at"}


def can_transition(from_status: str, to_status: str, actor: str) -> bool:
    return actor in ALLOWED.get((from_status, to_status), set())


def transition(db: Session, order: Order, to_status: str, actor: str, actor_user_id: int | None = None,
               expected_version: int | None = None, note: str | None = None,
               cancel_reason: str | None = None, ip: str | None = None) -> Order:
    """Move an order to a new status, guarded by the allowed table and the order's version.

    The UPDATE matches on (id, version), so of two people tapping the same card only the first wins;
    the second gets 409 version_conflict.
    """
    from_status = order.status
    version = order.version if expected_version is None else expected_version
    if version != order.version:
        raise AppError("version_conflict", "This order was changed by someone else.", 409)
    if not can_transition(from_status, to_status, actor):
        raise AppError("invalid_transition", f"Cannot move an order from {from_status} to {to_status}.", 409)
    if to_status == CANCELLED and not cancel_reason:
        raise AppError("reason_required", "Give a reason for cancelling.", 422)

    values: dict = {"status": to_status, "version": version + 1}
    if field := _TIMESTAMP.get(to_status):
        values[field] = utcnow()
    if to_status == CANCELLED:
        values["cancel_reason"] = cancel_reason
    result = db.execute(
        update(Order).where(Order.id == order.id, Order.version == version).values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise AppError("version_conflict", "This order was changed by someone else.", 409)

    db.add(OrderStatusEvent(order_id=order.id, from_status=from_status, to_status=to_status,
                            actor_type=actor, actor_user_id=actor_user_id, note=note or cancel_reason))
    if (from_status, to_status) in _BACKWARD:
        audit(db, actor_user_id, "order_status_corrected", "order", order.id,
              {"status": from_status}, {"status": to_status, "note": note}, ip)
    db.flush()
    db.refresh(order)
    return order


def record_creation(db: Session, order: Order, actor: str, actor_user_id: int | None) -> None:
    """The first event of every order: from nothing to its starting status."""
    db.add(OrderStatusEvent(order_id=order.id, from_status=None, to_status=order.status,
                            actor_type=actor, actor_user_id=actor_user_id))
