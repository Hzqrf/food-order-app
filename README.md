# Kaunter

**Kaunter** is a white-label ordering and management system for small food shops: online pickup
orders, counter orders on a shared tablet, a live kitchen board, and an owner dashboard. Customers
only ever see the shop's own name; "Kaunter" appears on staff and owner screens ("Powered by Kaunter").

Built to the MVP design of 6 October 2026 (FastAPI + MySQL + React). The older specs in
[Documentation/](Documentation/) describe an earlier cash-on-collection, commission-based design and
are superseded.

## Status

Release 1, roadmap steps 1–4 are built:

| Step | What works |
| --- | --- |
| 1. Foundations | Migrations, owner and staff accounts, server-side sessions in httpOnly cookies, owner two-step sign-in (TOTP), lockout and rate limits, CSRF origin check, audit log, JSON logging |
| 2. Menu | Categories, items, reusable option groups (min/max choices), English + Malay names, photo upload re-encoded to WebP, sold-out and hidden switches, public menu page in EN/BM |
| 3. Order core and counter | Server-side pricing, order snapshots, the six-state machine, status events, idempotent order creation, daily order numbers, counter orders with cash/QR/card, the staff board with chime and undo, cancel with forced refund decision, search, sold-out page, shop tablet with PIN unlock, day-close job |
| 4. Online checkout | Cart kept on the device, item sheet with options and notes, one-screen checkout with phone read-back, prepaid orders through the gateway, signed webhooks, reconcile job for lost webhooks, 15-minute expiry, private tracking link that updates itself, pay again / cancel while unpaid, order again, recent orders on the device, pause switch and opening hours enforced |

Next: step 5 (Today dashboard with "needs attention", orders list, reports, audit screen), then
hardening and the pilot.

### Payments

No gateway has been chosen yet, so `PAYMENT_GATEWAY=fake` runs **FakePay**, a stand-in hosted page
at `/api/v1/fake-gateway/…`. It signs its webhooks like a real provider, so the webhook handler, the
reconcile job and the expiry job all run for real. Its buttons act out a successful payment, a
payment whose webhook is lost (the reconcile job finds it after 2 minutes), a failed payment, and a
customer who goes back without paying. Bills live in memory, so restarting the API forgets them;
their orders then simply expire. FakePay refuses to start when `ENV=production`.

Adding a real gateway (Billplz, HitPay, ToyyibPay…) means one class in
[backend/app/payments/gateway.py](backend/app/payments/gateway.py) with `create_bill`,
`verify_webhook` and `get_status`.

## Running locally

Needs Docker, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 22.

```sh
docker compose up -d mysql                     # MySQL 8.4 on localhost:3307

cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m app.cli setup --shop "Kedai Demo" --admin-email owner@example.com
uv run python -m app.cli seed-demo             # optional: demo menu, staff aina/1111 and farid/2222
uv run uvicorn app.main:app --port 8010 --reload

cd ../frontend
npm install
npm run dev                                    # http://localhost:5173, proxies /api to :8010
```

| URL | Who |
| --- | --- |
| `/` | Customer menu, cart, checkout |
| `/t/<token>` | A customer's private order tracking page |
| `/login` | Owner and staff sign-in. On a registered tablet it shows the PIN pad |
| `/staff` | Order board, take order, search, sold out |
| `/admin` | Menu, staff, settings |

To set up the counter tablet: sign in as the owner on the tablet, open Settings and register the
device. From then on staff tap their name and enter their PIN. The board stays visible while the
tablet is locked; any action asks for a PIN. A PIN unlock ends after 5 minutes without a touch.

## Tests and checks

```sh
cd backend && uv run pytest          # uses the kaunter_test database in the same MySQL container
cd frontend && npm run typecheck && npm run check:i18n
cd frontend && npm run gen:types     # regenerate API types after a backend change
```

## Layout

```text
backend/
  app/
    main.py config.py db.py models.py deps.py errors.py security.py audit.py jobs.py cli.py
    auth/      login, PIN unlock, tablet registration, TOTP
    menu/      public menu, sold-out switches, admin CRUD, images
    orders/    pricing.py (pure), state_machine.py (only writer of orders.status), counter and online
               orders, board, tracking link
    payments/  gateway.py (the swappable boundary + FakePay), webhook, reconcile and expiry
    shop/      opening hours, pause switch, business date
    staff/     staff accounts and PINs
  alembic/     migrations
  tests/       pricing, state machine, orders, auth, menu
frontend/src/
  api/         fetch client, generated OpenAPI types, TanStack Query hooks
  areas/       customer, staff, admin — lazy-loaded route trees
  locales/     en.json, ms.json
```

## Rules the code keeps

1. The server calculates every price. Clients send ids and quantities.
2. The order exists before payment starts; only a webhook or server-side check proves online payment.
3. `orders/state_machine.py` is the only code that changes an order's status.
4. Order lines carry their own names and prices.
5. Nothing with history is deleted: items, staff and orders are deactivated.
6. Money is integer sen everywhere; times are stored in UTC with a separate `business_date`.
