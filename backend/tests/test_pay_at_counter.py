import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AuditLog
from tests.conftest import login, new_key
from tests.test_online import place

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


# --- Placing pay-at-counter orders --------------------------------------------------------------


def order_at_counter(client, menu, key=None, phone="012-345 6789"):
    return place(client, menu, key=key, phone=phone, pay_at_counter=True)


@pytest.fixture
def counter_shop(db, branch, no_gateway):
    counter_on(db, branch)
    return branch


def test_counter_order_goes_straight_to_the_kitchen(client, staff, menu, counter_shop):
    r = order_at_counter(client, menu)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["payment_url"] is None
    track = client.get(f"{API}/t/{body['token']}").json()
    assert (track["status"], track["payment_status"], track["pay_at_counter"]) == ("placed", "unpaid", True)
    login(client, staff.username)
    board = client.get(f"{API}/staff/orders").json()
    assert [(o["status"], o["payment_status"], o["pay_at_counter"]) for o in board] == [("placed", "unpaid", True)]


def test_counter_order_needs_a_phone(client, menu, counter_shop):
    for phone in (None, "12"):
        r = order_at_counter(client, menu, phone=phone)
        assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_phone"


def test_one_unpaid_counter_order_per_phone(client, staff, menu, counter_shop):
    first = order_at_counter(client, menu).json()
    r = order_at_counter(client, menu)
    assert r.status_code == 429 and r.json()["error"]["code"] == "unpaid_at_counter"
    assert order_at_counter(client, menu, phone="013-222 3333").status_code == 201

    login(client, staff.username)
    order_id = next(o["id"] for o in client.get(f"{API}/staff/orders").json() if o["order_code"] == first["order_code"])
    assert client.post(f"{API}/staff/orders/{order_id}/cancel", json={"version": 1, "reason": "x"}).status_code == 200
    assert order_at_counter(client, menu).status_code == 201


def test_same_key_retry_is_not_a_second_order(client, menu, counter_shop):
    key = new_key()
    first = order_at_counter(client, menu, key=key)
    again = order_at_counter(client, menu, key=key)
    assert first.status_code == 201 and again.status_code in (200, 201)
    assert again.json()["order_code"] == first.json()["order_code"]


def test_pay_at_counter_respects_pause_and_hours(client, menu, db, counter_shop):
    counter_shop.is_accepting_online_orders = False
    db.commit()
    assert order_at_counter(client, menu).json()["error"]["code"] == "shop_closed"
    counter_shop.is_accepting_online_orders = True
    counter_shop.opening_hours = {}
    db.commit()
    assert order_at_counter(client, menu).json()["error"]["code"] == "shop_closed"


def test_option_that_is_off_is_refused(client, menu, db, branch, monkeypatch):
    # Fake gateway on, counter off: paying at the counter isn't offered.
    r = order_at_counter(client, menu)
    assert r.status_code == 409 and r.json()["error"]["code"] == "payment_option_off"
    # No gateway, counter on: paying online isn't offered.
    monkeypatch.setattr(get_settings(), "payment_gateway", "none")
    counter_on(db, branch)
    r = place(client, menu)
    assert r.status_code == 409 and r.json()["error"]["code"] == "payment_option_off"
