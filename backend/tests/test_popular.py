from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.menu.service import invalidate_menu_cache
from app.models import AuditLog, MenuItem, Order
from app.shop.service import business_date
from tests.conftest import counter_order

API = "/api/v1"


@pytest.fixture(autouse=True)
def fresh_menu():
    invalidate_menu_cache()
    yield
    invalidate_menu_cache()


def line(menu, item_id, qty):
    options = [menu["Regular"]] if item_id == menu["tender"] else []
    return {"menu_item_id": item_id, "quantity": qty, "option_ids": options}


def sell(staff_client, menu, item_id, qty) -> int:
    r = counter_order(staff_client, [line(menu, item_id, qty)])
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def popular(client) -> set[int]:
    invalidate_menu_cache()
    cats = client.get(f"{API}/menu").json()["categories"]
    return {i["id"] for c in cats for i in c["items"] if i["is_popular"]}


def add_items(db, menu, n) -> list[int]:
    milo = db.get(MenuItem, menu["milo"])
    items = [MenuItem(category_id=milo.category_id, name=f"Drink {k}", price_sen=300, sort_order=20 + k)
             for k in range(n)]
    db.add_all(items)
    db.commit()
    return [i.id for i in items]


def test_no_sales_means_nothing_popular(client, menu):
    assert popular(client) == set()


def test_needs_five_units(client, staff_client, menu):
    sell(staff_client, menu, menu["milo"], 4)
    assert popular(client) == set()
    sell(staff_client, menu, menu["milo"], 1)
    assert popular(client) == {menu["milo"]}


def test_top_three_by_units_ties_by_id(client, staff_client, menu, db):
    a, b, c = add_items(db, menu, 3)
    sell(staff_client, menu, menu["milo"], 9)
    sell(staff_client, menu, a, 7)
    sell(staff_client, menu, b, 6)
    sell(staff_client, menu, c, 6)  # ties with b for third place: the lower id wins
    assert popular(client) == {menu["milo"], a, b}


def test_popular_ignores_old_unpaid_and_cancelled(client, staff_client, menu, db, branch):
    old, unpaid, cancelled = (sell(staff_client, menu, menu["milo"], 5) for _ in range(3))
    db.execute(update(Order).where(Order.id == old).values(business_date=business_date(branch) - timedelta(days=14)))
    db.execute(update(Order).where(Order.id == unpaid).values(payment_status="unpaid"))
    db.execute(update(Order).where(Order.id == cancelled).values(status="cancelled"))
    db.commit()
    assert popular(client) == set()


def test_window_includes_thirteen_days_ago(client, staff_client, menu, db, branch):
    o = sell(staff_client, menu, menu["milo"], 5)
    db.execute(update(Order).where(Order.id == o).values(business_date=business_date(branch) - timedelta(days=13)))
    db.commit()
    assert popular(client) == {menu["milo"]}


def test_owner_picks_override(client, admin_client, menu):
    sell(admin_client, menu, menu["milo"], 9)
    r = admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"is_popular": True})
    assert r.status_code == 200 and r.json()["is_popular"] is True
    assert popular(client) == {menu["tender"]}


def test_inactive_owner_pick_is_ignored(client, admin_client, menu):
    sell(admin_client, menu, menu["milo"], 5)
    admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"is_popular": True, "is_active": False})
    assert popular(client) == {menu["milo"]}


def test_popular_change_is_audited(admin_client, menu, db):
    admin_client.patch(f"{API}/admin/menu/items/{menu['milo']}", json={"is_popular": True})
    log = db.scalars(select(AuditLog).where(AuditLog.action == "menu_item_changed")).one()
    assert (log.before, log.after) == ({"is_popular": False}, {"is_popular": True})


def test_create_item_with_popular(admin_client, menu, db):
    cat = db.get(MenuItem, menu["milo"]).category_id
    r = admin_client.post(f"{API}/admin/menu/items",
                          json={"category_id": cat, "name": "Teh", "price_sen": 300, "is_popular": True})
    assert r.status_code in (200, 201) and r.json()["is_popular"] is True
