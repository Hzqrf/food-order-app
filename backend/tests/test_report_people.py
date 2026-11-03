from datetime import timedelta

import pytest
from sqlalchemy import update

from app.models import Order, utcnow
from app.shop.service import business_date
from tests.conftest import _user, counter_order, login, new_key
from tests.test_pay_at_counter import counter_on, no_gateway  # noqa: F401  (fixture)
from tests.test_online import place

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
