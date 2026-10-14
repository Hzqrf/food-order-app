import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.db import engine
from app.main import app
from app.models import AuditLog, Order, OrderStatusEvent
from tests.conftest import ORIGIN, _user, counter_order, login

API = "/api/v1"
MIGRATION = Path(__file__).parent.parent / "alembic" / "versions" / "20261014_5c1e7a2b9d40_order_claim_and_preparing_at.py"


def tender(menu):
    return {"menu_item_id": menu["tender"], "quantity": 1, "option_ids": [menu["Regular"]]}


def claim(client, order_id, version):
    return client.post(f"{API}/staff/orders/{order_id}/claim", json={"version": version})


def test_claim_sets_taker_and_is_idempotent(staff_client, menu):
    o = counter_order(staff_client, [tender(menu)]).json()
    r = claim(staff_client, o["id"], 1)
    assert r.status_code == 200, r.text
    assert r.json()["claimed_by_name"] == "Aina" and r.json()["status"] == "placed"
    assert r.json()["claimed_at"] is not None
    v = r.json()["version"]
    again = claim(staff_client, o["id"], v)
    assert again.status_code == 200 and again.json()["version"] == v  # no change, no bump


def test_start_cooking_claims_unclaimed_order_and_sets_preparing_at(staff_client, menu):
    o = counter_order(staff_client, [tender(menu)]).json()
    assert o["claimed_by_name"] is None and o["preparing_at"] is None
    r = staff_client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "preparing", "version": 1}).json()
    assert r["claimed_by_name"] == "Aina" and r["preparing_at"] is not None


def test_start_cooking_keeps_existing_claimer(client, staff, db, menu):
    badri = _user(db, "staff", "badri", pin="5678")
    login(client, "aina")
    o = counter_order(client, [tender(menu)]).json()
    v = claim(client, o["id"], 1).json()["version"]
    login(client, badri.username)
    r = client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "preparing", "version": v}).json()
    assert r["claimed_by_name"] == "Aina"


def test_takeover_is_allowed_and_audited(client, staff, db, menu):
    badri = _user(db, "staff", "badri", pin="5678")
    login(client, "aina")
    o = counter_order(client, [tender(menu)]).json()
    v = claim(client, o["id"], 1).json()["version"]
    login(client, badri.username)
    r = claim(client, o["id"], v)
    assert r.status_code == 200 and r.json()["claimed_by_name"] == "Badri"
    logs = db.scalars(select(AuditLog).where(AuditLog.action == "order_claim_takeover")).all()
    assert len(logs) == 1
    assert logs[0].entity_id == o["id"]
    assert logs[0].before == {"claimed_by_user_id": staff.id} and logs[0].after == {"claimed_by_user_id": badri.id}


def test_claim_rejected_when_not_claimable_or_stale(staff_client, menu):
    o = counter_order(staff_client, [tender(menu)]).json()
    stale = claim(staff_client, o["id"], 99)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"
    staff_client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "ready", "version": 1})
    late = claim(staff_client, o["id"], 2)
    assert late.status_code == 409 and late.json()["error"]["code"] == "not_claimable"


def test_locked_tablet_cannot_claim(client, staff, admin, menu):
    login(client, "aina")
    o = counter_order(client, [tender(menu)]).json()
    with TestClient(app, headers={"Origin": ORIGIN}) as tablet:
        login(tablet, "owner")
        assert tablet.post(f"{API}/auth/device/register").status_code == 204
        tablet.post(f"{API}/auth/logout")
        r = claim(tablet, o["id"], 1)
        assert r.status_code == 401


def test_backfill_preparing_at(staff_client, menu, db):
    o = counter_order(staff_client, [tender(menu)]).json()
    staff_client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "preparing", "version": 1})
    db.execute(update(Order).where(Order.id == o["id"]).values(preparing_at=None))
    db.commit()

    spec = importlib.util.spec_from_file_location("claim_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.begin() as conn:
        module.backfill_preparing_at(conn)

    db.expire_all()
    event_at = db.scalar(select(OrderStatusEvent.created_at).where(
        OrderStatusEvent.order_id == o["id"], OrderStatusEvent.to_status == "preparing"))
    assert db.get(Order, o["id"]).preparing_at == event_at
