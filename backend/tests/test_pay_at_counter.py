import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AuditLog

API = "/api/v1"


@pytest.fixture
def no_gateway(monkeypatch):
    monkeypatch.setattr(get_settings(), "payment_gateway", "none")


def counter_on(db, branch, on=True):
    branch.pay_at_counter = on
    db.commit()


# --- Payment options ----------------------------------------------------------------------------


def test_no_gateway_and_counter_off_means_no_online_orders(client, staff_client, branch, no_gateway):
    shop = client.get(f"{API}/shop").json()
    assert shop["can_order_online"] is False and shop["online_ordering_available"] is False
    staff_client.patch(f"{API}/staff/shop/online-orders", json={"accepting": False})
    r = staff_client.patch(f"{API}/staff/shop/online-orders", json={"accepting": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_payment_option"


def test_counter_payment_turns_online_ordering_on(client, staff_client, db, branch, no_gateway):
    counter_on(db, branch)
    shop = client.get(f"{API}/shop").json()
    assert shop["can_order_online"] is True and shop["online_ordering_available"] is True
    assert shop["pay_at_counter"] is True and shop["pay_online_available"] is False
    assert staff_client.patch(f"{API}/staff/shop/online-orders", json={"accepting": False}).status_code == 200
    assert staff_client.patch(f"{API}/staff/shop/online-orders", json={"accepting": True}).status_code == 200


def test_owner_can_switch_off_online_payment(client, admin_client, branch):
    r = admin_client.patch(f"{API}/admin/settings", json={"pay_online": False})
    assert r.status_code == 200
    shop = client.get(f"{API}/shop").json()
    assert shop["pay_online_available"] is False and shop["pay_online_enabled"] is False
    assert shop["can_order_online"] is False


def test_payment_switches_are_audited(admin_client, db, branch):
    admin_client.patch(f"{API}/admin/settings", json={"pay_at_counter": True})
    log = db.scalars(select(AuditLog).where(AuditLog.action == "settings_changed")).one()
    assert (log.before, log.after) == ({"pay_at_counter": False}, {"pay_at_counter": True})
