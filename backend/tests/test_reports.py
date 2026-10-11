from datetime import timedelta

from sqlalchemy import select, update

from app.jobs import close_day
from app.models import Order, Payment, utcnow
from app.payments.gateway import get_gateway
from app.shop.service import business_date
from tests.conftest import counter_order, login, new_key

API = "/api/v1"


def tender(menu):
    return {"menu_item_id": menu["tender"], "quantity": 1, "option_ids": [menu["Regular"]]}


def milo(menu, qty=1):
    return {"menu_item_id": menu["milo"], "quantity": qty}


def online(client, items, total):
    r = client.post(f"{API}/orders", json={"items": items, "expected_total_sen": total},
                    headers={"Idempotency-Key": new_key()})
    assert r.status_code == 201, r.text
    return r.json()


def pay(client, order):
    body, headers = get_gateway().settle(order["payment_url"].rsplit("/", 1)[1], "paid")
    assert client.post(f"{API}/webhooks/payments/fake", content=body, headers=headers).status_code == 200


def day(branch):
    return business_date(branch).isoformat()


def test_dashboard_counts_only_paid_live_orders(client, staff, admin, menu, branch):
    paid_online = online(client, [milo(menu)], 450)
    pay(client, paid_online)
    online(client, [milo(menu)], 450)  # never paid: not a sale
    login(client, staff.username)
    counter_order(client, [tender(menu)])
    cancelled = counter_order(client, [tender(menu)]).json()
    client.post(f"{API}/staff/orders/{cancelled['id']}/cancel",
                json={"version": 1, "reason": "Mistake", "refund_method": "cash"})

    login(client, admin.username)
    d = client.get(f"{API}/admin/dashboard").json()
    assert d["today"] == {"sales_sen": 1450, "orders": 2, "avg_order_sen": 725, "online_orders": 1,
                          "counter_orders": 1}
    assert d["live"] == {"placed": 2, "preparing": 0, "ready": 0, "awaiting_payment": 1}
    assert {(i["name"], i["quantity"]) for i in d["top_items"]} == {("Chicken Tender", 1), ("Iced Milo", 1)}
    assert len(d["last_14_days"]) == 14 and d["last_14_days"][-1]["sales_sen"] == 1450
    assert d["needs_attention"] == []  # the cancelled counter order was refunded in cash


def test_needs_attention(client, staff, admin, menu, db, branch):
    # 1. An online order paid, then cancelled by staff: the owner must refund it in the gateway.
    o1 = online(client, [milo(menu)], 450)
    pay(client, o1)
    login(client, staff.username)
    o1_id = db.scalar(select(Order.id).where(Order.order_code == o1["order_code"]))
    client.post(f"{API}/staff/orders/{o1_id}/cancel", json={"version": 2, "reason": "Out of milk",
                                                            "refund_method": "later"})
    # 2. An order left on Ready for 40 minutes.
    o2 = counter_order(client, [tender(menu)]).json()
    client.post(f"{API}/staff/orders/{o2['id']}/transition", json={"to": "ready", "version": 1})
    db.execute(update(Order).where(Order.id == o2["id"]).values(ready_at=utcnow() - timedelta(minutes=40)))
    # 3. An online order paid twice.
    o3 = online(client, [milo(menu, 2)], 900)
    pay(client, o3)
    o3_id = db.scalar(select(Order.id).where(Order.order_code == o3["order_code"]))
    db.add(Payment(order_id=o3_id, kind="charge", method="gateway", provider="fake", provider_ref="fk_dup",
                   amount_sen=900, status="succeeded", paid_at=utcnow()))
    db.commit()

    login(client, admin.username)
    kinds = {a["kind"]: a for a in client.get(f"{API}/admin/dashboard").json()["needs_attention"]}
    assert set(kinds) == {"paid_but_cancelled", "ready_too_long", "duplicate_payment"}
    assert kinds["paid_but_cancelled"]["amount_sen"] == 450
    assert kinds["duplicate_payment"]["amount_sen"] == 900

    # Refunding just the duplicate clears it and leaves the order paid.
    detail = client.get(f"{API}/staff/orders/{o3_id}").json()
    dup = next(p for p in detail["payments"] if p["kind"] == "charge" and p["id"] != detail["payments"][0]["id"])
    assert dup["refundable_sen"] == 900
    r = client.post(f"{API}/admin/orders/{o3_id}/refund",
                    json={"reason": "Charged twice", "refund_method": "original", "payment_id": dup["id"]})
    assert r.json()["payment_status"] == "paid"
    # Refunding the cancelled order clears that one too.
    client.post(f"{API}/admin/orders/{o1_id}/refund", json={"reason": "Out of milk", "refund_method": "original"})
    # Day close completes the Ready order, which then shows as auto-closed instead.
    close_day(db)
    db.commit()
    kinds = [a["kind"] for a in client.get(f"{API}/admin/dashboard").json()["needs_attention"]]
    assert kinds == ["auto_closed"]


def test_report_sections(client, staff, admin, menu, branch, db):
    login(client, staff.username)
    counter_order(client, [tender(menu), milo(menu, 2)], tendered=5000)  # 1900 cash
    qr = counter_order(client, [milo(menu)], method="qr_counter").json()  # 450 QR, then refunded
    login(client, admin.username)
    client.post(f"{API}/admin/orders/{qr['id']}/refund", json={"reason": "Spilled", "refund_method": "cash"})
    expired = online(client, [milo(menu)], 450)
    db.execute(update(Order).where(Order.order_code == expired["order_code"]).values(
        status="cancelled", cancel_reason="payment_expired"))
    db.commit()

    today = day(branch)
    r = client.get(f"{API}/admin/reports", params={"date_from": today, "date_to": today}).json()
    assert r["totals"]["sales_sen"] == 1900 and r["totals"]["orders"] == 1  # the refunded QR order is out
    assert [p["sales_sen"] for p in r["periods"]] == [1900]
    assert sum(h["orders"] for h in r["hours"]) == 1 and len(r["hours"]) == 24
    items = {i["name"]: i["quantity"] for i in r["items"]}
    assert items == {"Iced Milo": 2, "Chicken Tender": 1}
    payments = {p["method"]: p for p in r["payments"]}
    assert payments["cash"]["charged_sen"] == 1900 and payments["cash"]["refunded_sen"] == 450
    assert payments["qr_counter"]["net_sen"] == 450  # the QR money came in; it went back as cash
    c = r["cancellations"]
    assert (c["by_shop"], c["unpaid"], c["refunds"], c["refunded_sen"]) == (0, 1, 1, 450)


def test_periods_group_by_week_and_month_including_empty(client, admin, branch):
    login(client, admin.username)
    weeks = client.get(f"{API}/admin/reports", params={"date_from": "2026-09-28", "date_to": "2026-10-11",
                                                       "group_by": "week"}).json()["periods"]
    assert [(p["period"], p["start"]) for p in weeks] == [("2026-W40", "2026-09-28"), ("2026-W41", "2026-10-05")]
    months = client.get(f"{API}/admin/reports", params={"date_from": "2026-08-15", "date_to": "2026-10-01",
                                                        "group_by": "month"}).json()["periods"]
    assert [p["period"] for p in months] == ["2026-08", "2026-09", "2026-10"]
    bad = client.get(f"{API}/admin/reports", params={"date_from": "2026-10-02", "date_to": "2026-10-01"})
    assert bad.status_code == 422


def test_unsold_active_items_are_listed_as_worst_sellers(client, admin, menu, branch):
    login(client, admin.username)
    today = day(branch)
    items = client.get(f"{API}/admin/reports", params={"date_from": today, "date_to": today}).json()["items"]
    assert {(i["name"], i["quantity"]) for i in items} == {("Chicken Tender", 0), ("Iced Milo", 0)}


def test_orders_list_filters_and_pages(client, staff, admin, menu, branch):
    login(client, staff.username)
    made = [counter_order(client, [milo(menu)]).json() for _ in range(3)]
    login(client, admin.username)
    page = client.get(f"{API}/admin/orders", params={"limit": 2}).json()
    assert [o["id"] for o in page["orders"]] == [made[2]["id"], made[1]["id"]]
    rest = client.get(f"{API}/admin/orders", params={"limit": 2, "cursor": page["next_cursor"]}).json()
    assert [o["id"] for o in rest["orders"]] == [made[0]["id"]] and rest["next_cursor"] is None
    by_code = client.get(f"{API}/admin/orders", params={"q": made[1]["order_code"]}).json()["orders"]
    assert [o["id"] for o in by_code] == [made[1]["id"]]
    assert client.get(f"{API}/admin/orders", params={"channel": "online"}).json()["orders"] == []
    assert len(client.get(f"{API}/admin/orders", params={"staff_id": staff.id}).json()["orders"]) == 3


def test_orders_csv(client, staff, admin, menu, branch):
    login(client, staff.username)
    order = counter_order(client, [milo(menu)]).json()
    login(client, admin.username)
    today = day(branch)
    r = client.get(f"{API}/admin/reports/orders.csv", params={"date_from": today, "date_to": today})
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("business_date,order_number,order_id")
    assert f"001,{order['order_code']}" in lines[1] and lines[1].endswith(",4.50,Aina,")


def test_audit_log(client, admin, menu):
    login(client, admin.username)
    client.patch(f"{API}/admin/menu/items/{menu['milo']}", json={"price_sen": 500})
    page = client.get(f"{API}/admin/audit-logs").json()
    assert "menu_item_changed" in page["actions"]
    changed = client.get(f"{API}/admin/audit-logs", params={"action": "menu_item_changed"}).json()["rows"]
    assert len(changed) == 1
    assert (changed[0]["actor_name"], changed[0]["before"], changed[0]["after"]) == \
        ("Owner", {"price_sen": 450}, {"price_sen": 500})


def test_owner_screens_are_owner_only(staff_client):
    for path in ("/admin/dashboard", "/admin/orders", "/admin/audit-logs",
                 "/admin/reports?date_from=2026-10-01&date_to=2026-10-01"):
        assert staff_client.get(API + path).status_code == 403
