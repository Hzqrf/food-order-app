import threading
from datetime import date

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AuditLog, MenuItem, Order, Payment
from app.orders.service import next_order_number
from tests.conftest import counter_order, login, new_key

API = "/api/v1"


def tender(menu, *names, qty=1):
    return {"menu_item_id": menu["tender"], "quantity": qty, "option_ids": [menu[n] for n in names]}


def test_counter_order_with_cash_and_change(staff_client, menu):
    r = counter_order(staff_client, [tender(menu, "Large", "Cheese", "Spicy Sauce")], tendered=2000,
                      customer_name=" Farah ", expected_total_sen=1700)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["order_number"] == "001"
    assert (body["status"], body["payment_status"], body["channel"]) == ("placed", "paid", "counter")
    assert body["total_sen"] == 1700 and body["change_sen"] == 300
    assert body["customer_name"] == "Farah"
    assert body["created_by_name"] == "Aina"
    line = body["items"][0]
    assert [o["option_name"] for o in line["options"]] == ["Large", "Cheese", "Spicy Sauce"]

    r2 = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}], method="qr_counter")
    assert r2.json()["order_number"] == "002"
    assert r2.json()["change_sen"] is None


def test_server_ignores_client_price_and_rejects_changed_total(staff_client, menu):
    r = counter_order(staff_client, [tender(menu, "Regular")], expected_total_sen=500)
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "cart_changed"
    assert err["details"] == [{"reason": "total_changed", "new_total_sen": 1000}]


def test_idempotency_key_returns_first_order(staff_client, menu, db):
    key = new_key()
    first = counter_order(staff_client, [tender(menu, "Regular")], key=key, tendered=5000)
    again = counter_order(staff_client, [tender(menu, "Regular")], key=key, tendered=5000)
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["id"] == again.json()["id"]
    assert again.json()["change_sen"] == 4000
    assert db.scalar(select(Order.id).where(Order.id != first.json()["id"])) is None


def test_idempotency_key_required(staff_client, menu):
    r = staff_client.post(f"{API}/staff/orders", json={
        "items": [tender(menu, "Regular")], "payment": {"method": "cash"}})
    assert r.json()["error"]["code"] == "idempotency_key_required"


def test_sold_out_item_rejected_with_details(staff_client, menu, db):
    db.get(MenuItem, menu["milo"]).is_sold_out = True
    db.commit()
    r = counter_order(staff_client, [tender(menu, "Regular"), {"menu_item_id": menu["milo"], "quantity": 1}])
    assert r.status_code == 409
    assert r.json()["error"]["details"] == [{"line": 1, "reason": "sold_out", "menu_item_id": menu["milo"]}]


def test_insufficient_cash(staff_client, menu):
    r = counter_order(staff_client, [tender(menu, "Regular")], tendered=500)
    assert r.json()["error"]["code"] == "insufficient_cash"


def test_validation_limits(staff_client, menu):
    r = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 21}])
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["field"] == "items.0.quantity"


def test_price_change_does_not_touch_old_orders(staff_client, menu, db):
    r = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 2}])
    db.get(MenuItem, menu["milo"]).price_sen = 600
    db.commit()
    detail = staff_client.get(f"{API}/staff/orders/{r.json()['id']}").json()
    assert detail["items"][0]["unit_price_sen"] == 450
    assert detail["total_sen"] == 900


def test_board_flow_and_version_conflict(staff_client, menu):
    order = counter_order(staff_client, [tender(menu, "Regular")]).json()
    board = staff_client.get(f"{API}/staff/orders").json()
    assert [o["id"] for o in board] == [order["id"]]

    url = f"{API}/staff/orders/{order['id']}/transition"
    moved = staff_client.post(url, json={"to": "preparing", "version": 1})
    assert moved.status_code == 200 and moved.json()["version"] == 2
    stale = staff_client.post(url, json={"to": "ready", "version": 1})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"
    staff_client.post(url, json={"to": "ready", "version": 2})
    done = staff_client.post(url, json={"to": "completed", "version": 3})
    assert done.json()["status"] == "completed"
    assert staff_client.get(f"{API}/staff/orders").json() == []

    detail = staff_client.get(f"{API}/staff/orders/{order['id']}").json()
    assert [e["to_status"] for e in detail["events"]] == ["placed", "preparing", "ready", "completed"]
    assert detail["events"][1]["actor_name"] == "Aina"


def test_staff_cannot_move_backwards(staff_client, menu):
    order = counter_order(staff_client, [tender(menu, "Regular")]).json()
    url = f"{API}/staff/orders/{order['id']}/transition"
    staff_client.post(url, json={"to": "ready", "version": 1})
    r = staff_client.post(url, json={"to": "preparing", "version": 2})
    assert r.json()["error"]["code"] == "invalid_transition"


def test_cancel_paid_order_requires_refund_and_records_it(staff_client, menu, db):
    order = counter_order(staff_client, [tender(menu, "Regular")]).json()
    url = f"{API}/staff/orders/{order['id']}/cancel"
    r = staff_client.post(url, json={"version": 1, "reason": "Customer changed mind"})
    assert r.json()["error"]["code"] == "refund_required"

    r = staff_client.post(url, json={"version": 1, "reason": "Customer changed mind", "refund_method": "cash"})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["payment_status"]) == ("cancelled", "refunded")
    refund = db.scalar(select(Payment).where(Payment.kind == "refund"))
    assert (refund.amount_sen, refund.method, refund.status) == (1000, "cash", "succeeded")
    actions = set(db.scalars(select(AuditLog.action)))
    assert {"order_cancelled_after_payment", "refund_recorded"} <= actions


def test_staff_cannot_cancel_preparing_but_admin_can(client, staff, admin, menu):
    login(client, staff.username)
    order = counter_order(client, [tender(menu, "Regular")]).json()
    client.post(f"{API}/staff/orders/{order['id']}/transition", json={"to": "preparing", "version": 1})
    body = {"version": 2, "reason": "Fryer broke", "refund_method": "original"}
    r = client.post(f"{API}/staff/orders/{order['id']}/cancel", json=body)
    assert r.json()["error"]["code"] == "invalid_transition"

    login(client, admin.username)
    r = client.post(f"{API}/admin/orders/{order['id']}/cancel", json=body)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"


def test_admin_refund_on_completed_order_keeps_status(client, staff, admin, menu):
    login(client, staff.username)
    order = counter_order(client, [tender(menu, "Regular")], method="card_terminal").json()
    client.post(f"{API}/staff/orders/{order['id']}/transition", json={"to": "completed", "version": 1})
    login(client, admin.username)
    body = {"reason": "Cold food", "refund_method": "original"}
    r = client.post(f"{API}/admin/orders/{order['id']}/refund", json=body)
    assert (r.json()["status"], r.json()["payment_status"]) == ("completed", "refunded")
    again = client.post(f"{API}/admin/orders/{order['id']}/refund", json=body)
    assert again.json()["error"]["code"] == "not_refundable"


def test_search_by_number_and_name(staff_client, menu):
    counter_order(staff_client, [tender(menu, "Regular")], customer_name="Farah")
    counter_order(staff_client, [tender(menu, "Regular")], customer_name="Siti")
    by_number = staff_client.get(f"{API}/staff/orders/search", params={"q": "2"}).json()
    assert [o["customer_name"] for o in by_number] == ["Siti"]
    by_name = staff_client.get(f"{API}/staff/orders/search", params={"q": "far"}).json()
    assert [o["order_number"] for o in by_name] == ["001"]


def test_quote_is_public_and_reports_problems(client, menu):
    r = client.post(f"{API}/orders/quote", json={"items": [tender(menu, "Large", "Cheese", "Spicy Sauce"),
                                                           tender(menu)]})
    body = r.json()
    assert body["total_sen"] == 1700
    assert body["problems"][0]["reason"] == "invalid_options"


def test_order_numbers_unique_under_concurrency(branch):
    """Ten requests numbering at once on MySQL each get their own number."""
    numbers, errors = [], []

    def take():
        try:
            with SessionLocal() as s, s.begin():
                numbers.append(next_order_number(s, branch.id, date(2026, 10, 7)))
        except Exception as e:  # pragma: no cover
            errors.append(e)

    threads = [threading.Thread(target=take) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert sorted(numbers) == list(range(1, 11))


def test_same_idempotency_key_sent_twice_at_once_makes_one_order(staff_client, menu, db):
    """A double tap that reaches the server as two simultaneous requests."""
    key, results = new_key(), []

    def send():
        results.append(counter_order(staff_client, [tender(menu, "Regular")], key=key))

    threads = [threading.Thread(target=send) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(results) == 4, "a request raised instead of answering"
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201], [r.text for r in results]
    assert len({r.json()["id"] for r in results}) == 1
    assert len(db.scalars(select(Order.id)).all()) == 1
    # The repeats did not use up order numbers.
    assert counter_order(staff_client, [tender(menu, "Regular")]).json()["order_number"] == "002"
