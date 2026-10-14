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
- [Test credentials](#test-credentials)
- [Installation](#installation)
- [Getting around: customer, staff and owner](#getting-around-customer-staff-and-owner)
- [Payments](#payments)
- [Running a real shop](#running-a-real-shop)
- [Tests and checks](#tests-and-checks)
- [Troubleshooting](#troubleshooting)
- [Code layout](#code-layout)

## What works today

Release 1, roadmap steps 1–5, and most of step 6:

| Step | What works |
| --- | --- |
| 1. Foundations | Database migrations, owner and staff accounts, server-side sessions in httpOnly cookies, owner two-step sign-in (authenticator app), lockout and rate limits, protection against cross-site requests, audit log, JSON logging |
| 2. Menu | Categories, items, reusable option groups ("Size: choose 1", "Add-ons: up to 3"), photo upload, sold-out and hidden switches. Menu content is entered once, in English; the app's own buttons and messages switch between English and Bahasa Malaysia |
| 3. Counter and kitchen | Server-side pricing, the order life cycle (New → Preparing → Ready → Collected, or Cancelled), counter orders paid by cash, QR or card, the staff board with a new-order chime and a 5-second undo, cancelling with a required refund decision, order search, sold-out page, the shop tablet with PIN unlock, the nightly day close |
| 4. Online ordering | Cart kept on the customer's phone, options and notes per item, a one-screen checkout, prepaid orders through the payment gateway, a private tracking page that updates itself, pay again or cancel while unpaid, order again, recent orders with their live status, the pause switch and opening hours |
| 5. Owner tools | **Today**: sales, orders, average order and online share, live order counts, top items, a 14-day sales chart, and a **Needs attention** panel (paid but cancelled, paid twice, ready for over 30 minutes, closed automatically, payment amount mismatch). **Orders**: every order with filters and search, refunds of a whole order or of one duplicate payment. **Reports**: sales by day, week or month and by hour, items sold including unsold ones, online vs counter, payment methods for checking the cash drawer, cancellations and refunds, CSV export for the accountant. **Audit log**: who changed prices, refunds, staff and settings |
| 6. Hardening | A production setup for one server: Docker Compose with Caddy for HTTPS. Nightly backups of the database and photos, each one proved by restoring it into a scratch database, with an optional copy off the server and a restore command. A failed or late backup shows under **Needs attention**. The API refuses to start with unsafe settings. A counter-only mode for when there's no payment gateway yet. The staff screens install as an app on the shop tablet and keep its screen on |

Recent changes:

- **Checkout asks for no name, and the phone number is optional.** If a phone number is given it
  must be a valid Malaysian number, and it is read back ("We'll use +60 12-345 6789") to catch typos.
- **Every order has a permanent order ID**, such as `PM4WS7`, as well as the 3-digit number called
  out at the counter. The number restarts every day; the ID never repeats. Customers see the ID on
  their tracking page; staff see it on the board and can search by it.
- **Menu content is English only.** The owner no longer fills in Bahasa Malaysia names and
  descriptions. The EN / BM switch still translates the app's own text.
- **"Your recent orders" shows each order's status** on the customer menu page: Awaiting payment,
  Received, Preparing, Ready, Done, Payment failed or Cancelled, updated while the order is in progress.

Next: the pilot. Rent the server and point a domain at it ([Running a real shop](#running-a-real-shop)),
run a week counter-only (`PAYMENT_GATEWAY=none`), then add a real payment gateway and switch on
online ordering. There is no error tracker for now: errors go to the JSON logs. After that, Release 2:
shift roster, clock-in, timesheets and optional customer accounts.

## Test credentials

For a local demo set up with the commands in [Installation](#installation). Sign in at
<http://localhost:5173/login>.

| Role | Sign in with | Password | Tablet PIN |
| --- | --- | --- | --- |
| Owner | `owner@example.com` (or username `owner`) | `ownerpassword1` | none |
| Staff: Aina | `aina` | `staffpassword1` | `1111` |
| Staff: Farid | `farid` | `staffpassword1` | `2222` |

- Everyone lands on the **Order Queue** in the staff console at `/staff`. The owner also sees the
  **Management** pages in the sidebar. Old `/admin/...` links still work and open the matching page.
- Staff PINs only work on a browser registered as the shop tablet
  (owner: **Settings → Shop tablet → Register this device as the shop tablet**). Anywhere else, staff
  sign in with their username and password.
- Customers need no account: open <http://localhost:5173/>.
- Five wrong passwords or PINs lock that account for 15 minutes.

These are test passwords for a development machine only. Never use them on a real shop: set the owner's
own password at setup (leave out `--admin-password` to be asked for one), and don't run `seed-demo`.

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

Create the shop and the owner account. For a local demo, this uses the test password from
[Test credentials](#test-credentials):

```sh
uv run python -m app.cli setup --shop "Kedai Demo" --admin-email owner@example.com --admin-name "Shop Owner" --admin-password ownerpassword1
```

For a real shop, leave out `--admin-password` and you are asked for one (10 characters or more).

Optionally, load a demo menu and the two test staff members, Aina and Farid:

```sh
uv run python -m app.cli seed-demo
```

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
| `PAYMENT_GATEWAY` | `fake` | Which payment gateway to use: `fake`, or `none` for counter-only (see [Payments](#payments)) |
| `GATEWAY_WEBHOOK_SECRET` | a dev value | The secret the gateway signs its messages with |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `BEHIND_PROXY` | `false` | Set `true` behind Caddy, so rate limits see the real client address |
| `BACKUP_STATUS_FILE` | unset | The backup's status file. When set, a failed or late backup shows under **Needs attention** |

## Getting around: customer, staff and owner

All three use the same address. What you see depends on the page and on who is signed in.

| Who | Start at | What they do there |
| --- | --- | --- |
| Customer | <http://localhost:5173/> | Browse the menu, add to cart, check out and pay, follow the order |
| Staff | <http://localhost:5173/staff> | Run the order queue, take counter orders, search orders, mark items sold out |
| Owner | <http://localhost:5173/staff> | Everything staff do, plus the **Management** pages: sales dashboard, sales history, sales report, staff and roles, audit log, settings |

Staff and the owner share one console with a sidebar: **Operations** for everyone, **Management** for
the owner only. Signing in happens at <http://localhost:5173/login>. Going to `/staff` while signed
out sends you there. Old `/admin/...` bookmarks redirect to the matching console page.

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

1. The tablet shows the order queue, locked: orders are visible, but nothing can be changed.
2. Tap **Tap to unlock**, tap your name, enter your PIN, then **OK**.
3. Work. Your name stays at the top right so everyone can see who is signed in.
4. Tap **Lock** at the bottom of the sidebar when you step away. The tablet also locks itself after
   5 minutes without a touch.

The **Operations** pages in the sidebar (an icon rail on a tablet, a menu button on a phone):

| Page | What it does |
| --- | --- |
| **Order Queue** | Numbers at the top: open orders, average prep time, orders running late, orders today against the same day last week. Then three columns: New, Preparing, Ready for pickup. **Start Cooking** moves a new ticket on and marks you as the one who took it; **Take** claims it without starting. Preparing tickets show a progress bar against the usual prep time and turn red when late; **Mark Ready**, then **Hand Over** (with a 5-second undo). New online orders chime and flash until someone taps them. Tap a ticket for its full page |
| **Order detail** | Items, the customer's note, pickup details, a timeline of who did what and when, payments, other moves, **Cancel order**, and (owner) **Record refund** |
| **Add Order** | Pick items (search or filter by category), build the counter ticket, choose how they paid, then **Send To Kitchen**: cash shows the change to give, QR and card ask you to confirm the payment went through |
| **Search** | Find an order by its number (`42`), order ID (`PM4WS7`), phone number or name. Staff see the last 7 days |
| **Menu** | Switch off anything that has run out, items and options alike. Everything switches back on automatically after closing |

The **Online orders** switch at the bottom of the sidebar pauses new online orders during a rush.

### Owner

Sign in at `/login` with the owner email and password. The owner uses every **Operations** page
above; on **Menu** they also edit items (photos, prices, option groups, categories, order of
display), hide items from the customer menu, and see units sold in the last 7 days. The
**Management** pages:

| Page | What it does |
| --- | --- |
| **Sales Dashboard** | Today's net sales, orders, average order and cancellations against the same day last week; sales by hour; top items; what is happening right now, with the pause switch; and **Needs attention**, which lists anything the owner must act on and is empty on a good day. Click an entry to open the order |
| **Sales History** | Pick a day, a month or a date range. Gross sales, refunds and net sales against the previous period, sales by hour or by day, payment methods, then every order in the period with filters (status, payment, channel, who keyed it in) and search. **Download CSV** gives one row per order for the accountant |
| **Sales Report** | Pick a day, a month or a date range. **By day**: orders, gross, refunds, net, each payment method and the peak hour. **By item** (unsold items included), **Online vs counter**, and **Cancellations and refunds** |
| **Staff & Roles** | Add people, edit their details and role, set their tablet PIN, reset passwords, deactivate leavers (their history is kept) |
| **Audit Log** | Who changed what and when: prices, refunds, cancellations of paid orders, staff changes, settings, owner sign-ins. Filter by date or action. Nobody can edit or delete entries |
| **Settings** | Shop name and opening hours, usual prep time, pausing online orders, registering the shop tablet, two-step sign-in, changing your password |

**How sales are counted:** by business day (a day runs from 4 am to 4 am, so a late-night sale counts
towards the evening before). **Gross** is money taken on that day's orders that were not cancelled,
**Refunds** is money given back on them, and **Net** is what the shop kept. The payment-methods
table in Sales History is different on purpose: it shows money that actually moved in the period,
including payments for orders later cancelled, so the cash row can be checked against the drawer.

**On the shared shop tablet** the Management pages never open, even for the owner unlocked by
PIN: use your own phone or computer. **Log Out** is at the bottom of the sidebar; on your own device
it asks first and returns to the sign-in page, on the shop tablet **Lock** leaves the locked queue up
for staff.

**Setting up the shop tablet (once):**

1. On the tablet, open `/login` and sign in as the owner.
2. Go to **Settings → Shop tablet → Register this device as the shop tablet**.
3. Tap **Lock** at the bottom of the sidebar. The tablet now shows the locked queue, and staff unlock
   it with their PINs. To undo this later, sign in as the owner on the tablet, open any Management
   page and tap **Unregister this tablet**.
4. Install the staff app: tap the **download icon** at the top of the board (Chrome or Edge), or
   **Add to Home Screen** in the browser menu (Safari, Samsung Internet). It opens full screen
   straight onto the board, and the screen stays on while it is open. This needs HTTPS, so it works
   on the real server and on `localhost`, but not on a LAN address such as `192.168.x.x`.

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

`PAYMENT_GATEWAY=none` runs the shop **counter-only**: customers can browse the menu and are asked
to order at the counter, the online-orders switches are hidden, and the payment jobs do nothing. Use
it on the real server until a merchant account exists.

Adding a real gateway (Billplz, HitPay, ToyyibPay or another) means writing one class in
[backend/app/payments/gateway.py](backend/app/payments/gateway.py) with three methods: `create_bill`,
`verify_webhook` and `get_status`.

Refunds of online payments are done by the owner in the gateway's own dashboard, then recorded in
Kaunter. Staff cannot hand back money that was paid online; when they cancel such an order it is
marked "paid but cancelled" for the owner.

## Running a real shop

Everything runs on one Linux server (VPS) with Docker: MySQL, the API, the nightly backup, and
Caddy, which serves the app and gets the HTTPS certificate by itself. The files are in
[deploy/](deploy/).

### What you need

- A VPS with 1–2 GB of memory and Docker installed (any provider; a Singapore region is closest).
- A domain or subdomain, such as `order.kedaiayam.my`, with a DNS **A record** pointing at the
  server's IP address.
- Ports 80 and 443 open to the internet. Nothing else needs to be open apart from SSH.

### First install

On the server:

```sh
git clone <repository-url> kaunter
cd kaunter/deploy
cp .env.example .env
nano .env                        # DOMAIN, ACME_EMAIL, and two passwords from: openssl rand -hex 24
docker compose up -d --build     # builds and starts everything; the first build takes a few minutes
docker compose exec api python -m app.cli setup --shop "Kedai Ayam" --admin-email you@example.com --admin-name "Your Name"
```

The last command asks for the owner's password. Do not run `seed-demo` on a real shop. Then open
`https://<your domain>/login`, sign in as the owner, turn on two-step sign-in in **Settings**, and set
up the menu, the staff and the tablet.

The API refuses to start if a setting is unsafe for a real shop (no HTTPS, the fake gateway, a weak
webhook secret) and says which one in `docker compose logs api`.

### Updating

```sh
cd kaunter && git pull
cd deploy && docker compose up -d --build
```

Database changes are applied automatically when the API starts. Updates restart the API for a few
seconds, so do them outside opening hours.

### Backups

Every night at 04:30 shop time (after the 4 am day close), the `backup` container:

1. dumps the database and archives the photos into the `backups` volume,
2. loads the dump into a scratch database and checks it has the same tables, the same schema
   version, and every order and payment, so a backup that would not restore is caught that night,
3. copies the backup off the server, if `RCLONE_REMOTE` is set,
4. deletes backups older than 14 days (`BACKUP_KEEP_DAYS`).

If any step fails, or no good backup has run for 30 hours, the owner sees it under **Needs
attention** on **Today**.

**Copy backups off the server.** A backup on the same server doesn't help if the server itself is
lost. Make an [rclone](https://rclone.org/) remote with `rclone config` on any computer (Backblaze B2
and Google Drive both work), copy its `rclone.conf` into `deploy/rclone/`, set for example
`RCLONE_REMOTE=b2:kedai-backups/kaunter` in `deploy/.env`, and run `docker compose up -d`. Old copies
stay on the remote until you set a lifecycle rule there.

| Task | Command (in `deploy/`) |
| --- | --- |
| Back up now | `docker compose exec backup /scripts/backup.sh` |
| See the last result | `docker compose exec backup cat /backups/status.json` |
| List backups | `docker compose exec backup ls /backups/db` |
| Check a backup restores | `docker compose exec backup /scripts/restore-check.sh /backups/db/<file>` |

**Restoring** replaces all current data with a backup. Stop the API first, so no orders are taken
mid-restore:

```sh
docker compose stop api
docker compose run --rm --no-deps backup /scripts/restore.sh kaunter_2026-10-12_0430 --yes
docker compose start api
```

`--no-deps` matters: without it, Compose starts the API again before the restore. The script also
refuses to run while the API is connected. To restore onto a new server, do the first install, copy
the backup files into the `backups` volume (or fetch them with rclone), then restore as above.

### Logs

There is no error tracker, so the logs are the record. Each container keeps about 200 MB of logs.

```sh
docker compose logs api --since 1h                 # requests and errors, one JSON line each
docker compose logs api | grep '"level": "ERROR"'  # just the errors
docker compose logs backup                         # each night's backup
```

Every error response carries an `X-Request-Id` header; search the logs for it to find what happened.

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
| The staff app has no install button | Chrome offers it only over HTTPS (or `localhost`), and not once installed. Use **Add to Home Screen** in the browser menu instead |
| Start again with an empty database | `docker compose down -v`, then repeat steps 2 and 3. This deletes all data |

## Code layout

```text
docker-compose.yml   the development MySQL
deploy/              production: docker-compose.yml, Caddyfile, .env.example, backup/ scripts
backend/
  app/
    main.py config.py db.py models.py deps.py errors.py security.py audit.py jobs.py cli.py
    auth/       sign-in, tablet registration and PIN unlock, two-step sign-in
    menu/       public menu, sold-out switches, owner menu management, photos
    orders/     pricing.py (pure), state_machine.py (the only code that changes order status),
                counter and online orders, the board, the tracking page, order IDs
    payments/   gateway.py (the swappable gateway boundary and FakePay), webhook, lost-payment
                check, expiry
    reports/    the owner's sales dashboard, needs attention, reports, units sold, CSV export, audit log
    shop/       opening hours, pause switch, business date
    staff/      staff accounts and PINs
  alembic/      database migrations
  tests/        pricing, order life cycle, counter and online orders, sign-in, menu, reports
frontend/
  src/
    api/        fetch client, generated API types, data hooks
    areas/      customer/ and staff/ (the one staff console; console/ holds its shell and shared pieces),
                each lazily loaded
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
