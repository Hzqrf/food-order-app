from datetime import datetime, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, update

from app.models import AuditLog, Order, utcnow
from app.orders.metrics import extra_wait_minutes, queue_metrics
from app.orders import timing
from app.orders.slots import pickup_slots, slot_to_utc
from app.shop.service import business_date
from tests.conftest import counter_order, login, new_key
from tests.test_online import place, ref_of, webhook
from tests.test_pay_at_counter import counter_on, no_gateway  # noqa: F401  (fixture)

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


# --- Placing pre-orders -------------------------------------------------------------------------


def first_slot(client):
    slots = client.get(f"{API}/shop/pickup-slots").json()["slots"]
    return next(s["time"] for s in slots if s["available"])


def slot_utc(db, branch, hhmm):
    return slot_to_utc(db, branch, hhmm)


def test_online_preorder_waits_for_payment_then_is_placed(client, staff, menu, db, branch):
    preorders_on(db, branch)
    hhmm = first_slot(client)
    r = place(client, menu, pickup_time=hhmm)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending_payment"
    assert webhook(client, ref_of(body["payment_url"])).status_code == 200
    track = client.get(f"{API}/t/{body['token']}").json()
    expected = slot_utc(db, branch, hhmm)
    assert track["status"] == "placed"
    assert datetime.fromisoformat(track["pickup_at"]) == expected
    login(client, staff.username)
    [row] = client.get(f"{API}/staff/orders").json()
    assert datetime.fromisoformat(row["pickup_at"]) == expected
    assert datetime.fromisoformat(row["start_at"]) == expected - timedelta(minutes=15)


def test_counter_preorder_is_placed_unpaid(client, menu, db, branch, no_gateway):
    counter_on(db, branch)
    preorders_on(db, branch)
    r = place(client, menu, pickup_time=first_slot(client), pay_at_counter=True)
    assert r.status_code == 201, r.text
    track = client.get(f"{API}/t/{r.json()['token']}").json()
    assert (track["status"], track["payment_status"]) == ("placed", "unpaid") and track["pickup_at"]


def test_bad_times_refused(client, menu, db, branch):
    preorders_on(db, branch, hours=["00:00", "00:00"])
    for bad in ("25:00", "12:07", "abc", (datetime.now(KL) - timedelta(hours=1)).strftime("%H:00")):
        r = place(client, menu, pickup_time=bad)
        assert r.status_code == 422 and r.json()["error"]["code"] == "slot_unavailable", bad


def test_preorders_off_refused(client, menu):
    r = place(client, menu, pickup_time="12:00")
    assert r.status_code == 409 and r.json()["error"]["code"] == "preorders_off"


def test_last_place_goes_to_one_order(client, menu, db, branch):
    preorders_on(db, branch, limit=1)
    hhmm = first_slot(client)
    assert place(client, menu, pickup_time=hhmm).status_code == 201
    r = place(client, menu, phone="013-222 3333", pickup_time=hhmm)
    assert r.status_code == 409 and r.json()["error"]["code"] == "slot_full"
    slots = client.get(f"{API}/shop/pickup-slots").json()["slots"]
    assert next(s for s in slots if s["time"] == hhmm)["available"] is False


def test_preorder_retry_same_key_same_order(client, menu, db, branch):
    preorders_on(db, branch, limit=1)
    hhmm = first_slot(client)
    key = new_key()
    first = place(client, menu, key=key, pickup_time=hhmm)
    again = place(client, menu, key=key, pickup_time=hhmm)
    assert first.status_code == 201 and again.status_code in (200, 201)
    assert again.json()["order_code"] == first.json()["order_code"]


def test_asap_orders_have_no_pickup_time(client, staff, menu, db, branch):
    preorders_on(db, branch)
    body = place(client, menu).json()
    webhook(client, ref_of(body["payment_url"]))
    assert client.get(f"{API}/t/{body['token']}").json()["pickup_at"] is None
    login(client, staff.username)
    [row] = client.get(f"{API}/staff/orders").json()
    assert row["pickup_at"] is None and row["start_at"] is None


# --- Due time in late and busy figures ----------------------------------------------------------


def counter_ids(staff_client, menu, n):
    return [counter_order(staff_client, [{"menu_item_id": menu["milo"], "quantity": 1}]).json()["id"]
            for _ in range(n)]


def test_preorder_placed_early_is_not_late(staff_client, menu, db, branch):
    now = utcnow()
    [o] = counter_ids(staff_client, menu, 1)
    set_order(db, o, placed_at=now - timedelta(minutes=120), pickup_at=now + timedelta(minutes=60))
    m = queue_metrics(db, branch, now)
    assert m.running_late == 0 and m.open_orders == 0
    assert extra_wait_minutes(db, branch, now) == 0


def test_paid_online_preorder_is_later_not_late(staff_client, menu, db, branch):
    now = utcnow()
    [o] = counter_ids(staff_client, menu, 1)
    set_order(db, o, status="placed", placed_at=now - timedelta(minutes=30), pickup_at=now + timedelta(minutes=45))
    m = queue_metrics(db, branch, now)
    assert m.running_late == 0 and m.open_orders == 0


def test_overdue_preorder_is_late(staff_client, menu, db, branch):
    now = utcnow()
    for o in counter_ids(staff_client, menu, 2):
        set_order(db, o, placed_at=now - timedelta(minutes=90), pickup_at=now - timedelta(minutes=7))
    m = queue_metrics(db, branch, now)
    assert m.running_late == 2 and m.open_orders == 2
    assert extra_wait_minutes(db, branch, now) == 10


def test_preorders_today_and_next(staff_client, menu, db, branch):
    now = utcnow()
    a, b, c, d = counter_ids(staff_client, menu, 4)
    set_order(db, a, pickup_at=now + timedelta(minutes=30))
    set_order(db, b, pickup_at=now + timedelta(minutes=90))
    set_order(db, c, pickup_at=now - timedelta(minutes=10), status="preparing")
    set_order(db, d, pickup_at=now + timedelta(minutes=20), status="cancelled")
    m = queue_metrics(db, branch, now)
    assert m.preorders_today == 3
    assert m.next_preorder_at == (now + timedelta(minutes=30)).replace(microsecond=0) or \
        abs((m.next_preorder_at - (now + timedelta(minutes=30))).total_seconds()) < 1
