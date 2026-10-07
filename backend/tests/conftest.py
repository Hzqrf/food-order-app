import os

os.environ.setdefault(
    "TEST_DATABASE_URL", "mysql+pymysql://kaunter:kaunter@127.0.0.1:3307/kaunter_test?charset=utf8mb4")
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["MEDIA_DIR"] = os.path.join(os.path.dirname(__file__), ".media")
os.environ["RUN_SCHEDULER"] = "false"

import uuid  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.cli import DEFAULT_HOURS  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.menu.service import invalidate_menu_cache  # noqa: E402
from app.models import (Base, Branch, MenuCategory, MenuItem, MenuItemOptionGroup, Option,  # noqa: E402
                        OptionGroup, User)
from app.security import hash_secret, limiter  # noqa: E402

ORIGIN = "http://localhost:5173"
PASSWORD = "correct horse battery"


@pytest.fixture(scope="session", autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def clean():
    with engine.begin() as conn:
        if engine.dialect.name == "mysql":
            conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        if engine.dialect.name == "mysql":
            conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    limiter.reset()
    invalidate_menu_cache()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def branch(db):
    # Open around the clock, so online ordering works whenever the suite runs.
    all_day = {d: [["00:00", "00:00"]] for d in DEFAULT_HOURS}
    b = Branch(name="Test Shop", timezone="Asia/Kuala_Lumpur", opening_hours=all_day, prep_minutes=15)
    db.add(b)
    db.commit()
    return b


def _user(db, role, username, pin=None, email=None):
    u = User(role=role, username=username, email=email, full_name=username.title(),
             password_hash=hash_secret(PASSWORD), pin_hash=hash_secret(pin) if pin else None)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def admin(db, branch):
    return _user(db, "admin", "owner", email="owner@example.com")


@pytest.fixture
def staff(db, branch):
    return _user(db, "staff", "aina", pin="1234")


@pytest.fixture
def menu(db, branch):
    """Chicken Tender RM10 with Size (pick 1) and Add-ons (up to 3), plus Iced Milo RM4.50."""
    size = OptionGroup(name="Size", min_select=1, max_select=1)
    size.options = [Option(name="Regular", price_delta_sen=0, sort_order=10),
                    Option(name="Large", price_delta_sen=400, sort_order=20)]
    addons = OptionGroup(name="Add-ons", min_select=0, max_select=3)
    addons.options = [Option(name="Cheese", price_delta_sen=200, sort_order=10),
                      Option(name="Spicy Sauce", price_delta_sen=100, sort_order=20),
                      Option(name="Extra Chicken", price_delta_sen=500, sort_order=30)]
    cat = MenuCategory(name="Chicken", sort_order=10)
    drinks = MenuCategory(name="Drinks", sort_order=20)
    tender = MenuItem(category=cat, name="Chicken Tender", price_sen=1000, sort_order=10)
    tender.group_links = [MenuItemOptionGroup(group=size, sort_order=0),
                          MenuItemOptionGroup(group=addons, sort_order=10)]
    milo = MenuItem(category=drinks, name="Iced Milo", price_sen=450, sort_order=10)
    db.add_all([size, addons, cat, drinks, tender, milo])
    db.commit()
    o = {opt.name: opt.id for g in (size, addons) for opt in g.options}
    return {"tender": tender.id, "milo": milo.id, "size": size.id, "addons": addons.id, **o}


@pytest.fixture
def client():
    with TestClient(app, headers={"Origin": ORIGIN}) as c:
        yield c


def login(client: TestClient, username: str, password: str = PASSWORD):
    r = client.post("/api/v1/auth/login", json={"login": username, "password": password})
    assert r.status_code == 200, r.text
    return r


@pytest.fixture
def staff_client(client, staff):
    login(client, staff.username)
    return client


@pytest.fixture
def admin_client(client, admin):
    login(client, admin.username)
    return client


def new_key() -> str:
    return str(uuid.uuid4())


def counter_order(client, items, method="cash", tendered=None, key=None, **extra):
    body = {"items": items, "payment": {"method": method, "tendered_sen": tendered}, **extra}
    return client.post("/api/v1/staff/orders", json=body, headers={"Idempotency-Key": key or new_key()})
