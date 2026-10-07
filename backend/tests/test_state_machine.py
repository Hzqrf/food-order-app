import pytest
from sqlalchemy import select

from app.errors import AppError
from app.models import AuditLog, Order, OrderStatusEvent
from app.orders import state_machine as sm
from tests.conftest import counter_order


@pytest.mark.parametrize("from_,to,actor,allowed", [
    ("pending_payment", "placed", "system", True),
    ("pending_payment", "placed", "staff", False),  # only the payment webhook confirms payment
    ("placed", "preparing", "staff", True),
    ("placed", "completed", "staff", True),  # forward skip: a drink handed over at once
    ("preparing", "ready", "staff", True),
    ("ready", "completed", "system", True),  # day-close sweep
    ("placed", "cancelled", "staff", True),
    ("preparing", "cancelled", "staff", False),
    ("preparing", "cancelled", "admin", True),
    ("ready", "preparing", "staff", False),  # no backward moves for staff
    ("ready", "preparing", "admin", True),
    ("completed", "cancelled", "admin", False),  # refunds do not change status
    ("cancelled", "placed", "admin", False),
    ("placed", "pending_payment", "admin", False),
])
def test_allowed_table(from_, to, actor, allowed):
    assert sm.can_transition(from_, to, actor) is allowed


def _order(staff_client, menu, db) -> Order:
    r = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}])
    assert r.status_code == 201, r.text
    return db.get(Order, r.json()["id"])


def test_transition_bumps_version_sets_timestamp_and_writes_event(staff_client, menu, db, staff):
    order = _order(staff_client, menu, db)
    sm.transition(db, order, sm.READY, sm.STAFF, staff.id, expected_version=1)
    db.commit()
    assert (order.status, order.version) == ("ready", 2)
    assert order.ready_at is not None
    events = db.scalars(select(OrderStatusEvent).where(OrderStatusEvent.order_id == order.id)
                        .order_by(OrderStatusEvent.id)).all()
    assert [(e.from_status, e.to_status) for e in events] == [(None, "placed"), ("placed", "ready")]


def test_stale_version_is_a_conflict(staff_client, menu, db, staff):
    order = _order(staff_client, menu, db)
    with pytest.raises(AppError) as err:
        sm.transition(db, order, sm.PREPARING, sm.STAFF, staff.id, expected_version=0)
    assert err.value.code == "version_conflict"


def test_concurrent_update_loses_on_version(staff_client, menu, db, staff):
    """Another session moved the order after we loaded it: our UPDATE must match no row."""
    order = _order(staff_client, menu, db)
    db.execute(Order.__table__.update().where(Order.id == order.id).values(version=5))
    with pytest.raises(AppError) as err:
        sm.transition(db, order, sm.PREPARING, sm.STAFF, staff.id, expected_version=1)
    assert err.value.code == "version_conflict"


def test_cancel_needs_reason(staff_client, menu, db, staff):
    order = _order(staff_client, menu, db)
    with pytest.raises(AppError) as err:
        sm.transition(db, order, sm.CANCELLED, sm.STAFF, staff.id)
    assert err.value.code == "reason_required"


def test_admin_backward_correction_is_audited(staff_client, menu, db, admin, staff):
    order = _order(staff_client, menu, db)
    sm.transition(db, order, sm.READY, sm.STAFF, staff.id)
    sm.transition(db, order, sm.PREPARING, sm.ADMIN, admin.id, note="wrong tap")
    db.commit()
    log = db.scalar(select(AuditLog).where(AuditLog.action == "order_status_corrected"))
    assert log.before == {"status": "ready"} and log.after["status"] == "preparing"
