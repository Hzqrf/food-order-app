from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.models import Order, utcnow
from app.reports.masking import mask_phone
from app.shop.service import business_date
from tests.conftest import _user, counter_order, login, new_key
from tests.test_pay_at_counter import counter_on, no_gateway  # noqa: F401  (fixture)
from tests.test_online import place, ref_of, webhook

API = "/api/v1"


def milo(menu):
    return {"menu_item_id": menu["milo"], "quantity": 1}


def tender(menu):
    return {"menu_item_id": menu["tender"], "quantity": 1, "option_ids": [menu["Regular"]]}


def claim(client, order):
    r = client.post(f"{API}/staff/orders/{order['id']}/claim", json={"version": order["version"]})
    assert r.status_code == 200, r.text
    return r.json()


def report(client, branch):
    today = business_date(branch).isoformat()
    return client.get(f"{API}/admin/reports", params={"date_from": today, "date_to": today})


@pytest.fixture
def bee(db, branch):
    return _user(db, "staff", "bee")


# --- By staff -----------------------------------------------------------------------------------


def test_staff_rows_sum_to_sales(client, staff, bee, admin, menu, db, branch, no_gateway):
    counter_on(db, branch)
    # Paid at the counter after cooking: cooked by staff, paid when collected.
    track = place(client, menu, pay_at_counter=True).json()
    login(client, staff.username)
    pac = next(o for o in client.get(f"{API}/staff/orders").json() if o["order_code"] == track["order_code"])
    pac = claim(client, pac)
    pac = client.post(f"{API}/staff/orders/{pac['id']}/transition", json={"to": "ready", "version": pac["version"]}).json()
    assert client.post(f"{API}/staff/orders/{pac['id']}/payment", json={"method": "qr_counter"},
                       headers={"Idempotency-Key": new_key()}).status_code == 200
    claim(client, counter_order(client, [tender(menu)]).json())   # RM10.00
    claim(client, counter_order(client, [milo(menu)]).json())     # RM4.50
    login(client, bee.username)
    claim(client, counter_order(client, [milo(menu)]).json())     # RM4.50
    counter_order(client, [milo(menu)])                           # nobody claims it

    login(client, admin.username)
    body = report(client, branch).json()
    rows = body["staff"]
    assert [r["name"] for r in rows] == [staff.full_name, bee.full_name, None]
    assert rows[0]["orders"] == 3 and rows[0]["sales_sen"] == 1000 + 450 + 1000
    assert rows[-1]["user_id"] is None and rows[-1]["orders"] == 1
    assert sum(r["sales_sen"] for r in rows) == body["totals"]["sales_sen"]


def test_staff_excludes_cancelled_and_unpaid(client, staff, admin, menu, db, branch, no_gateway):
    counter_on(db, branch)
    login(client, staff.username)
    o = claim(client, counter_order(client, [milo(menu)]).json())
    assert client.post(f"{API}/staff/orders/{o['id']}/cancel",
                       json={"version": o["version"], "reason": "x", "refund_method": "cash"}).status_code == 200
    track = place(client, menu, phone="019-111 2222", pay_at_counter=True).json()
    login(client, staff.username)
    unpaid = next(x for x in client.get(f"{API}/staff/orders").json() if x["order_code"] == track["order_code"])
    claim(client, unpaid)
    login(client, admin.username)
    assert report(client, branch).json()["staff"] == []


def test_avg_cook_minutes(client, staff, admin, menu, db, branch):
    login(client, staff.username)
    now = utcnow()
    for minutes in (10, 20):
        o = claim(client, counter_order(client, [milo(menu)]).json())
        db.execute(update(Order).where(Order.id == o["id"]).values(
            preparing_at=now - timedelta(minutes=minutes), ready_at=now))
    db.commit()
    login(client, admin.username)
    [row] = report(client, branch).json()["staff"]
    assert row["avg_cook_minutes"] == 15.0


def test_share_pct(client, staff, bee, admin, menu, db, branch):
    login(client, staff.username)
    claim(client, counter_order(client, [tender(menu)]).json())   # RM10.00
    login(client, bee.username)
    claim(client, counter_order(client, [tender(menu)]).json())   # RM10.00
    login(client, admin.username)
    rows = report(client, branch).json()["staff"]
    assert [r["share_pct"] for r in rows] == [50.0, 50.0]


def test_staff_report_is_owner_only(client, staff, branch):
    login(client, staff.username)
    assert report(client, branch).status_code == 403


# --- By customer --------------------------------------------------------------------------------


def paid_online(client, menu, phone, name="Farah Aziz"):
    body = place(client, menu, phone=phone, customer_name=name).json()
    assert webhook(client, ref_of(body["payment_url"])).status_code == 200
    return body


def order_id(db, code):
    return db.scalar(select(Order.id).where(Order.order_code == code))


def customers(client, branch, sort=None):
    today = business_date(branch).isoformat()
    params = {"date_from": today, "date_to": today, **({"sort": sort} if sort else {})}
    return client.get(f"{API}/admin/reports/customers", params=params)


def test_mask_phone():
    assert mask_phone("+60123456789") == "012-***6789"
    assert mask_phone("+6031234567") == "031-***4567"
    assert mask_phone("+60123") == "***"


def test_customers_grouped_by_phone(client, admin, menu, branch):
    paid_online(client, menu, "012-345 6789")
    paid_online(client, menu, "012-345 6789")
    paid_online(client, menu, "013-222 3333")
    login(client, admin.username)
    body = customers(client, branch).json()
    assert body["customers"] == 2
    top = body["rows"][0]
    assert (top["phone_masked"], top["orders"], top["spent_sen"]) == ("012-***6789", 2, 2000)


def test_new_and_returning(client, admin, menu, db, branch):
    old = paid_online(client, menu, "012-345 6789")
    db.execute(update(Order).where(Order.id == order_id(db, old["order_code"])).values(
        business_date=business_date(branch) - timedelta(days=10)))
    db.commit()
    paid_online(client, menu, "012-345 6789")
    paid_online(client, menu, "013-222 3333")
    login(client, admin.username)
    body = customers(client, branch).json()
    assert (body["customers"], body["returning"], body["repeat_rate_pct"]) == (2, 1, 50.0)
    new = {r["phone_masked"]: r["is_new"] for r in body["rows"]}
    assert new == {"012-***6789": False, "013-***3333": True}


def test_unpaid_history_does_not_make_returning(client, admin, menu, db, branch):
    earlier = place(client, menu, phone="012-345 6789").json()  # never paid
    db.execute(update(Order).where(Order.id == order_id(db, earlier["order_code"])).values(
        business_date=business_date(branch) - timedelta(days=3), status="cancelled"))
    db.commit()
    paid_online(client, menu, "012-345 6789")
    login(client, admin.username)
    body = customers(client, branch).json()
    assert body["returning"] == 0 and body["rows"][0]["is_new"] is True


def test_customer_name_from_latest_order(client, admin, menu, branch):
    paid_online(client, menu, "012-345 6789", name="Farah Aziz")
    paid_online(client, menu, "012-345 6789", name="Fara")
    login(client, admin.username)
    assert customers(client, branch).json()["rows"][0]["first_name"] == "Fara"


def test_counter_orders_ignored_and_coverage(client, admin, menu, branch):
    paid_online(client, menu, "012-345 6789")
    body = place(client, menu, phone=None).json()
    webhook(client, ref_of(body["payment_url"]))
    login(client, admin.username)
    counter_order(client, [milo(menu)], customer_name="Walk In")
    report_body = customers(client, branch).json()
    assert report_body["customers"] == 1 and report_body["phone_coverage_pct"] == 50.0


def test_no_phones_in_range(client, admin, menu, branch):
    login(client, admin.username)
    counter_order(client, [milo(menu)])
    body = customers(client, branch).json()
    assert body["customers"] == 0 and body["rows"] == []
    assert body["repeat_rate_pct"] is None and body["spend_per_customer_sen"] is None
    assert body["phone_coverage_pct"] is None
    online = place(client, menu, phone=None).json()
    webhook(client, ref_of(online["payment_url"]))
    login(client, admin.username)
    assert customers(client, branch).json()["phone_coverage_pct"] == 0.0


def test_sort_and_limit(client, admin, menu, db, branch):
    template = db.get(Order, order_id(db, paid_online(client, menu, "012-345 6789")["order_code"]))
    cols = {c.name: getattr(template, c.key) for c in Order.__table__.columns if c.name != "id"}
    for k in range(52):
        db.add(Order(**{**cols, "order_number": 100 + k, "order_code": f"QA{k:04d}", "public_token": f"qa-{k}",
                        "idempotency_key": f"qa-key-{k}", "customer_phone": f"+60177{k:06d}"}))
    db.commit()
    login(client, admin.username)
    assert len(customers(client, branch).json()["rows"]) == 50

    db.execute(update(Order).where(Order.order_code.like("QA%")).values(status="cancelled"))
    db.commit()
    paid_online(client, menu, "013-111 1111")  # second phone: 1 order, latest
    paid_online(client, menu, "012-345 6789")  # first phone now has 2 orders
    login(client, admin.username)
    by_orders = [r["phone_masked"] for r in customers(client, branch, "orders").json()["rows"]]
    by_last = [r["phone_masked"] for r in customers(client, branch, "last").json()["rows"]]
    assert by_orders[0] == "012-***6789" and by_last[0] == "012-***6789"
    assert by_orders == ["012-***6789", "013-***1111"]


def test_full_phone_never_in_response(client, admin, menu, branch):
    paid_online(client, menu, "012-345 6789")
    login(client, admin.username)
    r = customers(client, branch)
    assert "+60123456789" not in r.text and "0123456789" not in r.text
    assert all(set(row) == {"phone_masked", "first_name", "orders", "spent_sen", "last_order_at", "is_new"}
               for row in r.json()["rows"])


def test_customer_report_owner_only(client, staff, branch):
    login(client, staff.username)
    assert customers(client, branch).status_code == 403
