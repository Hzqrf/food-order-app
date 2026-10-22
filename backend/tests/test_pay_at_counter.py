from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.config import get_settings
from app.jobs import close_day
from app.models import AuditLog, Order, Payment
from app.shop.service import business_date
from tests.conftest import counter_order, login, new_key
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


# --- Taking payment at pickup -------------------------------------------------------------------


def unpaid_order(client, menu, admin) -> dict:
    """A RM10 pay-at-counter order, with the admin logged in on `client`."""
    order_at_counter(client, menu)
    login(client, admin.username)
    return next(o for o in client.get(f"{API}/staff/orders").json() if o["pay_at_counter"])


def take(client, order_id, key=None, **body):
    return client.post(f"{API}/staff/orders/{order_id}/payment", json=body,
                       headers={"Idempotency-Key": key or new_key()})


def charges(db, order_id):
    return db.scalars(select(Payment).where(Payment.order_id == order_id, Payment.kind == "charge")).all()


def test_take_cash_payment_with_change(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    r = take(client, o["id"], method="cash", tendered_sen=2000)
    assert r.status_code == 200, r.text
    assert (r.json()["change_sen"], r.json()["payment_status"]) == (1000, "paid")
    [p] = charges(db, o["id"])
    assert (p.method, p.status, p.amount_sen, p.recorded_by_user_id) == ("cash", "succeeded", 1000, admin.id)
    assert p.raw_payload["tendered_sen"] == 2000 and p.raw_payload["change_sen"] == 1000
    assert db.scalars(select(AuditLog).where(AuditLog.action == "payment_taken")).one().entity_id == o["id"]


def test_take_qr_payment(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    r = take(client, o["id"], method="qr_counter")
    assert r.status_code == 200 and r.json()["change_sen"] is None and r.json()["payment_status"] == "paid"


def test_take_payment_twice_is_refused(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    take(client, o["id"], method="qr_counter")
    r = take(client, o["id"], method="qr_counter")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_unpaid"
    assert len(charges(db, o["id"])) == 1


def test_take_payment_same_key_is_one_payment(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    key = new_key()
    assert take(client, o["id"], key=key, method="cash", tendered_sen=1000).status_code == 200
    again = take(client, o["id"], key=key, method="cash", tendered_sen=1000)
    assert again.status_code == 200 and again.json()["payment_status"] == "paid"
    assert len(charges(db, o["id"])) == 1


def test_take_payment_refuses_paid_orders(client, admin, menu, db, counter_shop):
    login(client, admin.username)
    paid = counter_order(client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    r = take(client, paid["id"], method="cash", tendered_sen=450)
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_unpaid"

    o = unpaid_order(client, menu, admin)
    client.post(f"{API}/staff/orders/{o['id']}/cancel", json={"version": o["version"], "reason": "x"})
    r = take(client, o["id"], method="qr_counter")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"


def test_insufficient_cash(client, admin, menu, counter_shop):
    o = unpaid_order(client, menu, admin)
    r = take(client, o["id"], method="cash", tendered_sen=500)
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_cash"


def move(client, o, to):
    return client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": to, "version": o["version"]})


def test_collect_needs_payment(client, admin, menu, counter_shop):
    o = unpaid_order(client, menu, admin)
    r = move(client, o, "ready")
    assert r.status_code == 200
    o = r.json()
    r = move(client, o, "completed")
    assert r.status_code == 409 and r.json()["error"]["code"] == "payment_needed"
    o = take(client, o["id"], method="qr_counter").json()
    assert move(client, o, "completed").status_code == 200


def sales_today(client) -> int:
    return client.get(f"{API}/admin/dashboard").json()["today"]["sales_sen"]


def test_no_show_cancel_needs_no_refund(client, admin, menu, counter_shop):
    o = unpaid_order(client, menu, admin)
    r = client.post(f"{API}/staff/orders/{o['id']}/cancel",
                    json={"version": o["version"], "reason": "Didn't come to collect"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert sales_today(client) == 0


def test_sales_count_after_payment(client, admin, menu, counter_shop):
    o = unpaid_order(client, menu, admin)
    assert sales_today(client) == 0
    take(client, o["id"], method="qr_counter")
    assert sales_today(client) == 1000


def test_day_close_leaves_unpaid_ready_orders_open(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    move(client, o, "ready")
    paid = counter_order(client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    move(client, paid, "ready")
    close_day(db)
    db.commit()
    db.expire_all()
    assert db.get(Order, o["id"]).status == "ready"
    assert db.get(Order, paid["id"]).status == "completed"


def test_needs_attention_lists_yesterdays_unpaid_order(client, admin, menu, db, counter_shop):
    o = unpaid_order(client, menu, admin)
    db.execute(update(Order).where(Order.id == o["id"]).values(
        business_date=business_date(counter_shop) - timedelta(days=1)))
    db.commit()
    kinds = {a["kind"]: a for a in client.get(f"{API}/admin/dashboard").json()["needs_attention"]}
    assert kinds["unpaid_at_counter"]["order"]["id"] == o["id"]


def test_staff_can_cancel_a_ready_no_show(client, staff, menu, db, counter_shop):
    """A no-show is cooked and waiting: staff on shift must be able to cancel it, not only the owner."""
    order_at_counter(client, menu)
    login(client, staff.username)
    o = next(o for o in client.get(f"{API}/staff/orders").json() if o["pay_at_counter"])
    o = move(client, o, "ready").json()
    r = client.post(f"{API}/staff/orders/{o['id']}/cancel",
                    json={"version": o["version"], "reason": "Didn't come to collect"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"
    # The number is free again.
    assert order_at_counter(client, menu).status_code == 201


def test_staff_still_cannot_cancel_a_paid_ready_order(staff_client, menu):
    o = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    o = staff_client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "ready", "version": o["version"]}).json()
    r = staff_client.post(f"{API}/staff/orders/{o['id']}/cancel",
                          json={"version": o["version"], "reason": "x", "refund_method": "cash"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
