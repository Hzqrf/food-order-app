# Staff Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `/staff` and `/admin` areas with one orange Staff Console that follows the user's Claude Design. Add order claiming, queue metrics and richer sales figures.

**Architecture:**
- **Frontend:** a new `ConsoleLayout` under `/staff`. It holds the sidebar nav, the tablet lock context, owner-route gating and redirects. It is built from a few shared console components on a Mantine theme that encodes the design's tokens. Existing pages move into it screen by screen.
- **Backend:** a small migration (`claimed_by_user_id`, `claimed_at`, `preparing_at`), a claim endpoint, a queue-metrics endpoint, and additions to the dashboard, report and menu endpoints.

**Tech Stack:**
- FastAPI, SQLAlchemy 2, Alembic, MySQL 8, pytest
- React 19, Vite, Mantine 9, TanStack Query 5, react-router 7, i18next
- `@fontsource-variable/inter`

**Spec:** `docs/superpowers/specs/2026-10-14-staff-console-redesign-design.md`. Read it alongside this plan; screen-level layout details live there.

## Global Constraints

- **Brand orange:** override Mantine's `orange` palette with `["#fff7ed","#ffedd5","#fed7aa","#fdba74","#fb923c","#f97316","#ea580c","#c2410c","#9a3412","#7c2d12"]`, `primaryColor: "orange"`, `primaryShade: 7`. Accent = shade 6 `#ea580c`.
- **Design tokens,** copied verbatim from the spec:
  - page background `#F4F5F7`
  - card: white, radius 16, shadow `0 1px 2px rgba(16,24,40,.05)`
  - inner tile: `#FBFBFB`, radius 12, inset `0 0 0 1px #EAECF0`
  - secondary button: `#F1F1F1` with `#48484A` text
  - dark button: `#1D1D1F`
  - text: `#1D1D1F` / `#48484A` / `#6B6B6B`, page subtitle `#667085`
  - page title 30/38 semibold, letter-spacing −0.02em
  - section title 16/24 semibold
- Hex colours live only in `frontend/src/theme.ts` and `frontend/src/areas/staff/console/tokens.ts`. Pages use theme colours and console components.
- **Font:** `'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Set it in the theme, and import `@fontsource-variable/inter` only from `ConsoleLayout.tsx`, so customer pages fall back to the system font.
- **i18n:** every new string is in both `frontend/src/locales/en.json` and `ms.json`, with new keys under `console.*`. `npm run check:i18n` must pass.
- **Money:** always format with `formatSen` (RM). Never show `$`.
- **Server:** the server enforces all permissions. Frontend gating is a convenience only.
- **Tests:** no new frontend test runner. Frontend tasks verify with `npm run typecheck`, `npm run check:i18n`, `npm run build` and a manual browser check.
- **Backend tests:** need MySQL test DB `docker compose up -d mysql` (port 3307). Run with `cd backend && uv run pytest`.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Business-day boundary:** an order placed at 02:00 shop time belongs to the previous business day (`day_close_hour` = 4). Queue metrics must count it there. Test: `test_metrics_use_business_day_not_calendar_day` (Task 3).
2. **Empty data:** with no finished orders, average prep time is `null` (shown as `—`), not 0 and not a division error. Test: `test_metrics_with_no_orders` (Task 3).
3. **Claim on a finished order:** claiming a ready, completed or cancelled order returns 409 `not_claimable`, and a stale version returns 409 `version_conflict`. Test: `test_claim_rejected_when_not_claimable_or_stale` (Task 2).
4. **Refunds on cancelled orders:** these must not lower Net, and a full refund on a completed order must show as gross = refunds, net = 0. Test: `test_totals_gross_refunds_net` (Task 4).
5. **Owner on the shared tablet:** an owner unlocked by PIN on a registered tablet who opens `/staff/dashboard` directly sees the "use your own device" panel. They are not bounced in a redirect loop. Manual check in Task 1, step 6.

---

## File Structure

**Backend:**
- `backend/alembic/versions/20261014_5c1e7a2b9d40_order_claim_and_preparing_at.py` (new): columns plus the `backfill_preparing_at(bind)` function.
- `backend/app/models.py`: the `Order` columns, `claimed_by` relationship, and explicit `foreign_keys` on `created_by`.
- `backend/app/orders/state_machine.py`: `preparing_at` timestamp, auto-claim on placed→preparing.
- `backend/app/orders/service.py`: `claim()`, summary fields, eager-loading `claimed_by`.
- `backend/app/orders/metrics.py` (new): `queue_metrics()`.
- `backend/app/orders/schemas.py`: `ClaimIn`, `QueueMetrics`, new `OrderSummary` fields.
- `backend/app/orders/staff_router.py`: `POST /{id}/claim` and `GET /metrics`.
- `backend/app/reports/queries.py` and `schemas.py`: Totals money fields, dashboard and report additions, `units_sold()`.
- `backend/app/menu/admin_router.py`: `GET /admin/menu/units-sold`.
- Tests: `backend/tests/test_claim.py` (new), `test_metrics.py` (new), `test_reports.py` (extend).

**Frontend** (new console code in `frontend/src/areas/staff/console/`):
- `theme.ts` (in `src/`, new): the Mantine theme. `main.tsx` imports it.
- `tokens.ts`: design hex values used by the console components.
- `ConsoleLayout.tsx`: the shell (AppShell, sidebar, rail, drawer, header, footer), the lock context provider, the PIN modal and idle lock, the logout modal.
- `lock.tsx`: `LockContext`, `useStaff()` (same API as today's `StaffLayout` export).
- `nav.ts`: the `NAV` items list.
- `OwnerRoute.tsx`: owner gating and the tablet panel.
- `legacy.ts`: the `ADMIN_REDIRECTS` map and `mapLegacyPath()`.
- `PageHeader.tsx`, `SectionCard.tsx`, `MetricCard.tsx`, `StatusLabel.tsx`, `RankedBars.tsx`, `PeriodPicker.tsx`, `ConfirmLogoutModal.tsx`, `toast.ts`.

**Pages:**
- `frontend/src/areas/staff/pages/`: BoardPage (rewritten), OrderPage (new), TakeOrderPage, SearchPage, MenuPage (new), DashboardPage, SalesHistoryPage, SalesReportPage, TeamPage, AuditPage, SettingsPage. The owner pages move from `areas/admin/pages`.
- Removed at the end: `areas/staff/StaffLayout.tsx`, `areas/admin/AdminLayout.tsx`, `areas/staff/components/OrderDetailDrawer.tsx`, `areas/staff/pages/SoldOutPage.tsx`, and the `areas/admin/pages/*` files that moved.

---

### Task 1: Theme, console shell, routes and redirects

**Files:**
- Create: `frontend/src/theme.ts`
- Create in `frontend/src/areas/staff/console/`: `tokens.ts`, `lock.tsx`, `nav.ts`, `legacy.ts`, `OwnerRoute.tsx`, `ConsoleLayout.tsx`, `ConfirmLogoutModal.tsx`, `PageHeader.tsx`, `SectionCard.tsx`, `MetricCard.tsx`, `StatusLabel.tsx`, `toast.ts`
- Modify:
  - `frontend/src/main.tsx` (use `theme`)
  - `frontend/src/routes.tsx`
  - `frontend/src/areas/staff/pages/BoardPage.tsx` (import `useStaff` from `../console/lock`)
  - `frontend/src/areas/staff/pages/LoginPage.tsx` (land on `/staff`; map `next`)
  - `frontend/package.json` (add `@fontsource-variable/inter`)
  - `frontend/src/locales/en.json`, `ms.json`

**Interfaces:**
- Produces:
  - `theme: MantineThemeOverride` from `src/theme.ts`.
  - `useStaff(): { locked: boolean; ensureUnlocked: () => boolean }` from `console/lock.tsx`.
  - `NAV: { to: string; label: string; icon: TablerIcon; section: "operations" | "management"; end?: boolean; badge?: "openOrders" }[]`.
  - `ADMIN_REDIRECTS: Record<string, string>` and `mapLegacyPath(path: string): string` from `console/legacy.ts`.
  - `OwnerRoute({ children })`.
  - `PageHeader({ title, subtitle?, actions?, back? }: { title: string; subtitle?: string; actions?: ReactNode; back?: () => void })`.
  - `SectionCard({ title?, actions?, padded = true, children })`.
  - `MetricCard({ label, value, delta?, direction?, deltaLabel? }: { label: string; value: string | null; delta?: string; direction?: "up" | "down"; deltaLabel?: string })`. A `null` value renders `—`.
  - `StatusLabel({ kind, value }: { kind: "status" | "availability" | "role" | "payment" | "count"; value: string })`.
  - `toast(message: string, kind?: "success" | "error"): void`. It calls `notifications.show` with `position: "bottom-right"` and dark styling.

- [ ] **Step 1: Install the font**

Run: `cd frontend && npm install @fontsource-variable/inter`
Expected: added to `dependencies`.

- [ ] **Step 2: Theme**

`src/theme.ts` exports `theme = createTheme({...})`:
- `colors.orange`: the Global Constraints palette.
- `primaryColor: "orange"`, `primaryShade: 7`, `defaultRadius: "md"`.
- `fontFamily`: the Global Constraints value.
- `headings.fontWeight: "600"`.
- `components` defaults:
  - `Button`: radius 6, fw 600.
  - `Card` and `Paper`: radius 16 with the card shadow.
  - `Badge`: radius `xl`, tt `none`.

`main.tsx` passes `theme`.

- [ ] **Step 3: Lock context, nav, legacy map, owner route**

- **`lock.tsx`:** move `Ctx` and `useStaff` out of `StaffLayout.tsx` unchanged; `StaffLayout` imports them from here until Task 10.
- **`nav.ts`:**
  - Operations: `/staff` (Order Queue, badge `openOrders`, `end: true`), `/staff/take` (Add Order), `/staff/search` (Search), `/staff/menu` (Menu).
  - Management: `/staff/dashboard`, `/staff/sales`, `/staff/reports`, `/staff/team`, `/staff/audit`, `/staff/settings`.
- **`legacy.ts`:**
  - `ADMIN_REDIRECTS` has every pair from spec §1 "Redirects", including `/staff/sold-out` → `/staff/menu`.
  - `mapLegacyPath` returns the mapped path, or the input unchanged.
- **`OwnerRoute`:**
  - Waiting for the session: show a Loader.
  - No user: return `null`. This is a locked tablet, and `ConsoleLayout` already shows the PIN pad on every route except the queue.
  - `user.role !== "admin"`: `<Navigate to="/staff" replace />`.
  - `session.device_registered`: render a `SectionCard` with `console.ownerOnTablet.title` / `.body`.
  - Otherwise: render children.

- [ ] **Step 4: `ConsoleLayout`**

Port everything from `StaffLayout.tsx`:
- online switch, install button, LanguageSwitch
- PIN modal, `IDLE_LOCK_MS` idle lock, wake lock
- locked-board rule: on a locked tablet, only `/staff` renders the outlet; other routes render `PinPad`

Then lay it out as in spec §1 "Shell":
- **`AppShell`:** `navbar` width `{ sm: 88, lg: 264 }`, collapsed on mobile behind a Burger. Show labels and section headings only at `lg` and up (`useMediaQuery`); below that, icon-only rows with the badge floating on the icon.
- **Nav rows:**
  - Current row: filled `orange.7` with white text.
  - Hover: `#F4F5F7`.
  - Section labels: 11px uppercase, `letter-spacing: .09em`.
  - Management section rendered only when `user?.role === "admin" && !session.device_registered`.
- **Header:** the branch name (`useShop().data?.name`) on the left; the user's name and a role `Badge` (`console.role.owner` / `console.role.staff`) on the right.
- **Badge:** the open count is `useBoard().data?.length`.
- **Footer:** language switch, online-orders switch, install button, Log Out (red text). Log Out opens `ConfirmLogoutModal`, which counts preparing and ready orders from `useBoard()`.
- **Main:** background `#F4F5F7`, padding `28px 32px 56px`.
- Import `@fontsource-variable/inter` at the top of this file.

- [ ] **Step 5: Routes**

`routes.tsx`, inside the `/staff` route (`RequireRole role="staff" allowDevice`), element `ConsoleLayout`:
- Operations children:
  - index → BoardPage
  - `take` → TakeOrderPage
  - `search` → SearchPage
  - `menu` → SoldOutPage (temporary until Task 7)
  - `sold-out` → `<Navigate to="/staff/menu" replace />`
- Management children, each wrapped in `<OwnerRoute>`:
  - `dashboard` → admin TodayPage
  - `sales` → admin OrdersPage
  - `reports` → ReportsPage
  - `team` → StaffPage
  - `audit` → AuditPage
  - `settings` → SettingsPage

Replace the whole `/admin` tree with `{ path: "/admin/*", element: <LegacyAdminRedirect /> }`. It reads `location.pathname` and navigates to `mapLegacyPath(path)` with `replace`; an unknown subpath goes to `/staff/dashboard`.

`LoginPage`:
- The target is always `/staff`.
- A `next` value is passed through `mapLegacyPath`.
- The old `/admin` checks go.

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: all pass.

Manual check (dev server `npm run dev`, backend running):
- Owner login lands on `/staff` with both nav sections.
- `/admin/reports` lands on `/staff/reports`.
- Staff login shows Operations only, and `/staff/dashboard` sends them back to `/staff`.
- Widths 1440 / 1024 / 390 show full sidebar / icon rail / burger.
- **Review Focus #5:** on a registered tablet, unlock as owner by PIN, open `/staff/dashboard`. Expected: the panel, no redirect loop.
- Log Out shows the confirm dialog with counts.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat(console): orange theme, console shell, routes and admin redirects"
```

---

### Task 2: Order claim and `preparing_at` (backend)

**Files:**
- Create: `backend/alembic/versions/20261014_5c1e7a2b9d40_order_claim_and_preparing_at.py`
- Modify:
  - `backend/app/models.py` (`Order`)
  - `backend/app/orders/state_machine.py`
  - `backend/app/orders/service.py` (`summary`, `_LOAD`, new `claim`)
  - `backend/app/orders/schemas.py`
  - `backend/app/orders/staff_router.py`
- Test: `backend/tests/test_claim.py`

**Interfaces:**
- Produces:
  - `Order.claimed_by_user_id: int | None`, `Order.claimed_at: datetime | None`, `Order.preparing_at: datetime | None`, `Order.claimed_by: User | None`.
  - `schemas.ClaimIn(version: int)`.
  - `OrderSummary` gains `claimed_by_name: str | None`, `claimed_at: datetime | None`, `preparing_at: datetime | None`.
  - `service.claim(db, order_id: int, user: User, body: ClaimIn, ip: str) -> Order`.
  - `POST /api/v1/staff/orders/{order_id}/claim` returns `OrderSummary`.
  - Migration function `backfill_preparing_at(bind: Connection) -> None`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_claim.py`

Reuse `counter_order` and the `tender` helper pattern from `test_orders.py`. Add a second staff user with `_user(db, "staff", "badri", pin="5678")` from conftest.

```python
def test_claim_sets_taker_and_is_idempotent(staff_client, menu):
    o = counter_order(staff_client, [tender(menu)]).json()
    r = staff_client.post(f"{API}/staff/orders/{o['id']}/claim", json={"version": 1})
    assert r.status_code == 200
    assert r.json()["claimed_by_name"] == "Aina" and r.json()["status"] == "placed"
    v = r.json()["version"]
    again = staff_client.post(f"{API}/staff/orders/{o['id']}/claim", json={"version": v})
    assert again.status_code == 200 and again.json()["version"] == v  # no change, no bump

def test_start_cooking_claims_unclaimed_order_and_sets_preparing_at(staff_client, menu):
    o = counter_order(staff_client, [tender(menu)]).json()
    r = staff_client.post(f"{API}/staff/orders/{o['id']}/transition", json={"to": "preparing", "version": 1}).json()
    assert r["claimed_by_name"] == "Aina" and r["preparing_at"] is not None

def test_takeover_is_allowed_and_audited(client, staff, db, menu):
    # Aina claims, then Badri takes over.
    # Expect claimed_by_name == "Badri" and one AuditLog with action == "order_claim_takeover",
    # before == {"claimed_by_user_id": staff.id}, after == {"claimed_by_user_id": badri.id}.

def test_claim_rejected_when_not_claimable_or_stale(staff_client, menu):
    # A stale version gives 409 version_conflict.
    # After moving the order to "ready", a claim gives 409 with error code "not_claimable".

def test_locked_tablet_cannot_claim(client, menu, ...):
    # With no signed-in user, the claim returns 401 not_authenticated
    # (same as a transition without a session).

def test_backfill_preparing_at(staff_client, menu, db):
    # Move an order to preparing, then set orders.preparing_at = NULL via db.execute(update(Order)...).
    # Load the migration module with importlib.util.spec_from_file_location and call
    # backfill_preparing_at(conn) with engine.begin() as conn.
    # Assert preparing_at equals the created_at of its 'preparing' OrderStatusEvent.
```

Write the three placeholder tests above as full code, following the comments.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_claim.py -v`
Expected: FAIL (404 on `/claim`, missing keys).

- [ ] **Step 3: Model and migration**

**Model:**
- `Order` gets the three columns.
- `claimed_by = relationship(foreign_keys=[claimed_by_user_id])`.
- Change `created_by` to `relationship(foreign_keys=[created_by_user_id])`, since there are now two FKs to `users`.

**Migration:**
- revision `5c1e7a2b9d40`, down_revision `9423d9f40623`.
- `upgrade()` adds `claimed_by_user_id` (BigInteger, FK `users.id`, nullable), `claimed_at` and `preparing_at` (DateTime(6), nullable, matching `UtcDateTime`), then calls `backfill_preparing_at(op.get_bind())`.
- `downgrade()` drops them.
- Backfill SQL:

```sql
UPDATE orders o JOIN (SELECT order_id, MIN(created_at) AS first_at FROM order_status_events
  WHERE to_status = 'preparing' GROUP BY order_id) e ON e.order_id = o.id
SET o.preparing_at = e.first_at WHERE o.preparing_at IS NULL
```

- [ ] **Step 4: State machine and service**

**`state_machine.py`:**
- Add `PREPARING: "preparing_at"` to `_TIMESTAMP`.
- In `transition()`, when `to_status == PREPARING and order.claimed_by_user_id is None and actor_user_id`, also set `claimed_by_user_id=actor_user_id, claimed_at=utcnow()` in `values`.

**`service.claim()`:**
- Load with `_locked`.
- Status must be `placed` or `preparing`, else `AppError("not_claimable", "This order can no longer be taken.", 409)`.
- Same user already claimed: return the order unchanged.
- Version check and UPDATE matched on `(id, version)`, bumping `version`, the same way as `sm.transition`; rowcount ≠ 1 raises `version_conflict`.
- If someone else held it: `audit(db, user.id, "order_claim_takeover", "order", order.id, {"claimed_by_user_id": old}, {"claimed_by_user_id": user.id}, ip)`.
- Flush and refresh.

**Other changes:**
- Add `selectinload(Order.claimed_by)` to `_LOAD`.
- `summary()` adds the three fields.
- Router: `@router.post("/{order_id}/claim", response_model=schemas.OrderSummary)` with `StaffUser`, matching `transition`.

- [ ] **Step 5: Run the tests**

Run: `cd backend && uv run pytest tests/test_claim.py tests/test_orders.py tests/test_state_machine.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(orders): claim orders and record when cooking started"
```

---

### Task 3: Queue metrics (backend)

**Files:**
- Create: `backend/app/orders/metrics.py`
- Modify: `backend/app/orders/schemas.py`, `backend/app/orders/staff_router.py`
- Test: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: `Order.preparing_at` (Task 2), `business_date(branch, now)` from `app.shop.service`, `SALES_STATUSES` from `app.reports.queries`.
- Produces:
  - `schemas.QueueMetrics(open_orders: int, avg_prep_minutes: float | None, avg_prep_minutes_last_week: float | None, running_late: int, orders_today: int, orders_same_day_last_week: int)`.
  - `metrics.queue_metrics(db, branch, now: datetime | None = None) -> QueueMetrics`.
  - `GET /api/v1/staff/orders/metrics`, with `BoardAuth`. Declare it **before** `/{order_id}`.

**Definitions** (today = `business_date(branch, now)`):
- **`open_orders`:** status in `ACTIVE`.
- **`avg_prep_minutes`:** the mean of `(ready_at − preparing_at)` in minutes, rounded to 1 decimal, over orders with `business_date == today` and both timestamps set. `None` when there are none.
- **`avg_prep_minutes_last_week`:** the same for `today − 7 days`.
- **`running_late`:** status in (`placed`, `preparing`) and `placed_at + branch.prep_minutes < now`.
- **`orders_today` / `orders_same_day_last_week`:** count of orders with status in `SALES_STATUSES` on that business date.

- [ ] **Step 1: Write the failing tests**

```python
def test_metrics_counts_and_average(staff_client, menu, db, branch):
    # Make 3 counter orders.
    # Set order A: preparing_at=now-30m, ready_at=now-20m (10 min), status ready.
    # Set order B: preparing_at=now-40m, ready_at=now-20m (20 min), status ready.
    # Order C stays placed with placed_at=now-20m (prep_minutes=15, so late).
    m = staff_client.get(f"{API}/staff/orders/metrics").json()
    assert m["open_orders"] == 3 and m["avg_prep_minutes"] == 15.0
    assert m["running_late"] == 1 and m["orders_today"] == 3
    assert m["avg_prep_minutes_last_week"] is None and m["orders_same_day_last_week"] == 0

def test_metrics_with_no_orders(staff_client, branch):
    m = staff_client.get(f"{API}/staff/orders/metrics").json()
    assert m == {"open_orders": 0, "avg_prep_minutes": None, "avg_prep_minutes_last_week": None,
                 "running_late": 0, "orders_today": 0, "orders_same_day_last_week": 0}

def test_metrics_last_week_comparison(staff_client, menu, db, branch):
    # One order moved to business_date = today-7, with a 30-minute prep.
    # Expect orders_same_day_last_week == 1, avg_prep_minutes_last_week == 30.0, orders_today == 0.

def test_metrics_use_business_day_not_calendar_day(staff_client, menu, db, branch):
    # One order today. Call queue_metrics(db, branch, now=<tomorrow 02:00 Asia/Kuala_Lumpur>) directly.
    # 02:00 is before day_close_hour 4, so it is still today's business day: orders_today == 1.

def test_locked_tablet_can_read_metrics(client, branch):
    # Register a device (as test_auth does) and log out the user.
    # GET /staff/orders/metrics returns 200.
```

Write the three placeholder tests as full code, following the comments.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_metrics.py -v`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement** `metrics.py`, the schema and the route as defined above. Compute the averages in Python from the selected `(preparing_at, ready_at)` pairs; the timestamps are UTC (`UtcDateTime`).

- [ ] **Step 4: Run the tests**

Run: `cd backend && uv run pytest tests/test_metrics.py tests/test_orders.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(orders): queue metrics for the console"
```

---

### Task 4: Sales figures, dashboard and report additions, units sold (backend)

**Files:**
- Modify: `backend/app/reports/schemas.py`, `backend/app/reports/queries.py`, `backend/app/menu/admin_router.py`
- Test: `backend/tests/test_reports.py`

**Interfaces:**
- Produces:
  - `Totals` adds `gross_sen: int`, `refunds_sen: int`, `net_sen: int`.
  - `Dashboard` adds `same_day_last_week: Totals`, `cancelled_today: int`, `hours_today: list[HourRow]`, `hours_same_day_last_week: list[HourRow]`.
  - `Report` adds `previous: Totals`.
  - `PeriodRow` adds `refunds_sen: int`, `methods: dict[str, int]` (net per payment method), `peak_hour: int | None`.
  - `UnitsSoldRow(menu_item_id: int, units: int)`.
  - `queries.units_sold(db, branch, days: int) -> list[UnitsSoldRow]`.
  - `GET /api/v1/admin/menu/units-sold?days=7` (admin; `days` from 1 to 90, default 7).

**Definitions:**
- **Money totals:** over orders with status in `SALES_STATUSES` and `business_date` in range, joined to `payments` with `status == "succeeded"`.
  - `gross_sen` = sum of `charge` amounts.
  - `refunds_sen` = sum of `refund` amounts.
  - `net_sen` = gross − refunds.
  - `sales_sen` is unchanged.
- **`previous`:** `totals()` for the range of equal length ending the day before `date_from`.
- **`PeriodRow.methods`:** net per method, grouped by the order's business date into the period.
- **`peak_hour`:** the shop-time hour with the highest sales in that period (`None` if no sales).
- **`cancelled_today`:** orders with status `cancelled` on today's business date.
- **`units_sold`:** quantity per item over orders with status in `SALES_STATUSES` and `business_date` between `today − (days−1)` and today. Only items with at least one sale.

- [ ] **Step 1: Write the failing tests** in `test_reports.py`

```python
def test_totals_gross_refunds_net(client, staff, admin, menu, branch):
    # A: counter tender, cash 1000, completed, then admin refund (cash).
    # B: counter milo, qr 450.
    # C: counter tender, cancelled with a cash refund.
    t = admin_get_report_today()["totals"]
    assert (t["gross_sen"], t["refunds_sen"], t["net_sen"]) == (1450, 1000, 450)  # C not counted at all

def test_report_previous_period_and_period_methods(client, staff, admin, menu, branch, db):
    # One cash 1000 order and one qr_counter 450 order today.
    # One order moved to yesterday's business_date.
    # Report for today-only: previous.orders == 1; periods[0]["methods"] == {"cash": 1000, "qr_counter": 450}.
    # periods[0]["peak_hour"] == the local hour of the orders' placed_at.

def test_dashboard_last_week_and_cancelled(client, staff, admin, menu, branch, db):
    # One order today, one at today-7, one cancelled today.
    # same_day_last_week.orders == 1, cancelled_today == 1, len(hours_today) == 24.

def test_units_sold_last_7_days(client, staff, admin, menu, branch, db):
    # Tender x2 today, milo x1 at today-8 (outside the window), tender x1 cancelled.
    # GET /admin/menu/units-sold?days=7 == [{"menu_item_id": menu["tender"], "units": 2}].
    # Staff gets 403.
```

Write the four placeholder tests as full code, following the comments. Then update `test_dashboard_counts_only_paid_live_orders`: its `d["today"]` expected dict gains `"gross_sen": 1450, "refunds_sen": 0, "net_sen": 1450`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_reports.py -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the definitions in `queries.py`. Extend `totals()` with one joined payments query. Extend `periods()` from a per-day query of methods, refunds and hour, so there are no per-period round trips. Then `report()`, `dashboard()`, `units_sold()` and the route.

- [ ] **Step 4: Run the whole backend suite**

Run: `cd backend && uv run pytest`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(reports): gross/refunds/net, comparisons, peak hour, units sold"
```

---

### Task 5: Order Queue and Order Detail page

**Files:**
- Modify:
  - `frontend/src/api/schema.d.ts` (regenerated)
  - `frontend/src/api/orders.ts`
  - `frontend/src/areas/staff/pages/BoardPage.tsx` (rewrite)
  - `frontend/src/areas/staff/components/OrderCard.tsx` (rewrite into a design ticket)
  - `frontend/src/routes.tsx`
  - locales
- Create: `frontend/src/areas/staff/pages/OrderPage.tsx`

**Interfaces:**
- Consumes: Task 1 components, the Task 2 claim endpoint and fields, the Task 3 metrics.
- Produces:
  - `useClaim(): UseMutationResult<OrderSummary, Error, { id: number; version: number }>`, which invalidates like the other order mutations.
  - `useQueueMetrics()`: `["queue-metrics"]`, `refetchInterval: 30_000`, `poll: true`.
  - Route `/staff/orders/:id` → `OrderPage`.

- [ ] **Step 1: Regenerate types**

Run: `cd frontend && npm run gen:types`
Expected: `schema.d.ts` has `ClaimIn`, `QueueMetrics`, `claimed_by_name`, `gross_sen`, `UnitsSoldRow`.

- [ ] **Step 2: Hooks** `useClaim` and `useQueueMetrics` in `api/orders.ts`. Add `export type QueueMetrics = S["QueueMetrics"]` to `api/types.ts`.

- [ ] **Step 3: Queue page** (spec §3 "Order Queue")

**Header:**
- `PageHeader` with `console.queue.title` / `.subtitle`.
- Action: "+ Add Order" (filled) → `/staff/take`.

**Metric cards** (4 `MetricCard`s):
- Average prep time: delta = percent change against last week, direction `down` when it is faster.
- Orders today: delta = the difference in count.
- A missing value shows `—`.

**Columns:** three `SectionCard`s with a `StatusLabel kind="count"`.

**Tickets** (inner-tile style):
- **New:**
  - Main button: **Start Cooking**, which transitions to `preparing`.
  - Light button: **Take**, which calls `useClaim`. Hidden once claimed by anyone.
  - Once claimed, show a `Badge` "Taken by {name}".
- **Preparing:**
  - `Progress` value `min(100, minutesSince(preparing_at) / prep_minutes * 100)`, with `prep_minutes` from `useShop()`.
  - Red when over 100%, with "Running late".
  - **Mark Ready** secondary button.
- **Ready:**
  - "Waiting N mins", using the `yellow` colour from 10 minutes.
  - Dark **Hand Over** button, keeping the 5-second Undo.
- **Kept:** `useNewOrderAlert` and the flash CSS, the narrow-screen `SegmentedControl`, and `ensureUnlocked()` before every action.
- **Click:** opening a ticket navigates to `/staff/orders/:id`.
- **Counter-order banner:** when `location.state?.sent` is set (Task 6 passes `{ number, method }`), show the green banner.

**On a 409 from claim or transition:**
1. `await refetch()` the board.
2. Find the order.
3. Call `toast(t("console.queue.alreadyTaken", { name: o.claimed_by_name ?? t("console.someone"), number }), "error")`.

- [ ] **Step 4: Order Detail page** (spec §3 "Order Detail")

- Uses `useOrder(id)` and `PageHeader` with back (`navigate(-1)`, falling back to `/staff`).
- **Left `SectionCard`:**
  - Header: "Order #{n}", `StatusLabel`, and the next-step button (`NEXT_STEP` from `OrderCard.tsx`).
  - Item lines with options, notes and line totals.
  - Customer note tile.
- **Right column:**
  - **Pickup** key-value card: customer, phone, channel, order code, payment method and status, total.
  - **Timeline** card from `events`: label by `to_status`, time `formatTime`, actor.
- **Buttons:** Cancel (`CancelOrderModal`) and Refund (`RefundModal`, admin only), both behind `ensureUnlocked()`.
- **Wiring:** `SearchPage` rows navigate here instead of opening the drawer.

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Manual check:
- Place a counter order, Take it, then Start Cooking on another order and confirm it shows "Taken by".
- The progress bar turns red after the prep time.
- Hand Over, then Undo.
- In two browsers, the second Take shows the "already took" toast with the first person's name.
- On a locked tablet, every button opens the PIN pad.
- Order Detail shows the timeline with names.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(console): order queue with claim and metrics, order detail page"
```

---

### Task 6: Add Order and Search

**Files:**
- Modify: `frontend/src/areas/staff/pages/TakeOrderPage.tsx`, `frontend/src/areas/staff/pages/SearchPage.tsx`, locales

**Interfaces:**
- Consumes: Task 1 components; `PaymentModal`, `OptionsModal` and `lib/cart.ts` unchanged.
- Produces: after a successful order, `navigate("/staff", { state: { sent: { number, method } } })`.

- [ ] **Step 1: Take Order layout** (spec §3 "Add Order")

**Two `SectionCard`s side by side**, stacked under 900px:
- **"Pick items":** `TextInput` search, category `Chip`s, item rows (inner tile: name, category, price, round filled ⊕). Items with options open `OptionsModal`. Sold-out items are disabled.
- **"Counter ticket":** lines with −/+ steppers and line totals, subtotal and total, a "Payment taken" `SegmentedControl` (cash / qr_counter / card_terminal, labels from the existing `paymentMethod.*` keys), and Cancel / **Send To Kitchen**.

**Behaviour:**
- Cash opens the existing `PaymentModal` for tendered amount and change.
- The other methods submit directly, as today.
- All existing idempotency and error handling is kept.

- [ ] **Step 2: Search** in a `SectionCard` with a `Table` (number, time, customer, status `StatusLabel`, total). Rows navigate to `/staff/orders/:id`.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Manual check:
- A cash order with change.
- A QR order.
- An item with options.
- After sending, the banner shows on the queue.
- Searching by number and name works.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(console): add order and search in the console layout"
```

---

### Task 7: Menu (staff sold-out plus owner editor)

**Files:**
- Create: `frontend/src/areas/staff/pages/MenuPage.tsx`
- Modify:
  - `frontend/src/api/menu.ts` (`useUnitsSold`)
  - `frontend/src/areas/admin/components/ItemDrawer.tsx`, `CategoriesPanel.tsx`, `OptionGroupsPanel.tsx` (restyle only)
  - `routes.tsx` (`menu` → MenuPage)
  - locales
- Delete: `frontend/src/areas/staff/pages/SoldOutPage.tsx`

**Interfaces:**
- Consumes: `useMenu`, `useSetSoldOut` (staff), `useAdminMenu` and the item mutations (owner), `GET /admin/menu/units-sold` (Task 4).
- Produces: `useUnitsSold(days = 7, enabled: boolean)` returning `Map<number, number>`.

- [ ] **Step 1: Menu page** (spec §3 "Menu")

**`Tabs`:**
- Staff: Items | Option sold-out.
- Owner: Items | Option sold-out | Categories | Option groups.

**Items `Table` columns:**
- photo (48px rounded `Image`, placeholder icon)
- name
- category
- price (`formatSen`)
- sold in 7 days (owner only)
- availability `StatusLabel` (Hidden when `!is_active`, Sold out when `is_sold_out`, else Available)
- Sold-out `Switch`
- On-menu `Switch` (owner only, patches `is_active`)
- Edit button (owner), which opens `ItemDrawer`

**Data sources:**
- Staff use `useMenu()`, which has no inactive items.
- Owners use `useAdminMenu()`.

**Other details:**
- The header has a search input and "Add New Item" (owner), which opens `ItemDrawer` with `"new"`.
- The Option sold-out tab ports the options list from `SoldOutPage`.
- `SortButtons` are kept on the owner Items table.

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Manual check:
- As staff: toggle an item and an option sold out, and confirm the customer menu reflects it.
- As owner: edit a price, hide an item, upload a photo, reorder, and confirm the sold-7-days numbers show.

- [ ] **Step 3: Commit**

```bash
git add frontend
git commit -m "feat(console): one menu page for sold-out and owner editing"
```

---

### Task 8: Sales Dashboard, Sales History, Sales Report

**Files:**
- Create in `frontend/src/areas/staff/console/`: `RankedBars.tsx`, `PeriodPicker.tsx`
- Create in `frontend/src/areas/staff/pages/`: `DashboardPage.tsx`, `SalesHistoryPage.tsx`, `SalesReportPage.tsx` (from admin TodayPage, OrdersPage and ReportsPage)
- Modify: `routes.tsx`, locales
- Delete: `frontend/src/areas/admin/pages/TodayPage.tsx`, `OrdersPage.tsx`, `ReportsPage.tsx`

**Interfaces:**
- Consumes: `useDashboard`, `useReport`, `useAdminOrders` and `ordersCsvUrl` from `api/admin.ts`; `BarChart` from `components/BarChart.tsx`; `MetricCard`.
- Produces:
  - `RankedBars({ rows, headers, format }: { rows: { label: string; value: number }[]; headers: [string, string, string, string]; format: (v: number) => string })`. Share = value ÷ the sum of all values, with bars in `orange.6`.
  - `PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void })`, where `Period = { mode: "daily" | "monthly" | "range"; date_from: string; date_to: string }`.
  - Pages call `useReport({ date_from, date_to, group_by: "day" })` in every mode.

- [ ] **Step 1: `RankedBars` and `PeriodPicker`** as defined above. `PeriodPicker` uses a grey-track `SegmentedControl` and `TextInput type="date"` (daily, and both ends of range) or `TextInput type="month"` (monthly). `@mantine/dates` is not installed; do not add it. Defaults: daily = today (`businessToday()`), monthly = month start to today.

- [ ] **Step 2: Dashboard** (spec §3)

- **Four `MetricCard`s** from `today` against `same_day_last_week`: net sales, orders, average order, cancelled.
- **Charts:** a "Sales by hour" `BarChart` (today; last week as the detail text), and Top items `RankedBars`.
- **Kept from TodayPage:** live counts, needs-attention, the online toggle.
- **Wiring:** order links go to `/staff/orders/:id`.

- [ ] **Step 3: Sales History** (spec §3)

- **Controls:** `PeriodPicker` and Export CSV (`ordersCsvUrl`).
- **Metric cards:** Gross / Refunds / Net from `totals` against `previous`.
- **Charts:** a sales chart (hours if `date_from === date_to`, else periods), and Payment methods `RankedBars` from `payments[].net_sen`.
- **Order history:** a table with the `OrdersPage` filters and cursor "Load more". Rows go to Order Detail.

- [ ] **Step 4: Sales Report** (spec §3)

`PeriodPicker`, plus `Tabs`:
- **By day:** periods with orders, gross, refunds, net, methods (cash, qr_counter, card_terminal, gateway) and peak hour formatted `h–h+1`.
- **By item.**
- **Cancellations.**

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Manual check:
- With some orders, a refund and a cancellation, Dashboard, History and Report figures agree.
- CSV downloads.
- Monthly and range modes work.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(console): sales dashboard, history and report"
```

---

### Task 9: Staff & Roles, Audit Log, Settings

**Files:**
- Create in `frontend/src/areas/staff/pages/`: `TeamPage.tsx`, `AuditPage.tsx`, `SettingsPage.tsx` (moved from `areas/admin/pages/StaffPage.tsx`, `AuditPage.tsx`, `SettingsPage.tsx`)
- Modify: `routes.tsx`, locales
- Delete: the three admin page files

**Interfaces:**
- Consumes: the existing `api/admin.ts` and `api/auth.ts` hooks, unchanged.

- [ ] **Step 1: Team page**

- `SectionCard` header: "{n} people, 2 roles", plus **Add Staff** (opens the existing create form in a `Modal`).
- `Table` columns: initials `Avatar`, name and username, role `StatusLabel`, position, status `StatusLabel`.
- Row actions (`Menu`): Edit, Set PIN, Reset password, Deactivate or Reactivate.

- [ ] **Step 2: Audit:** the same filters and cursor paging in a `SectionCard` and `Table`.

- [ ] **Step 3: Settings:** a two-column grid of `SectionCard`s.
- **Ordering hours.**
- **Kitchen:** prep minutes, Pause new orders.
- **This tablet:** register or unregister.
- **Security:** TOTP setup, change password.

All existing form logic is kept.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Manual check:
- Create a staff member, set a PIN, deactivate.
- The audit log shows those actions.
- Change prep minutes, and the queue progress bar uses the new value.
- Register and unregister the tablet.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(console): staff, audit and settings in the console"
```

---

### Task 10: Remove old shells, README, full check

**Files:**
- Delete: `frontend/src/areas/staff/StaffLayout.tsx`, `frontend/src/areas/admin/AdminLayout.tsx`, `frontend/src/areas/staff/components/OrderDetailDrawer.tsx`, the now-empty `frontend/src/areas/admin/pages/`
- Move: `frontend/src/areas/admin/components/*` → `frontend/src/areas/staff/components/menu/` (update imports)
- Modify: `README.md` (the route list and code layout sections around lines 440–479 describe `/admin`), locales (remove keys no longer used: the old `staff.tabs.*`, `admin.nav.*`)

- [ ] **Step 1: Delete and move.** Any remaining import of `STATUS_COLOR` switches to the colour map inside `StatusLabel.tsx`. Then run `grep -rn "StaffLayout\|AdminLayout\|OrderDetailDrawer\|areas/admin" frontend/src`.
Expected: no matches.

- [ ] **Step 2: README:** describe the single console under `/staff`, the Operations/Management sections and the `/admin` redirects.

- [ ] **Step 3: Full verification**

Run:
```bash
cd backend && uv run pytest
cd ../frontend && npm run typecheck && npm run check:i18n && npm run build
```
Expected: all pass.

Manual run against spec §6 "Manual run":
- Widths 1440, 1024 and 390.
- Staff and owner.
- A registered tablet, locked and PIN-unlocked.
- Every `/admin/*` redirect.
- Each screen side by side with the design artifact.
- BM language switch on every screen.

- [ ] **Step 4: Commit**

```bash
git add -A frontend README.md
git commit -m "refactor(console): remove old staff/admin shells, update README"
```
