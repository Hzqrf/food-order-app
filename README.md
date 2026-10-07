# Kaunter

**Kaunter** is a white-label ordering and management system for small food shops. Customers order
and pay online for pickup; staff take counter orders and run a live kitchen board on a shared
tablet; the owner manages the menu, the team and the settings.

White-label means customers only ever see the shop's own name. "Kaunter" appears only on staff and
owner screens ("Powered by Kaunter").

Stack: FastAPI + SQLAlchemy + MySQL 8 on the backend, React + Vite + Mantine on the frontend, built to
the MVP design of 6 October 2026. The older specs in [Documentation/](Documentation/) describe an
earlier cash-on-collection, commission-based design and are superseded.

- [What works today](#what-works-today)
- [Installation](#installation)
- [Getting around: customer, staff and owner](#getting-around-customer-staff-and-owner)
- [Payments](#payments)
- [Tests and checks](#tests-and-checks)
- [Troubleshooting](#troubleshooting)
- [Code layout](#code-layout)

## What works today

Release 1, roadmap steps 1–4:

| Step | What works |
| --- | --- |
| 1. Foundations | Database migrations, owner and staff accounts, server-side sessions in httpOnly cookies, owner two-step sign-in (authenticator app), lockout and rate limits, protection against cross-site requests, audit log, JSON logging |
| 2. Menu | Categories, items, reusable option groups ("Size: choose 1", "Add-ons: up to 3"), English and Malay names, photo upload, sold-out and hidden switches, customer menu in English and Bahasa Malaysia |
| 3. Counter and kitchen | Server-side pricing, the order life cycle (New → Preparing → Ready → Collected, or Cancelled), counter orders paid by cash, QR or card, the staff board with a new-order chime and a 5-second undo, cancelling with a required refund decision, order search, sold-out page, the shop tablet with PIN unlock, the nightly day close |
| 4. Online ordering | Cart kept on the customer's phone, options and notes per item, a one-screen checkout, prepaid orders through the payment gateway, a private tracking page that updates itself, pay again or cancel while unpaid, order again, recent orders with their live status, the pause switch and opening hours |

Recent changes:

- **Checkout asks for no name, and the phone number is optional.** If a phone number is given it
  must be a valid Malaysian number, and it is read back ("We'll use +60 12-345 6789") to catch typos.
- **Every order has a permanent order ID**, such as `PM4WS7`, as well as the 3-digit number called
  out at the counter. The number restarts every day; the ID never repeats. Customers see the ID on
  their tracking page; staff see it on the board and can search by it.
- **"Your recent orders" shows each order's status** on the customer menu page: Awaiting payment,
  Received, Preparing, Ready, Done, Payment failed or Cancelled, updated while the order is in progress.

Next: step 5 (the owner's Today dashboard with a "Needs attention" panel, the orders list, reports
and the audit log screen), then hardening and a pilot in the shop.

## Installation

### What you need

| Tool | Version | Used for |
| --- | --- | --- |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | any recent | Runs the MySQL database |
| [Python](https://www.python.org/downloads/) | 3.12 or newer | The backend |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | any recent | Installs Python packages and runs the backend |
| [Node.js](https://nodejs.org/) | 22 | The frontend |
| Git | any | Getting the code |

The commands below work in Git Bash, macOS and Linux terminals. Notes for PowerShell are at the end of
each step.

### 1. Get the code

```sh
git clone <repository-url> kaunter
cd kaunter
```

### 2. Start the database

Make sure Docker Desktop is running, then:

```sh
docker compose up -d mysql
```

This starts MySQL 8.4 on `localhost:3307` with two databases: `kaunter` for the app and
`kaunter_test` for the test suite. The data is kept in a Docker volume between restarts.

### 3. Set up the backend

```sh
cd backend
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
uv sync                       # installs Python packages into backend/.venv
uv run alembic upgrade head   # creates the tables
```

Create the shop and the owner account. You are asked for the owner's password (10 characters or
more):

```sh
uv run python -m app.cli setup --shop "Kedai Demo" --admin-email owner@example.com --admin-name "Shop Owner"
```

Optionally, load a demo menu and two staff members to try things out:

```sh
uv run python -m app.cli seed-demo
```

| Demo account | Sign in with |
| --- | --- |
| Owner | `owner@example.com` (or username `owner`) and the password you chose |
| Staff: Aina | PIN `1111` on the shop tablet, or username `aina` / password `staffpassword1` |
| Staff: Farid | PIN `2222` on the shop tablet, or username `farid` / password `staffpassword1` |

Start the API:

```sh
uv run uvicorn app.main:app --port 8010 --reload
```

Leave this terminal open. The API runs on port 8010, with its interactive docs at
<http://localhost:8010/api/docs>. With `RUN_SCHEDULER=true` (the default in `.env`) it also runs the
timed jobs: every minute it checks for lost payments and expires unpaid orders; at 4 am shop time it
closes the day.

### 4. Set up the frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The frontend passes `/api` and `/media` requests on to the API on port
8010, so the app and the API share one address, exactly as they will in production.

### Every day after that

```sh
docker compose up -d mysql                                         # if Docker was restarted
cd backend && uv run uvicorn app.main:app --port 8010 --reload     # terminal 1
cd frontend && npm run dev                                         # terminal 2
```

After pulling new code, run `uv sync` and `uv run alembic upgrade head` in `backend`, and
`npm install` in `frontend`.

### Settings

All backend settings live in `backend/.env`. The defaults suit local development.

| Setting | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | the Docker MySQL | Where the database is |
| `ALLOWED_ORIGINS` | `localhost:5173` | Addresses allowed to send changes to the API |
| `RUN_SCHEDULER` | `true` | Run the timed jobs inside the API process |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Where customers reach the app; used for payment return links |
| `PAYMENT_GATEWAY` | `fake` | Which payment gateway to use (see [Payments](#payments)) |
| `GATEWAY_WEBHOOK_SECRET` | a dev value | The secret the gateway signs its messages with |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `BEHIND_PROXY` | `false` | Set `true` behind Caddy, so rate limits see the real client address |

## Getting around: customer, staff and owner

All three use the same address. What you see depends on the page and on who is signed in.

| Who | Start at | What they do there |
| --- | --- | --- |
| Customer | <http://localhost:5173/> | Browse the menu, add to cart, check out and pay, follow the order |
| Staff | <http://localhost:5173/staff> | Run the order board, take counter orders, search orders, mark items sold out |
| Owner | <http://localhost:5173/admin> | Manage the menu, staff and shop settings; the owner can also use every staff screen |

Signing in for staff and owner happens at <http://localhost:5173/login>. Going to `/staff` or
`/admin` while signed out sends you there.

### Customer

No account and no sign-in.

1. **Menu** (`/`): tap an item to choose options, quantity and a note, then **Add**. The cart bar at
   the bottom shows the count and total. Switch between English and Bahasa Malaysia with **EN / BM**
   at the top right.
2. **Cart** (`/cart`): change quantities, then **Checkout**.
3. **Checkout** (`/checkout`): add a phone number if you like (optional) and a note, then
   **Pay**. You are taken to the payment page.
4. **Tracking page** (`/t/<link>`): after paying you land here. It shows the order number to listen
   for, the order ID, and each step as it happens, and turns green when the order is ready. If you
   didn't pay, it offers **Pay now** for 15 minutes, or **Cancel this order**.
5. Back on the menu, **Your recent orders** lists this phone's last five orders with their status.
   Tap one to open its tracking page.

### Staff

**On their own phone:** go to `/login` and sign in with username and password. They stay signed in
for 30 days.

**On the shared shop tablet** (set up once by the owner, see below): staff never type a password.

1. The tablet shows the order board, locked: orders are visible, but nothing can be changed.
2. Tap **Tap to unlock**, tap your name, enter your PIN, then **OK**.
3. Work. Your name stays at the top right so everyone can see who is signed in.
4. Tap **Your name · Lock** when you step away. The tablet also locks itself after 5 minutes
   without a touch.

The staff screens, along the bottom bar:

| Tab | What it does |
| --- | --- |
| **Board** | Three columns: New, Preparing, Ready. One button per card moves it on: **Start**, **Ready**, **Handed over**. New online orders chime and flash until someone taps them. Cards turn amber after the usual prep time. Tap a card for full details, other moves and **Cancel order** |
| **Take order** | Tap items to build a counter order, add an optional name to call out, then **Charge** and take cash (the change is shown), QR or card |
| **Search** | Find an order by its number (`42`), order ID (`PM4WS7`), phone number or name. Staff see the last 7 days |
| **Sold out** | Switch off anything that has run out. Everything switches back on automatically after closing |

The **Online orders** switch at the top left pauses new online orders during a rush.

### Owner

Sign in at `/login` with the owner email and password. The owner lands on `/admin`:

| Page | What it does |
| --- | --- |
| **Menu** | Items (with photos, prices, English and Malay names), option groups, categories, order of display |
| **Staff** | Add people, set their tablet PIN, reset passwords, deactivate leavers (their history is kept) |
| **Settings** | Shop name, usual prep time, opening hours, pausing online orders, registering the shop tablet, two-step sign-in, changing your password |

**Switching between owner and staff screens:**

- From the owner pages, click **Order board** in the left sidebar to open the staff screens.
- From the staff screens, the **gear icon** at the top right takes the owner back to `/admin`.
  Staff don't see it.
- **Sign out** is at the top right of the owner pages. On the shop tablet, signing out leaves the
  locked board up for staff; anywhere else it returns to the sign-in page.

**Setting up the shop tablet (once):**

1. On the tablet, open `/login` and sign in as the owner.
2. Go to **Settings → Shop tablet → Register this device as the shop tablet**.
3. Click **Sign out**. The tablet now shows the locked board, and staff unlock it with their PINs.

Give each staff member a PIN first, on the **Staff** page.

### Trying all three at once on one computer

Sign-in is remembered per browser, so use separate windows:

| Window | Opens as |
| --- | --- |
| A normal window at `/` | The customer |
| A private/incognito window at `/login` | The owner, who registers it as the tablet, then signs out so it can be used as staff |

A private window forgets everything when it closes, including the tablet registration.

## Payments

No payment gateway has been chosen yet, so `PAYMENT_GATEWAY=fake` runs **FakePay**, a stand-in
payment page. Customers who check out land on it and choose what happens:

| Button | What it acts out |
| --- | --- |
| **Pay (DuitNow QR)** | A normal payment: the order goes straight to the kitchen board |
| **Pay, but lose the webhook** | The payment succeeds but the gateway's message is lost. The order stays "Awaiting payment" until the every-minute check asks the gateway, about 2 minutes later |
| **Payment fails** | The customer can try again from the tracking page |
| **Go back without paying** | The order waits 15 minutes, then is cancelled as "Payment failed" |

FakePay signs its messages exactly as a real gateway would, so the real payment code runs end to
end. It keeps its bills in memory, so restarting the API forgets them; any orders left unpaid then
simply expire. It refuses to start when `ENV=production`.

Adding a real gateway (Billplz, HitPay, ToyyibPay or another) means writing one class in
[backend/app/payments/gateway.py](backend/app/payments/gateway.py) with three methods: `create_bill`,
`verify_webhook` and `get_status`.

Refunds of online payments are done by the owner in the gateway's own dashboard, then recorded in
Kaunter. Staff cannot hand back money that was paid online; when they cancel such an order it is
marked "paid but cancelled" for the owner.

## Tests and checks

```sh
cd backend && uv run pytest              # the backend suite, against the kaunter_test database
cd frontend && npm run typecheck         # TypeScript
cd frontend && npm run check:i18n        # every text has an English and a Malay version
cd frontend && npm run build             # production build into frontend/dist
cd frontend && npm run gen:types         # regenerate API types after changing the backend
```

Useful commands while developing:

```sh
cd backend
uv run python -m app.cli payments-tick   # run the lost-payment check and the expiry now
uv run python -m app.cli close-day       # run the day close now (resets sold-out, closes Ready orders)
uv run alembic revision --autogenerate -m "describe the change"   # after editing app/models.py
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `docker compose` says it cannot connect | Start Docker Desktop and wait until it says it is running |
| The API won't start: "address already in use" on 8010 | Something else uses that port. Run the API on another port and start the frontend with `API_URL=http://127.0.0.1:<port> npm run dev` |
| The page loads but shows "Something went wrong" | The API isn't running, or the database isn't. Check terminal 1 and `docker compose ps` |
| "The shop has not been set up yet" | Run the `setup` command from step 3 |
| Online ordering is greyed out | The shop is outside its opening hours or paused. Change it in **Settings** (the same opening and closing time means open 24 hours) |
| Staff see "This device is not registered" | Register the tablet from **Settings** while signed in as the owner, in that same browser |
| An order sits on "Awaiting payment" after the API restarted | Expected with FakePay: its bills were forgotten. The order is cancelled after 15 minutes |
| Start again with an empty database | `docker compose down -v`, then repeat steps 2 and 3. This deletes all data |

## Code layout

```text
docker-compose.yml   the development MySQL
backend/
  app/
    main.py config.py db.py models.py deps.py errors.py security.py audit.py jobs.py cli.py
    auth/       sign-in, tablet registration and PIN unlock, two-step sign-in
    menu/       public menu, sold-out switches, owner menu management, photos
    orders/     pricing.py (pure), state_machine.py (the only code that changes order status),
                counter and online orders, the board, the tracking page, order IDs
    payments/   gateway.py (the swappable gateway boundary and FakePay), webhook, lost-payment
                check, expiry
    shop/       opening hours, pause switch, business date
    staff/      staff accounts and PINs
  alembic/      database migrations
  tests/        pricing, order life cycle, counter and online orders, sign-in, menu
frontend/
  src/
    api/        fetch client, generated API types, data hooks
    areas/      customer/, staff/, admin/: one lazily loaded section each
    components/ shared pieces
    locales/    en.json, ms.json
  scripts/      check-i18n.mjs
```

### Rules the code keeps

1. The server calculates every price. The browser sends item IDs and quantities only.
2. An online order exists before payment starts, and only the gateway's signed message or a
   server-side check proves it was paid. The customer's return from the payment page proves nothing.
3. `orders/state_machine.py` is the only code that changes an order's status.
4. Order lines keep their own names and prices, so menu edits never change past orders.
5. Nothing with history is deleted: items, staff and orders are deactivated instead.
6. Money is a whole number of sen everywhere. Times are stored in UTC, plus a `business_date` in shop
   time.
