"""Command line tasks.

    python -m app.cli setup --shop "Kedai Ayam" --admin-email owner@example.com --admin-username owner
    python -m app.cli seed-demo
    python -m app.cli close-day
    python -m app.cli payments-tick     # reconcile lost webhooks, expire unpaid orders
"""
import argparse
import getpass
import json
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (Branch, MenuCategory, MenuItem, MenuItemOptionGroup, Option, OptionGroup, User)
from app.security import check_password_strength, hash_secret

DEFAULT_HOURS = {d: [["10:00", "22:00"]] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


def setup(args) -> None:
    password = args.admin_password or getpass.getpass("Owner password (10+ characters): ")
    check_password_strength(password)
    with SessionLocal() as db, db.begin():
        if db.scalar(select(Branch.id)) is None:
            db.add(Branch(name=args.shop, timezone="Asia/Kuala_Lumpur", opening_hours=DEFAULT_HOURS,
                          prep_minutes=15, is_accepting_online_orders=True))
        if db.scalar(select(User.id).where(User.username == args.admin_username)):
            sys.exit(f"User {args.admin_username} already exists.")
        db.add(User(role="admin", username=args.admin_username.lower(), email=args.admin_email.lower(),
                    full_name=args.admin_name, password_hash=hash_secret(password)))
    print("Shop and owner account created.")


def seed_demo(_args) -> None:
    """A small demo menu and two staff with PINs, for local development only."""
    with SessionLocal() as db, db.begin():
        if db.scalar(select(MenuItem.id)):
            sys.exit("Menu already has items; not seeding.")
        size = OptionGroup(name="Size", name_ms="Saiz", min_select=1, max_select=1)
        size.options = [Option(name="Regular", name_ms="Biasa", price_delta_sen=0, sort_order=10),
                        Option(name="Large", name_ms="Besar", price_delta_sen=400, sort_order=20)]
        addons = OptionGroup(name="Add-ons", name_ms="Tambahan", min_select=0, max_select=3)
        addons.options = [Option(name="Cheese", name_ms="Keju", price_delta_sen=200, sort_order=10),
                          Option(name="Spicy Sauce", name_ms="Sos Pedas", price_delta_sen=100, sort_order=20),
                          Option(name="Extra Chicken", name_ms="Ayam Tambahan", price_delta_sen=500, sort_order=30)]
        sauce = OptionGroup(name="Sauce", name_ms="Sos", min_select=0, max_select=2)
        sauce.options = [Option(name="Chilli", name_ms="Cili", price_delta_sen=0, sort_order=10),
                         Option(name="Mayo", name_ms="Mayo", price_delta_sen=0, sort_order=20)]
        db.add_all([size, addons, sauce])

        chicken = MenuCategory(name="Chicken", name_ms="Ayam", sort_order=10)
        snacks = MenuCategory(name="Snacks", name_ms="Snek", sort_order=20)
        sweet = MenuCategory(name="Sweet Bites", name_ms="Manisan", sort_order=30)
        drinks = MenuCategory(name="Drinks", name_ms="Minuman", sort_order=40)
        db.add_all([chicken, snacks, sweet, drinks])

        def item(cat, name, name_ms, price, sort, desc=None, groups=()):
            it = MenuItem(category=cat, name=name, name_ms=name_ms, price_sen=price, sort_order=sort,
                          description=desc)
            it.group_links = [MenuItemOptionGroup(group=g, sort_order=i * 10) for i, g in enumerate(groups)]
            db.add(it)

        item(chicken, "Chicken Tender", "Tender Ayam", 1000, 10, "Crispy strips, cooked to order",
             (size, addons))
        item(chicken, "Popcorn Chicken", "Ayam Popcorn", 800, 20, None, (size, sauce))
        item(snacks, "Keropok Lekor", "Keropok Lekor", 500, 10, None, (sauce,))
        item(snacks, "Fries", "Kentang Goreng", 600, 20, None, (size, sauce))
        item(sweet, "Kaya Ball", "Bebola Kaya", 400, 10)
        item(sweet, "Waffle", "Wafel", 700, 20, None, (addons,))
        item(drinks, "Iced Milo", "Milo Ais", 450, 10)
        item(drinks, "Teh Tarik", "Teh Tarik", 350, 20)

        for username, name, pin in (("aina", "Aina", "1111"), ("farid", "Farid", "2222")):
            if not db.scalar(select(User.id).where(User.username == username)):
                db.add(User(role="staff", username=username, full_name=name, position="Counter",
                            password_hash=hash_secret("staffpassword1"), pin_hash=hash_secret(pin)))
    print("Demo menu and staff (aina/1111, farid/2222, password staffpassword1) created.")


def close_day(_args) -> None:
    from app.jobs import close_day as run
    with SessionLocal() as db, db.begin():
        print(json.dumps(run(db)))


def payments_tick(_args) -> None:
    from app.jobs import payments_tick as run
    with SessionLocal() as db, db.begin():
        print(json.dumps(run(db)))


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("setup", help="create the shop row and the owner account")
    p.add_argument("--shop", required=True)
    p.add_argument("--admin-email", required=True)
    p.add_argument("--admin-username", default="owner")
    p.add_argument("--admin-name", default="Owner")
    p.add_argument("--admin-password", help="omit to be prompted")
    p.set_defaults(fn=setup)
    sub.add_parser("seed-demo").set_defaults(fn=seed_demo)
    sub.add_parser("close-day").set_defaults(fn=close_day)
    sub.add_parser("payments-tick").set_defaults(fn=payments_tick)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
