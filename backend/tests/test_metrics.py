from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.main import app
from app.models import Order, utcnow
from app.orders.metrics import extra_wait_minutes, queue_metrics
from app.shop.service import business_date
from tests.conftest import ORIGIN, counter_order, login

API = "/api/v1"


def milo(menu):
    return {"menu_item_id": menu["milo"], "quantity": 1}


def set_order(db, order_id, **values):
    db.execute(update(Order).where(Order.id == order_id).values(**values))
    db.commit()


def test_metrics_counts_and_average(staff_client, menu, db, branch):
    now = utcnow()
    a, b, c = (counter_order(staff_client, [milo(menu)]).json()["id"] for _ in range(3))
    set_order(db, a, status="ready", preparing_at=now - timedelta(minutes=30), ready_at=now - timedelta(minutes=20))
    set_order(db, b, status="ready", preparing_at=now - timedelta(minutes=40), ready_at=now - timedelta(minutes=20))
    set_order(db, c, placed_at=now - timedelta(minutes=20))  # prep_minutes is 15, so this one is late

    m = staff_client.get(f"{API}/staff/orders/metrics").json()
    assert m["open_orders"] == 3 and m["avg_prep_minutes"] == 15.0
    assert m["running_late"] == 1 and m["orders_today"] == 3
    assert m["avg_prep_minutes_last_week"] is None and m["orders_same_day_last_week"] == 0


def test_metrics_with_no_orders(staff_client, branch):
    m = staff_client.get(f"{API}/staff/orders/metrics").json()
    assert m == {"open_orders": 0, "avg_prep_minutes": None, "avg_prep_minutes_last_week": None,
                 "running_late": 0, "orders_today": 0, "orders_same_day_last_week": 0}


def test_metrics_last_week_comparison(staff_client, menu, db, branch):
    now = utcnow()
    o = counter_order(staff_client, [milo(menu)]).json()["id"]
    week_ago = now - timedelta(days=7)
    set_order(db, o, status="completed", business_date=business_date(branch) - timedelta(days=7),
              placed_at=week_ago - timedelta(minutes=70),
              preparing_at=week_ago - timedelta(minutes=60), ready_at=week_ago - timedelta(minutes=30))
    m = staff_client.get(f"{API}/staff/orders/metrics").json()
    assert m["orders_same_day_last_week"] == 1 and m["avg_prep_minutes_last_week"] == 30.0
    assert m["orders_today"] == 0 and m["open_orders"] == 0


def test_metrics_use_business_day_not_calendar_day(staff_client, menu, db, branch):
    counter_order(staff_client, [milo(menu)])
    tz = ZoneInfo(branch.timezone)
    today = business_date(branch)
    # 02:00 the next calendar morning is before the 04:00 day close: still today's business day.
    small_hours = datetime.combine(today + timedelta(days=1), time(2, 0), tz)
    assert queue_metrics(db, branch, now=small_hours).orders_today == 1
    # 05:00 is the next business day.
    next_day = datetime.combine(today + timedelta(days=1), time(5, 0), tz)
    assert queue_metrics(db, branch, now=next_day).orders_today == 0


def test_locked_tablet_can_read_metrics(client, admin, branch):
    with TestClient(app, headers={"Origin": ORIGIN}) as tablet:
        login(tablet, "owner")
        assert tablet.post(f"{API}/auth/device/register").status_code == 204
        tablet.post(f"{API}/auth/logout")
        assert tablet.get(f"{API}/staff/orders/metrics").status_code == 200


def test_metrics_need_a_session_or_tablet(client, branch):
    assert client.get(f"{API}/staff/orders/metrics").status_code == 401


def test_last_week_order_count_stops_at_the_same_time_of_day(staff_client, menu, db, branch):
    now = utcnow()
    week_ago = business_date(branch) - timedelta(days=7)
    earlier, later = (counter_order(staff_client, [milo(menu)]).json()["id"] for _ in range(2))
    set_order(db, earlier, business_date=week_ago, placed_at=now - timedelta(days=7, hours=1))
    set_order(db, later, business_date=week_ago, placed_at=now - timedelta(days=7) + timedelta(hours=1))
    assert queue_metrics(db, branch, now=now).orders_same_day_last_week == 1


# --- Extra wait shown to customers when the kitchen is behind -----------------------------------


def late(staff_client, menu, db, now, minutes_late):
    """One placed order this many minutes past its promise (prep_minutes is 15)."""
    o = counter_order(staff_client, [milo(menu)]).json()["id"]
    set_order(db, o, placed_at=now - timedelta(minutes=15 + minutes_late))
    return o


def test_extra_wait_needs_two_late_orders(staff_client, menu, db, branch):
    now = utcnow()
    assert extra_wait_minutes(db, branch, now) == 0
    late(staff_client, menu, db, now, 40)
    assert extra_wait_minutes(db, branch, now) == 0


def test_extra_wait_rounds_up_to_five(staff_client, menu, db, branch):
    now = utcnow()
    a, b = late(staff_client, menu, db, now, 1), late(staff_client, menu, db, now, 3)
    assert extra_wait_minutes(db, branch, now) == 5  # average 2
    set_order(db, a, placed_at=now - timedelta(minutes=15 + 4))
    set_order(db, b, placed_at=now - timedelta(minutes=15 + 8))
    assert extra_wait_minutes(db, branch, now) == 10  # average 6
    set_order(db, a, placed_at=now - timedelta(minutes=15 + 5))
    set_order(db, b, placed_at=now - timedelta(minutes=15 + 5))
    assert extra_wait_minutes(db, branch, now) == 5  # exactly 5 stays 5


def test_extra_wait_capped_at_sixty(staff_client, menu, db, branch):
    now = utcnow()
    late(staff_client, menu, db, now, 90)
    late(staff_client, menu, db, now, 100)
    assert extra_wait_minutes(db, branch, now) == 60


def test_extra_wait_ignores_ready_orders(staff_client, menu, db, branch):
    now = utcnow()
    a = late(staff_client, menu, db, now, 10)
    late(staff_client, menu, db, now, 10)
    set_order(db, a, status="ready")
    assert extra_wait_minutes(db, branch, now) == 0


def test_shop_reports_extra_wait(client, staff_client, menu, db):
    now = utcnow()
    late(staff_client, menu, db, now, 7)
    late(staff_client, menu, db, now, 7)
    body = client.get(f"{API}/shop").json()
    assert body["extra_wait_minutes"] == 10
    assert set(body) == {"name", "is_open", "is_accepting_online_orders", "can_order_online",
                         "online_payments_enabled", "prep_minutes", "opening_hours", "timezone",
                         "extra_wait_minutes"}


def test_extra_wait_ignores_orders_from_earlier_days(staff_client, menu, db, branch):
    """A forgotten order from yesterday must not keep today's busy banner up."""
    now = utcnow()
    a = late(staff_client, menu, db, now, 10)
    b = late(staff_client, menu, db, now, 10)
    yesterday = business_date(branch, now) - timedelta(days=1)
    set_order(db, a, business_date=yesterday)
    set_order(db, b, business_date=yesterday)
    assert extra_wait_minutes(db, branch, now) == 0
