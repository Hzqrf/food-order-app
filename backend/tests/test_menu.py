import io

from PIL import Image
from sqlalchemy import select

from app.jobs import close_day
from app.models import AuditLog, MenuItem, Option, Order
from tests.conftest import counter_order

API = "/api/v1"


def _item(menu_json, name):
    return next(i for c in menu_json["categories"] for i in c["items"] if i["name"] == name)


def test_public_menu_shape(client, menu):
    body = client.get(f"{API}/menu").json()
    assert [c["name"] for c in body["categories"]] == ["Chicken", "Drinks"]
    tender = _item(body, "Chicken Tender")
    assert [g["name"] for g in tender["groups"]] == ["Size", "Add-ons"]
    assert tender["groups"][0]["min_select"] == 1


def test_inactive_items_and_empty_categories_hidden(admin_client, menu):
    admin_client.delete(f"{API}/admin/menu/items/{menu['milo']}")
    body = admin_client.get(f"{API}/menu").json()
    assert [c["name"] for c in body["categories"]] == ["Chicken"]


def test_required_group_exhausted_shows_item_sold_out(staff_client, menu):
    for name in ("Regular", "Large"):
        r = staff_client.patch(f"{API}/staff/menu/options/{menu[name]}/sold-out", json={"is_sold_out": True})
        assert r.status_code == 204
    assert _item(staff_client.get(f"{API}/menu").json(), "Chicken Tender")["is_sold_out"] is True


def test_staff_cannot_edit_menu(staff_client, menu):
    r = staff_client.patch(f"{API}/admin/menu/items/{menu['milo']}", json={"price_sen": 1})
    assert r.status_code == 403


def test_price_change_audited(admin_client, menu, db):
    r = admin_client.patch(f"{API}/admin/menu/items/{menu['milo']}", json={"price_sen": 500})
    assert r.json()["price_sen"] == 500
    log = db.scalar(select(AuditLog).where(AuditLog.action == "menu_item_changed"))
    assert (log.before, log.after) == ({"price_sen": 450}, {"price_sen": 500})


def test_create_item_attach_groups_and_sort(admin_client, menu):
    menu_json = admin_client.get(f"{API}/admin/menu").json()
    cat_id = menu_json["categories"][0]["id"]
    r = admin_client.post(f"{API}/admin/menu/items",
                          json={"category_id": cat_id, "name": "Wings", "name_ms": "Kepak", "price_sen": 900})
    assert r.status_code == 201
    wings = r.json()["id"]
    r = admin_client.put(f"{API}/admin/menu/items/{wings}/option-groups",
                         json={"option_group_ids": [menu["addons"], menu["size"]]})
    assert r.json()["option_group_ids"] == [menu["addons"], menu["size"]]
    admin_client.put(f"{API}/admin/menu/sort", json={"entity": "items", "ids": [wings, menu["tender"]]})
    chicken = admin_client.get(f"{API}/menu").json()["categories"][0]
    assert [i["name"] for i in chicken["items"]] == ["Wings", "Chicken Tender"]


def test_option_group_min_max_validated(admin_client):
    r = admin_client.post(f"{API}/admin/menu/option-groups", json={"name": "Bad", "min_select": 3, "max_select": 1})
    assert r.status_code == 422


def test_image_upload_reencodes_to_webp(admin_client, menu):
    buf = io.BytesIO()
    Image.new("RGB", (1600, 1000), "orange").save(buf, "PNG")
    r = admin_client.post(f"{API}/admin/menu/items/{menu['milo']}/image",
                          files={"file": ("photo.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    url = r.json()["image_url"]
    assert url.endswith("-sm.webp")
    img = admin_client.get(url)
    assert img.status_code == 200
    assert Image.open(io.BytesIO(img.content)).size == (400, 250)


def test_image_upload_rejects_non_images(admin_client, menu):
    r = admin_client.post(f"{API}/admin/menu/items/{menu['milo']}/image",
                          files={"file": ("x.png", b"<script>alert(1)</script>", "image/png")})
    assert r.json()["error"]["code"] == "invalid_image"


def test_close_day_resets_sold_out_and_auto_closes_ready(staff_client, menu, db):
    order = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()
    staff_client.post(f"{API}/staff/orders/{order['id']}/transition", json={"to": "ready", "version": 1})
    staff_client.patch(f"{API}/staff/menu/items/{menu['milo']}/sold-out", json={"is_sold_out": True})
    staff_client.patch(f"{API}/staff/menu/options/{menu['Cheese']}/sold-out", json={"is_sold_out": True})

    result = close_day(db)
    db.commit()
    assert result == {"items_reset": 1, "options_reset": 1, "orders_auto_closed": 1}
    db.expire_all()
    assert db.get(MenuItem, menu["milo"]).is_sold_out is False
    assert db.get(Option, menu["Cheese"]).is_sold_out is False
    closed = db.get(Order, order["id"])
    assert (closed.status, closed.auto_closed) == ("completed", True)
    assert close_day(db)["orders_auto_closed"] == 0  # safe to run twice
