from datetime import datetime, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, update

from app.models import AuditLog, Order
from app.orders import timing
from app.orders.slots import pickup_slots
from app.shop.service import business_date
from tests.conftest import counter_order

API = "/api/v1"
KL = ZoneInfo("Asia/Kuala_Lumpur")


def at(branch, hh, mm, day_offset=0):
    """A shop-local time on the current business day (or the calendar day after, for overnight windows)."""
    day = business_date(branch) + timedelta(days=day_offset)
    return datetime.combine(day, time(hh, mm), KL)


def preorders_on(db, branch, limit=5, hours=None):
    branch.preorders_enabled = True
    branch.preorder_slot_limit = limit
    if hours is not None:
        branch.opening_hours = {d: [hours] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    db.commit()


def times(slots):
    return [s.time for s in slots]


def set_order(db, order_id, **values):
    db.execute(update(Order).where(Order.id == order_id).values(**values))
    db.commit()


# --- Timing helpers -----------------------------------------------------------------------------


def test_timing_helpers():
    placed = datetime(2026, 10, 29, 4, 0, tzinfo=ZoneInfo("UTC"))
    pickup = placed + timedelta(hours=2)
    asap = SimpleNamespace(status="placed", placed_at=placed, pickup_at=None)
    pre = SimpleNamespace(status="placed", placed_at=placed, pickup_at=pickup)
    assert timing.due_at(asap, 15) == placed + timedelta(minutes=15)
    assert timing.due_at(pre, 15) == pickup
    assert timing.start_at(asap, 15) is None
    assert timing.start_at(pre, 15) == pickup - timedelta(minutes=15)
    assert timing.is_later(pre, 15, pickup - timedelta(minutes=16)) is True
    assert timing.is_later(pre, 15, pickup - timedelta(minutes=15)) is False
    assert timing.is_later(asap, 15, placed) is False


# --- Pickup slots -------------------------------------------------------------------------------


def test_slots_round_up_from_prep(db, branch):
    preorders_on(db, branch, hours=["10:00", "22:00"])
    slots = times(pickup_slots(db, branch, at(branch, 12, 7)))
    assert slots[0] == "12:30" and slots[-1] == "22:00"
    assert "12:15" not in slots and len(slots) == len(set(slots))


def test_slots_include_kitchen_delay(db, branch, staff_client, menu):
    preorders_on(db, branch, hours=["10:00", "22:00"])
    now = at(branch, 12, 7)
    for _ in range(2):
        o = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()["id"]
        set_order(db, o, placed_at=now - timedelta(minutes=15 + 7))
    assert times(pickup_slots(db, branch, now))[0] == "12:45"


def test_slots_overnight_window(db, branch):
    preorders_on(db, branch, hours=["18:00", "02:00"])
    slots = times(pickup_slots(db, branch, at(branch, 23, 30)))
    assert slots[0] == "23:45" and slots[-1] == "02:00" and "00:00" in slots  # 23:30 + 15 is a boundary


def test_slots_all_day_end_at_day_close(db, branch):
    preorders_on(db, branch)  # conftest hours: open around the clock
    slots = times(pickup_slots(db, branch, at(branch, 22, 0)))
    assert slots[-1] == "04:00"


def test_no_slots_when_off_paused_or_closed(db, branch):
    branch.opening_hours = {d: [["10:00", "22:00"]] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    db.commit()
    assert pickup_slots(db, branch, at(branch, 12, 0)) == []  # pre-orders off
    preorders_on(db, branch)
    branch.is_accepting_online_orders = False
    db.commit()
    assert pickup_slots(db, branch, at(branch, 12, 0)) == []
    branch.is_accepting_online_orders = True
    db.commit()
    assert pickup_slots(db, branch, at(branch, 23, 0)) == []


def test_full_slot_unavailable(db, branch, staff_client, menu):
    preorders_on(db, branch, limit=1, hours=["10:00", "22:00"])
    now = at(branch, 12, 7)
    o = counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()["id"]
    set_order(db, o, pickup_at=at(branch, 12, 30))
    slot = next(s for s in pickup_slots(db, branch, now) if s.time == "12:30")
    assert slot.available is False
    set_order(db, o, status="cancelled")
    slot = next(s for s in pickup_slots(db, branch, now) if s.time == "12:30")
    assert slot.available is True


def test_pickup_slots_endpoint_is_public(client, db, branch):
    preorders_on(db, branch)
    r = client.get(f"{API}/shop/pickup-slots")
    assert r.status_code == 200
    slots = r.json()["slots"]
    assert slots and all(set(s) == {"time", "available"} for s in slots)


def test_preorder_settings_audited_and_validated(client, admin_client, db, branch):
    r = admin_client.patch(f"{API}/admin/settings", json={"preorders_enabled": True, "preorder_slot_limit": 3})
    assert r.status_code == 200
    log = db.scalars(select(AuditLog).where(AuditLog.action == "settings_changed")).one()
    assert log.after == {"preorders_enabled": True, "preorder_slot_limit": 3}
    assert admin_client.patch(f"{API}/admin/settings", json={"preorder_slot_limit": 0}).status_code == 422
    shop = client.get(f"{API}/shop").json()
    assert (shop["preorders_enabled"], shop["preorder_slot_limit"]) == (True, 3)
