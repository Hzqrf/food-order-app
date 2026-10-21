from sqlalchemy import select, update

from app.models import AuditLog, MenuItem, Option, OrderItem
from tests.conftest import counter_order, login

API = "/api/v1"


def set_costs(db, menu, tender=350, large=120):
    db.execute(update(MenuItem).where(MenuItem.id == menu["tender"]).values(cost_sen=tender))
    db.execute(update(Option).where(Option.id == menu["Large"]).values(cost_delta_sen=large))
    db.commit()


def tender(menu, *names, qty=1):
    return {"menu_item_id": menu["tender"], "quantity": qty, "option_ids": [menu[n] for n in names]}


def test_counter_order_saves_line_cost(staff_client, menu, db):
    set_costs(db, menu)
    o = counter_order(staff_client, [tender(menu, "Large")]).json()
    assert db.scalar(select(OrderItem.unit_cost_sen).where(OrderItem.order_id == o["id"])) == 470


def has_cost_key(value) -> bool:
    """True if any key anywhere in a JSON value mentions cost."""
    if isinstance(value, dict):
        return any("cost" in k or has_cost_key(v) for k, v in value.items())
    if isinstance(value, list):
        return any(has_cost_key(v) for v in value)
    return False


def test_owner_sets_costs_and_they_are_audited(admin_client, menu, db):
    r = admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"cost_sen": 350})
    assert r.status_code == 200 and r.json()["cost_sen"] == 350
    r = admin_client.patch(f"{API}/admin/menu/options/{menu['Large']}", json={"cost_delta_sen": 120})
    assert r.status_code == 200 and r.json()["cost_delta_sen"] == 120

    item_log = db.scalars(select(AuditLog).where(AuditLog.action == "menu_item_changed")).one()
    assert (item_log.before, item_log.after) == ({"cost_sen": None}, {"cost_sen": 350})
    option_log = db.scalars(select(AuditLog).where(AuditLog.action == "option_changed")).one()
    assert (option_log.before, option_log.after) == ({"cost_delta_sen": 0}, {"cost_delta_sen": 120})
    menu_out = admin_client.get(f"{API}/admin/menu").json()
    assert {i["id"]: i["cost_sen"] for i in menu_out["items"]}[menu["tender"]] == 350


def test_negative_cost_rejected(admin_client, menu):
    assert admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"cost_sen": -1}).status_code == 422
    assert admin_client.patch(f"{API}/admin/menu/options/{menu['Large']}",
                              json={"cost_delta_sen": -5}).status_code == 422


def test_clearing_cost_stops_new_snapshots_only(client, staff, admin, menu, db):
    login(client, admin.username)
    client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"cost_sen": 350})
    login(client, staff.username)
    first = counter_order(client, [tender(menu, "Regular")]).json()
    login(client, admin.username)
    assert client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"cost_sen": None}).json()["cost_sen"] is None
    login(client, staff.username)
    second = counter_order(client, [tender(menu, "Regular")]).json()

    def cost(order):
        return db.scalar(select(OrderItem.unit_cost_sen).where(OrderItem.order_id == order["id"]))
    assert (cost(first), cost(second)) == (350, None)


def test_cost_is_owner_only(client, staff, admin, menu, db):
    set_costs(db, menu)
    login(client, staff.username)
    order = counter_order(client, [tender(menu, "Large")]).json()
    responses = [
        client.get(f"{API}/menu").json(),
        client.post(f"{API}/orders/quote", json={"items": [tender(menu, "Large")]}).json(),
        client.get(f"{API}/staff/orders").json(),
        client.get(f"{API}/staff/orders/{order['id']}").json(),
        order,
    ]
    assert not any(has_cost_key(r) for r in responses)
    assert client.get(f"{API}/admin/menu").status_code == 403


# --- Profit in reports ----------------------------------------------------------------------------


def milo(menu, qty=1):
    return {"menu_item_id": menu["milo"], "quantity": qty}


def report(client, branch, day=None):
    from app.shop.service import business_date
    d = (day or business_date(branch)).isoformat()
    return client.get(f"{API}/admin/reports", params={"date_from": d, "date_to": d}).json()


def test_report_profit_margin_and_coverage(client, staff, admin, menu, branch, db):
    set_costs(db, menu)  # tender 350; Regular adds nothing; milo has no cost
    login(client, staff.username)
    counter_order(client, [tender(menu, "Regular", qty=2), milo(menu)], tendered=5000)  # 2000 costed + 450 not

    login(client, admin.username)
    r = report(client, branch)
    t = r["totals"]
    assert (t["food_cost_sen"], t["gross_profit_sen"], t["margin_pct"]) == (700, 1300, 65.0)
    assert t["cost_coverage_pct"] == round(2000 / 2450 * 100, 1)
    assert r["periods"][0]["gross_profit_sen"] == 1300
    items = {i["name"]: i for i in r["items"]}
    tender_row, milo_row = items["Chicken Tender"], items["Iced Milo"]
    assert (tender_row["cost_sen"], tender_row["gross_profit_sen"], tender_row["margin_pct"], tender_row["costed"]) \
        == (700, 1300, 65.0, True)
    assert (milo_row["gross_profit_sen"], milo_row["margin_pct"], milo_row["costed"]) == (0, None, False)


def test_refunded_and_cancelled_orders_excluded_from_profit(client, staff, admin, menu, branch, db):
    set_costs(db, menu)
    login(client, staff.username)
    refunded = counter_order(client, [tender(menu, "Regular")]).json()
    client.post(f"{API}/staff/orders/{refunded['id']}/transition", json={"to": "completed", "version": 1})
    cancelled = counter_order(client, [tender(menu, "Regular")]).json()
    client.post(f"{API}/staff/orders/{cancelled['id']}/cancel",
                json={"version": 1, "reason": "Mistake", "refund_method": "cash"})
    counter_order(client, [tender(menu, "Regular")])  # the one real sale

    login(client, admin.username)
    assert client.post(f"{API}/admin/orders/{refunded['id']}/refund",
                       json={"reason": "Cold", "refund_method": "cash"}).status_code == 200
    t = report(client, branch)["totals"]
    assert (t["food_cost_sen"], t["gross_profit_sen"]) == (350, 650)


def test_uncosted_period_has_no_margin(client, staff, admin, menu, branch):
    from datetime import timedelta
    from app.shop.service import business_date
    login(client, staff.username)
    counter_order(client, [milo(menu)])

    login(client, admin.username)
    t = report(client, branch)["totals"]
    assert (t["gross_profit_sen"], t["margin_pct"], t["cost_coverage_pct"]) == (0, None, 0.0)
    empty = report(client, branch, business_date(branch) - timedelta(days=1))["totals"]
    assert (empty["margin_pct"], empty["cost_coverage_pct"]) == (None, None)


def test_cost_change_does_not_change_past_profit(client, staff, admin, menu, branch, db):
    set_costs(db, menu)
    login(client, staff.username)
    counter_order(client, [tender(menu, "Regular")])

    login(client, admin.username)
    client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"cost_sen": 900})
    assert report(client, branch)["totals"]["gross_profit_sen"] == 1000 - 350
