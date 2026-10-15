from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.main import app
from app.models import Order, utcnow
from app.orders.metrics import queue_metrics
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
