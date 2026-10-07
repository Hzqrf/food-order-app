import pyotp
from sqlalchemy import select

from app.models import AuditLog
from tests.conftest import ORIGIN, PASSWORD, login

API = "/api/v1"


def test_login_session_logout(client, staff):
    assert client.get(f"{API}/auth/session").json()["user"] is None
    r = login(client, "AINA")  # usernames are case-insensitive
    assert r.json()["user"]["role"] == "staff"
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert client.get(f"{API}/auth/session").json()["user"]["username"] == "aina"
    client.post(f"{API}/auth/logout")
    assert client.get(f"{API}/auth/session").json()["user"] is None


def test_wrong_password_locks_after_five(client, staff):
    for _ in range(5):
        r = client.post(f"{API}/auth/login", json={"login": "aina", "password": "nope"})
        assert r.json()["error"]["code"] == "invalid_credentials"
    r = client.post(f"{API}/auth/login", json={"login": "aina", "password": PASSWORD})
    assert r.status_code == 429 and r.json()["error"]["code"] == "account_locked"


def test_roles(client, staff, admin):
    assert client.get(f"{API}/admin/staff").status_code == 401
    login(client, "aina")
    assert client.get(f"{API}/admin/staff").json()["error"]["code"] == "forbidden"
    login(client, "owner@example.com")
    assert client.get(f"{API}/admin/staff").status_code == 200


def test_deactivating_staff_ends_their_sessions(client, staff, admin):
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app, headers={"Origin": ORIGIN}) as staff_device:
        login(staff_device, "aina")
        assert staff_device.get(f"{API}/staff/orders").status_code == 200
        login(client, "owner")
        assert client.post(f"{API}/admin/staff/{staff.id}/deactivate").json()["is_active"] is False
        assert staff_device.get(f"{API}/staff/orders").status_code == 401
        r = staff_device.post(f"{API}/auth/login", json={"login": "aina", "password": PASSWORD})
        assert r.status_code == 401


def test_tablet_registration_and_pin_unlock(client, staff, admin):
    assert client.get(f"{API}/auth/device/staff").json()["error"]["code"] == "device_not_registered"
    login(client, "owner")
    assert client.post(f"{API}/auth/device/register").status_code == 204
    client.post(f"{API}/auth/logout")

    # Locked tablet: the board is readable, actions are not.
    assert client.get(f"{API}/staff/orders").status_code == 200
    assert client.patch(f"{API}/staff/shop/online-orders", json={"accepting": False}).status_code == 401
    assert client.get(f"{API}/auth/device/staff").json() == [{"id": staff.id, "full_name": "Aina"}]

    wrong = client.post(f"{API}/auth/pin", json={"user_id": staff.id, "pin": "9999"})
    assert wrong.status_code == 401
    ok = client.post(f"{API}/auth/pin", json={"user_id": staff.id, "pin": "1234"})
    assert ok.json()["via_pin"] is True and ok.json()["user"]["full_name"] == "Aina"
    assert client.patch(f"{API}/staff/shop/online-orders", json={"accepting": False}).status_code == 200


def test_pin_needs_registered_device(client, staff):
    r = client.post(f"{API}/auth/pin", json={"user_id": staff.id, "pin": "1234"})
    assert r.json()["error"]["code"] == "device_not_registered"


def test_cross_origin_writes_refused(client, staff):
    r = client.post(f"{API}/auth/login", json={"login": "aina", "password": PASSWORD},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_admin_totp(client, admin, db):
    login(client, "owner")
    secret = client.post(f"{API}/auth/totp/setup").json()["secret"]
    assert client.post(f"{API}/auth/totp/enable", json={"code": "000000"}).status_code == 422
    assert client.post(f"{API}/auth/totp/enable", json={"code": pyotp.TOTP(secret).now()}).status_code == 204
    client.post(f"{API}/auth/logout")

    r = client.post(f"{API}/auth/login", json={"login": "owner", "password": PASSWORD})
    assert r.json()["error"]["code"] == "totp_required"
    r = client.post(f"{API}/auth/login", json={"login": "owner", "password": PASSWORD,
                                               "totp_code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200
    assert "admin_login" in set(db.scalars(select(AuditLog.action)))


def test_weak_password_rejected_when_creating_staff(admin_client):
    r = admin_client.post(f"{API}/admin/staff", json={"username": "new", "full_name": "New",
                                                      "password": "1234567890"})
    assert r.json()["error"]["code"] == "weak_password"
