"""Running a real shop: production settings, counter-only mode, backup warnings, health check."""
import json
from datetime import timedelta

import pytest

from app.config import Settings, get_settings
from app.jobs import payments_tick
from app.models import utcnow
from app.reports.queries import backup_attention
from tests.conftest import login, new_key

API = "/api/v1"


def safe_production(**overrides) -> Settings:
    values = dict(env="production", cookie_secure=True, public_base_url="https://order.example.com",
                  allowed_origins=["https://order.example.com"], payment_gateway="none")
    return Settings(_env_file=None, **(values | overrides))


def test_safe_production_settings_pass():
    assert safe_production().production_problems() == []


@pytest.mark.parametrize("overrides, problem", [
    ({"cookie_secure": False}, "COOKIE_SECURE"),
    ({"public_base_url": "http://order.example.com"}, "PUBLIC_BASE_URL"),
    ({"allowed_origins": ["http://localhost:5173"]}, "ALLOWED_ORIGINS"),
    ({"payment_gateway": "fake"}, "PAYMENT_GATEWAY=fake"),
    # A real gateway needs a real webhook secret; counter-only mode does not.
    ({"payment_gateway": "billplz"}, "GATEWAY_WEBHOOK_SECRET"),
    ({"payment_gateway": "billplz", "gateway_webhook_secret": "short"}, "GATEWAY_WEBHOOK_SECRET"),
])
def test_unsafe_production_settings_are_named(overrides, problem):
    problems = safe_production(**overrides).production_problems()
    assert any(p.startswith(problem) for p in problems), problems


@pytest.fixture
def counter_only(monkeypatch):
    monkeypatch.setattr(get_settings(), "payment_gateway", "none")


def test_counter_only_mode_turns_online_ordering_off(client, staff, menu, branch, counter_only):
    shop = client.get(f"{API}/shop").json()
    assert shop["online_payments_enabled"] is False
    assert shop["can_order_online"] is False

    item = {"menu_item_id": menu["milo"], "quantity": 1}
    r = client.post(f"{API}/orders", json={"items": [item], "expected_total_sen": 450},
                    headers={"Idempotency-Key": new_key()})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "shop_closed"
    assert client.post(f"{API}/webhooks/payments/fake", content=b"{}").status_code == 404

    # Staff can't switch online orders on, and the minute job does nothing.
    login(client, staff.username)
    client.patch(f"{API}/staff/shop/online-orders", json={"accepting": False})
    r = client.patch(f"{API}/staff/shop/online-orders", json={"accepting": True})
    assert r.json()["error"]["code"] == "no_payment_option"
    assert payments_tick(None) == {"reconciled": 0, "expired": 0}

    # Counter orders work as usual.
    r = client.post(f"{API}/staff/orders", json={"items": [item], "payment": {"method": "cash"}},
                    headers={"Idempotency-Key": new_key()})
    assert r.status_code == 201, r.text


@pytest.fixture
def status_file(tmp_path, monkeypatch):
    path = tmp_path / "status.json"
    monkeypatch.setattr(get_settings(), "backup_status_file", path)
    return path


def write_status(path, ok=True, hours_ago=1, message=None):
    path.write_text(json.dumps({"ok": ok, "message": message,
                                "finished_at": (utcnow() - timedelta(hours=hours_ago)).isoformat()}))


def test_no_backup_warnings_without_a_status_file_setting():
    assert get_settings().backup_status_file is None
    assert backup_attention() is None


def test_backup_warnings(status_file):
    assert backup_attention().kind == "backup_late"  # never ran

    write_status(status_file)
    assert backup_attention() is None

    write_status(status_file, hours_ago=31)
    assert backup_attention().kind == "backup_late"

    write_status(status_file, ok=False, message="restore check: orders 0 != 12")
    found = backup_attention()
    assert (found.kind, found.message) == ("backup_failed", "restore check: orders 0 != 12")

    status_file.write_text("not json")
    assert backup_attention().kind == "backup_failed"


def test_backup_warning_on_the_dashboard(client, admin, status_file):
    write_status(status_file, ok=False, message="mysqldump failed")
    login(client, admin.username)
    attention = client.get(f"{API}/admin/dashboard").json()["needs_attention"]
    assert attention[0]["kind"] == "backup_failed"
    assert attention[0]["order"] is None


def test_health_checks_the_database(client):
    assert client.get(f"{API}/health").json() == {"ok": True}
