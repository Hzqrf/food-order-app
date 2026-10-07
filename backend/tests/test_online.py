from datetime import timedelta

from sqlalchemy import select, update

from app.jobs import payments_tick
from app.models import AuditLog, Branch, Order, OrderStatusEvent, Payment, utcnow
from app.payments.gateway import get_gateway
from tests.conftest import counter_order, login, new_key

API = "/api/v1"


def place(client, menu, key=None, phone="012-345 6789", expected=1000, **over):
    body = {"customer_name": "Farah Aziz", "customer_phone": phone, "note": "Less spicy",
            "items": [{"menu_item_id": menu["tender"], "quantity": 1, "option_ids": [menu["Regular"]]}],
            "expected_total_sen": expected, **over}
    return client.post(f"{API}/orders", json=body, headers={"Idempotency-Key": key or new_key()})


def ref_of(url: str) -> str:
    return url.rsplit("/", 1)[1]


def webhook(client, ref, status="paid"):
    body, headers = get_gateway().settle(ref, status)
    return client.post(f"{API}/webhooks/payments/fake", content=body, headers=headers)


def backdate(db, minutes, order_token=None):
    past = utcnow() - timedelta(minutes=minutes)
    db.execute(update(Order).values(created_at=past))
    db.execute(update(Payment).values(created_at=past))
    db.commit()


def test_order_waits_for_payment_then_reaches_the_board(client, staff, menu, db):
    r = place(client, menu)
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["status"], body["order_number"], body["total_sen"]) == ("pending_payment", "001", 1000)
    assert body["payment_url"].startswith("http://localhost:5173/api/v1/fake-gateway/")

    login(client, staff.username)
    assert client.get(f"{API}/staff/orders").json() == []  # the kitchen never sees unpaid orders
    track = client.get(f"{API}/t/{body['token']}").json()
    assert track["can_pay"] and track["can_cancel"] and track["expires_at"]

    assert webhook(client, ref_of(body["payment_url"])).status_code == 200
    board = client.get(f"{API}/staff/orders").json()
    assert [(o["order_number"], o["channel"], o["status"]) for o in board] == [("001", "online", "placed")]
    track = client.get(f"{API}/t/{body['token']}").json()
    assert (track["status"], track["payment_status"], track["can_pay"]) == ("placed", "paid", False)


def test_webhook_is_idempotent(client, menu, db):
    body = place(client, menu).json()
    ref = ref_of(body["payment_url"])
    webhook(client, ref)
    payload, headers = get_gateway().settle(ref, "paid")
    for _ in range(3):
        assert client.post(f"{API}/webhooks/payments/fake", content=payload, headers=headers).status_code == 200
    events = db.scalars(select(OrderStatusEvent.to_status).order_by(OrderStatusEvent.id)).all()
    assert events == ["pending_payment", "placed"]


def test_bad_signature_rejected(client, menu, db):
    body = place(client, menu).json()
    payload, _ = get_gateway().settle(ref_of(body["payment_url"]), "paid")
    r = client.post(f"{API}/webhooks/payments/fake", content=payload, headers={"x-fake-signature": "forged"})
    assert r.status_code == 400
    assert db.scalar(select(Order.status)) == "pending_payment"


def test_amount_mismatch_does_not_place_order(client, menu, db):
    body = place(client, menu).json()
    gw = get_gateway()
    ref = ref_of(body["payment_url"])
    gw._bills[ref]["amount_sen"] = 1  # the gateway claims a different amount
    webhook(client, ref)
    assert db.scalar(select(Order.status)) == "pending_payment"
    assert db.scalar(select(AuditLog.action)) == "payment_amount_mismatch"


def test_failed_payment_leaves_order_payable(client, menu, db):
    body = place(client, menu).json()
    webhook(client, ref_of(body["payment_url"]), "failed")
    track = client.get(f"{API}/t/{body['token']}").json()
    assert track["status"] == "pending_payment" and track["can_pay"]
    again = client.post(f"{API}/t/{body['token']}/pay").json()["payment_url"]
    assert again != body["payment_url"]  # a fresh bill, since the old one failed


def test_lost_webhook_found_by_reconcile(client, menu, db):
    body = place(client, menu).json()
    get_gateway().settle(ref_of(body["payment_url"]), "paid")  # paid, webhook never sent
    payments_tick(db)
    db.commit()
    assert db.scalar(select(Order.status)) == "pending_payment"  # too early to ask
    backdate(db, 3)
    assert payments_tick(db) == {"reconciled": 1, "expired": 0}
    db.commit()
    assert db.scalar(select(Order.status)) == "placed"


def test_unpaid_order_expires_and_late_payment_is_flagged(client, menu, db):
    body = place(client, menu).json()
    backdate(db, 16)
    assert payments_tick(db)["expired"] == 1
    db.commit()
    order = db.scalar(select(Order))
    assert (order.status, order.cancel_reason) == ("cancelled", "payment_expired")
    assert db.scalar(select(Payment.status)) == "expired"
    assert client.post(f"{API}/t/{body['token']}/pay").json()["error"]["code"] == "not_payable"

    # The customer paid on the gateway page anyway.
    get_gateway()._bills[ref_of(body["payment_url"])]["status"] = "pending"
    webhook(client, ref_of(body["payment_url"]))
    db.expire_all()
    order = db.scalar(select(Order))
    assert (order.status, order.payment_status) == ("cancelled", "paid")  # paid but cancelled
    assert "paid_after_cancel" in db.scalars(select(AuditLog.action)).all()


def test_expiry_checks_the_gateway_first(client, menu, db):
    body = place(client, menu).json()
    get_gateway().settle(ref_of(body["payment_url"]), "paid")
    backdate(db, 16)
    payments_tick(db)
    db.commit()
    assert db.scalar(select(Order.status)) == "placed"


def test_shop_closed_or_paused(client, menu, db, branch):
    db.execute(update(Branch).values(is_accepting_online_orders=False))
    db.commit()
    assert place(client, menu).json()["error"]["code"] == "shop_closed"
    db.execute(update(Branch).values(is_accepting_online_orders=True, opening_hours={}))
    db.commit()
    assert place(client, menu).json()["error"]["code"] == "shop_closed"


def test_same_key_returns_same_order_and_bill(client, menu):
    key = new_key()
    first, again = place(client, menu, key=key), place(client, menu, key=key)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["token"] == again.json()["token"]
    assert first.json()["payment_url"] == again.json()["payment_url"]


def test_phone_validation_and_unpaid_limit(client, menu):
    assert place(client, menu, phone="0000 0000").json()["error"]["code"] == "invalid_phone"
    for _ in range(3):
        assert place(client, menu, phone="0123456789").status_code == 201
    assert place(client, menu, phone="+60 12-345 6789").json()["error"]["code"] == "too_many_unpaid"


def test_changed_total_needs_review(client, menu):
    r = place(client, menu, expected=900)
    assert r.status_code == 409 and r.json()["error"]["code"] == "cart_changed"


def test_tracking_shows_no_phone_and_hides_detail_after_48h(client, menu, db):
    body = place(client, menu).json()
    track = client.get(f"{API}/t/{body['token']}").json()
    assert track["customer_name"] == "Farah"
    assert "0123456789" not in str(track) and "+60" not in str(track)
    assert track["items"][0]["option_ids"] == [menu["Regular"]]

    db.execute(update(Order).values(status="completed", completed_at=utcnow() - timedelta(hours=49)))
    db.commit()
    track = client.get(f"{API}/t/{body['token']}").json()
    assert track["detail_hidden"] is True and track["items"] == [] and track["customer_name"] is None
    assert client.get(f"{API}/t/not-a-real-token").status_code == 404


def test_customer_cancels_unpaid_order(client, menu, db):
    body = place(client, menu).json()
    assert client.post(f"{API}/t/{body['token']}/pay").json()["payment_url"] == body["payment_url"]
    r = client.post(f"{API}/t/{body['token']}/cancel").json()
    assert (r["status"], r["cancel_reason"]) == ("cancelled", "customer_cancelled")
    assert db.scalar(select(Payment.status)) == "expired"


def test_refunds_for_online_orders(client, staff, admin, menu, db):
    body = place(client, menu).json()
    webhook(client, ref_of(body["payment_url"]))
    order_id = db.scalar(select(Order.id))
    login(client, staff.username)
    url = f"{API}/staff/orders/{order_id}/cancel"
    r = client.post(url, json={"version": 2, "reason": "Fryer broke", "refund_method": "cash"})
    assert r.status_code == 403  # staff cannot hand back money that came through the gateway
    r = client.post(url, json={"version": 2, "reason": "Fryer broke", "refund_method": "later"})
    assert (r.json()["status"], r.json()["payment_status"]) == ("cancelled", "paid")

    login(client, admin.username)
    r = client.post(f"{API}/admin/orders/{order_id}/refund", json={"reason": "Fryer broke", "refund_method": "original"})
    assert r.json()["payment_status"] == "refunded"
    refund = db.scalar(select(Payment).where(Payment.kind == "refund"))
    assert (refund.method, refund.amount_sen) == ("gateway", 1000)


def test_later_refund_only_for_online_payments(staff_client, menu):
    order = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    r = staff_client.post(f"{API}/staff/orders/{order['id']}/cancel",
                          json={"version": 1, "reason": "x", "refund_method": "later"})
    assert r.json()["error"]["code"] == "refund_required"


def test_fake_gateway_hosted_page(client, menu, db):
    body = place(client, menu).json()
    page = client.get(body["payment_url"].replace("http://localhost:5173", ""))
    assert page.status_code == 200 and "RM10.00" in page.text
    r = client.post(page.url.path, data={"action": "pay"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith(f"/t/{body['token']}")
    assert db.scalar(select(Order.status)) == "placed"


def test_checkout_needs_no_name_or_phone(client, menu, db):
    body = {"items": [{"menu_item_id": menu["tender"], "quantity": 1, "option_ids": [menu["Regular"]]}],
            "expected_total_sen": 1000}
    r = client.post(f"{API}/orders", json=body, headers={"Idempotency-Key": new_key()})
    assert r.status_code == 201, r.text
    order = db.scalar(select(Order))
    assert (order.customer_name, order.customer_phone) == (None, None)
    track = client.get(f"{API}/t/{r.json()['token']}").json()
    assert track["customer_name"] is None and track["order_code"] == r.json()["order_code"]
    # An empty phone field counts as no phone, not as an invalid one.
    r = client.post(f"{API}/orders", json={**body, "customer_phone": "  "}, headers={"Idempotency-Key": new_key()})
    assert r.status_code == 201


def test_every_order_has_a_permanent_code_staff_can_search(client, staff, menu, db):
    online = place(client, menu).json()
    login(client, staff.username)
    counter = counter_order(client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    codes = [online["order_code"], counter["order_code"]]
    assert len(set(codes)) == 2
    assert all(len(c) == 6 and not set(c) & set("01ILO") for c in codes)
    found = client.get(f"{API}/staff/orders/search", params={"q": counter["order_code"].lower()}).json()
    assert [o["id"] for o in found] == [counter["id"]]
