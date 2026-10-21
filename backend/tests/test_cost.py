from sqlalchemy import select, update

from app.models import MenuItem, Option, OrderItem
from tests.conftest import counter_order

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
