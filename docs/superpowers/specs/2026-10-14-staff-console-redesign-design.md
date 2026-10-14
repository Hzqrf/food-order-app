# Staff Console redesign: design

- **Date:** 2026-10-14
- **Status:** approved in brainstorming, awaiting spec review
- **Sub-project:** 1 of 6 in the Staff Console programme (see "Programme" below)
- **Source design:** Claude Design "Staff Console" (artifact `https://claude.ai/artifact/7D8s5mjtAEcUaA4wjrh3LR`, blue `#007AFF`, Harbour Kitchen sample data)

## Goal

Rebuild the staff and owner screens to follow the Staff Console design. Use Kaunter's orange instead of the design's blue. Keep every feature the app already has.

## Programme

The full request was split into six sub-projects, built in this order. Each gets its own spec, plan and build.

1. **Console redesign** (this spec)
2. **Pre-orders**: same day only. Customers pick a later pickup time today.
3. **Food cost & profit**: a cost field on each menu item, giving Gross Profit and margin in Sales History.
4. **Sales by staff and by customer**: report tabs. `orders.customer_name` and `customer_phone` already exist.
5. **Inventory**: ingredients, stock on hand, par levels, recorded deliveries.
6. **Shifts**: a monthly AM/PM calendar; the owner publishes, staff claim slots.

Each later sub-project adds its own items to the console built here.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Implementation approach | Rebuild the design in Mantine: theme tokens plus a few shared console components. Do not port the design's raw HTML or inline styles. |
| Structure | One console under `/staff`. The sidebar has an "Operations" section for everyone and a "Management" section for owners only. |
| Orange | Burnt `#c2410c` for filled buttons and the current nav item (white-text contrast 5.2:1). `#ea580c` for accents. Applies app-wide, customer pages included. |
| Claim flow | Claiming is optional. "Start Cooking" is the main button on a new ticket and also claims it. A smaller "Take" button claims without starting. |
| Queue extras | Take Order (claim) and the queue metrics are in. Pre-orders are sub-project #2. Grab is out. |
| Staff/Owner toggle in the design | Dropped. It was a preview control; the role comes from the signed-in user. |
| Design features not built | Discounts (the app has no discounts), "max orders per 15 min", the busy-kitchen notice, invite by email (there is no email sending). |

## Scope

**In scope:**
- the console shell, theme and font
- re-homing every existing staff and owner page into the design's layouts
- order claim
- queue metrics
- dashboard comparisons
- report additions
- the Order Detail page
- redirects from the old URLs

**Out of scope:**
- the customer pages' layout (they only pick up the new orange palette)
- everything in sub-projects 2–6
- dark mode

## 1. Structure and routes

The console lives under `/staff`. That path is already the installed tablet app's scope (`frontend/public/staff.webmanifest`, `staff-sw.js` registered with scope `/staff`), so tablets keep working with no reinstall.

| Section | Nav item | Route | Built from |
|---|---|---|---|
| Operations | Order Queue (badge = open orders) | `/staff` | `areas/staff/pages/BoardPage` |
| Operations | Add Order | `/staff/take` | `TakeOrderPage` (also the "+ Add Order" button on the queue) |
| Operations | Search | `/staff/search` | `SearchPage` |
| Operations | Menu | `/staff/menu` | `SoldOutPage` for staff; plus `admin/pages/MenuPage` editing for owners |
| (no nav item) | Order Detail | `/staff/orders/:id` | replaces `OrderDetailDrawer` |
| Management | Sales Dashboard | `/staff/dashboard` | `admin/pages/TodayPage` |
| Management | Sales History | `/staff/sales` | `ReportsPage` summary plus `OrdersPage` list |
| Management | Sales Report | `/staff/reports` | `ReportsPage` tables |
| Management | Staff & Roles | `/staff/team` | `admin/pages/StaffPage` |
| Management | Audit Log | `/staff/audit` | `AuditPage` |
| Management | Settings | `/staff/settings` | `SettingsPage` |

**Access rules:**
- Operations routes use the current `RequireRole role="staff" allowDevice` rule.
- Management routes need `admin`.
- On a registered shop tablet, Management stays hidden and blocked even for an owner unlocked by PIN. This keeps today's rule that owner tools never open on the shared device. A blocked route shows a "Sign in on your own device to use owner tools" panel.
- The server already enforces every permission. The frontend gating is for convenience only.

**Redirects:**
- `/admin` → `/staff/dashboard`
- `/admin/today` → `/staff/dashboard`
- `/admin/orders` → `/staff/sales`
- `/admin/reports` → `/staff/reports`
- `/admin/menu` → `/staff/menu`
- `/admin/staff` → `/staff/team`
- `/admin/audit` → `/staff/audit`
- `/admin/settings` → `/staff/settings`
- `/staff/sold-out` → `/staff/menu`

`LoginPage` sends everyone to `/staff`. It still honours a safe `next=` parameter, so a redirect target that starts with `/admin` is mapped through the table above.

**Locked tablet:** same as today.
- The queue is visible read-only.
- Every other Operations route shows `PinPad`.
- `ensureUnlocked()` guards every action.
- A PIN session locks again after 5 minutes idle.
- The wake lock stays on.

**Shell (`ConsoleLayout`):**
- **Sidebar:**
  - Desktop (≥ 1200px): full width, 264px.
  - Tablet (768–1199px): an 88px icon-only rail with count badges floating on the icons.
  - Phone (< 768px): a burger drawer.
- **Sidebar footer:** language switch, the "online orders" pause switch (only when `online_payments_enabled`, as today), the install-app button, and Log Out.
- **Header:** branch name, then user name and role on the right.
- **Log Out** opens the design's confirm dialog. It says how many orders are still cooking and how many are waiting at the counter, with "Stay Signed In" and "Log Out" buttons.
- **Toasts:** dark, bottom-right, as in the design. Console only; the customer side keeps its current notifications.
- **Page header:** page title (30/38) and a one-line description, with optional actions on the right.
- **Bundles:** customer pages still never download console code, because the lazy loading stays.

## 2. Visual system

Each design token goes into the Mantine theme once, in `frontend/src/theme.ts`, which `main.tsx` imports. Pages use theme values and never hardcode hex colours.

| Token | Design value | Kaunter value |
|---|---|---|
| Primary fill (filled buttons, current nav item, nav badges) | `#007AFF` | `#c2410c` |
| Primary hover | `#144981` | `#9a3412` |
| Primary accent (badges, progress, charts, focus ring) | (none) | `#ea580c` |
| Primary tint (row hover, "you" highlights) | `#F0F7FF` | `#fff7ed` |
| Page background | `#F4F5F7` | same |
| Card | white, 16px radius, shadow `0 1px 2px rgba(16,24,40,.05)` | same |
| Inner tile | `#FBFBFB`, 12px radius, inset 1px `#EAECF0` | same |
| Secondary button | `#F1F1F1` with `#48484A` text, 6px radius | same |
| Dark button | `#1D1D1F` with white text | same |
| Text primary / body / muted | `#1D1D1F` / `#48484A` / `#6B6B6B` (`#667085` for page subtitles) | same |
| Success | `#027A48` on `#ECFDF3`, fill `#D1FADF` | Mantine `green`, tuned |
| Warning | `#F79009` | Mantine `yellow`, tuned. Not orange, which is now the brand colour |
| Danger | `#F04438`, hover `#B42318`, tint `#FEF3F2` | Mantine `red`, tuned |
| Font | Inter | Inter via `@fontsource-variable/inter`, self-hosted, imported only in the console bundle |
| Page title / section title | 30/38 semibold −0.02em / 16/24 semibold | same |
| Segmented tabs | grey track `#F1F1F1`, white selected pill | Mantine `SegmentedControl` styled to match |

**Palette:** a custom 10-shade `brand` palette with shade 6 = `#ea580c` and shade 8 = `#c2410c`. It becomes `primaryColor`, filled components use shade 8, and it replaces Mantine's default `orange` everywhere in the app. `index.html` already uses `#c2410c` as `theme-color` and `#ea580c` in the favicon, so no change is needed there.

**Shared console components** go in `frontend/src/areas/staff/console/`, each one small with a single purpose:
- `ConsoleLayout`: the shell, nav and lock context. Replaces `StaffLayout` and `AdminLayout`.
- `ConsoleNav`: the nav items list. Each item has a route, label key, icon, role and optional badge. One list feeds the sidebar, the rail and the drawer.
- `PageHeader`: title, subtitle, actions, optional back button.
- `SectionCard`: the white card, with optional header (title on the left, actions on the right) and a body.
- `MetricCard`: label, value, delta with direction, delta label. Shows `—` when there's no value.
- `StatusLabel`: maps order status, availability, role and payment method to the design's coloured labels.
- `RankedBars`: label, bar, value and share.
- `PeriodPicker`: Daily / Monthly / Date range plus date inputs. Returns `{date_from, date_to}`.
- `ConfirmLogoutModal`.

## 3. Screens

Every screen is in EN and BM. Money shows as RM from real data; the design's dollar sample data is not used.

### Order Queue (`/staff`)

**Metric cards** come from `GET /staff/queue-metrics` and refresh every 30s:
- **Open orders:** placed + preparing + ready.
- **Avg prep time:** the mean of `ready_at − preparing_at` for today's orders, against the same weekday last week.
- **Running late:** open orders past their promised time (`placed_at + branch.prep_minutes`) that are not yet ready.
- **Orders today:** against the same weekday last week. Sub-project #2 swaps this card for "Pre-orders today".

**Columns:** New / Preparing / Ready for pickup. Each is a `SectionCard` with a count label, and each ticket is an inner tile.
- **New ticket:**
  - shows `#number`, age, item summary, a channel label and the total
  - main button: **Start Cooking**, which moves the order to `preparing` and claims it if unclaimed
  - small secondary button: **Take**, which claims only
  - once claimed, the label "Taken by {name}" appears
- **Preparing ticket:**
  - shows `#number` and how long it has been cooking
  - a **progress bar** of `(now − preparing_at) / prep_minutes`, capped at 100%
  - over time, the bar turns red and the age text becomes "Running late"
  - **Mark Ready** secondary button
- **Ready ticket:**
  - shows `#number`, "Waiting N mins" (amber from 10 minutes), and customer name or channel
  - dark **Hand Over** button
- **Kept from BoardPage:**
  - 5s polling
  - new-order chime and flash (`useNewOrderAlert`, `OrderCard.module.css`)
  - Undo for 5s after hand-over
  - a single-column `SegmentedControl` view below the tablet breakpoint
  - `ensureUnlocked()` before any action
- **Clicking a ticket** opens Order Detail.

**Header action:** "+ Add Order" → `/staff/take`. After a counter order is sent, the queue shows a green banner: "Counter order #{n} sent to the kitchen · paid {method}".

### Order Detail (`/staff/orders/:id`)

- The back button returns to where the user came from (queue, search or sales).
- **Left card:** header "Order #{n}" with a status label and the next-status action. Item lines with options, item notes and line totals. Then the customer note tile.
- **Right column:**
  - **Pickup** key-value card: customer, phone, channel, order code, payment method and status, total.
  - **Timeline** card: received (`placed_at`), cooking started (`preparing_at`), ready, handed over or cancelled, each with the person who did it from `OrderStatusEvent.actor`.
- **Actions:** Cancel (existing reasons and refund-method flow, from `CancelOrderModal`) and Refund (owner only, `RefundModal`).
- Order Detail replaces `OrderDetailDrawer` everywhere: board, search, dashboard, sales history.

### Add Order (`/staff/take`)

- **Left card, "Pick items":** search input and category chips. Item rows show name, category, price and a round ⊕ button. Items with option groups open `OptionsModal`. Sold-out items are disabled.
- **Right card, "Counter ticket":** lines with −/+ steppers and line totals, then subtotal and total. "Payment taken" offers Cash / QR / Card. These are the existing methods `cash`, `qr_counter` and `card_terminal`. Cash keeps the tendered-amount and change step from `PaymentModal`.
- **Buttons:** Cancel and Send To Kitchen. The `Idempotency-Key` behaviour is unchanged.
- Customer name and phone fields arrive in sub-project #4.

### Search (`/staff/search`)

The existing search inside a `SectionCard` with a table. Rows open Order Detail. Staff can still only search the last 7 days.

### Menu (`/staff/menu`)

**Items table columns:**
- photo, item, category, price
- **sold in the last 7 days** (owner only)
- availability label: Available / Sold out / Hidden
- Sold-out switch (everyone)
- On-menu switch (owner only; maps to `is_active`)

**Tabs:**
- Staff: Items | Option sold-out.
- Owners also get Categories | Option groups. These are the existing `CategoriesPanel` and `OptionGroupsPanel`, restyled.

**Owner actions:**
- "Add New Item".
- A row's Edit opens the existing `ItemDrawer`, restyled. Options and photo upload are kept.
- Sort controls are kept.

### Sales Dashboard (`/staff/dashboard`, owner)

- **Metric cards:** sales, orders, average order and cancelled today, each against the same weekday last week.
- **Charts:** "Sales by hour" for today against the same weekday last week, and Top items as `RankedBars`.
- **Kept from TodayPage:** live counts, Needs attention, and the online-orders toggle.

### Sales History (`/staff/sales`, owner)

- **Controls:** `PeriodPicker` and Export CSV (the existing `/admin/reports/orders.csv`).
- **Metric cards:** Gross, Refunds, Net, each against the previous equal-length period. Gross Profit arrives in #3. There is no Discounts card.
- **Charts:** a sales chart (by hour when the range is one day, otherwise by day) and Payment methods as `RankedBars`, using net per method from the existing `payments` rows.
- **Order history:** the existing `OrdersPage` table and filters (status, payment status, channel, staff, search), with cursor paging. Rows open Order Detail.

### Sales Report (`/staff/reports`, owner)

- **Controls:** `PeriodPicker`.
- **By day:** a table with date, orders, gross, refunds, net, cash / QR / card / online, and peak hour.
- **Other tabs:** By item (existing items) and Cancellations (existing).
- By staff and By customer tabs arrive in #4.

### Staff & Roles (`/staff/team`, owner)

- **Table columns:** avatar (initials), name, username, role label (Owner/Staff), position, status (Active/Deactivated).
- **Header button:** "Add Staff".
- **Row actions:** Edit, Set PIN, Reset password, Deactivate or Reactivate. All existing endpoints.

### Audit Log (`/staff/audit`, owner)

The existing page and filters, restyled into a `SectionCard` and table.

### Settings (`/staff/settings`, owner)

Cards:
- **Ordering hours:** existing `opening_hours` editing.
- **Kitchen:** prep minutes shown to customers, and Pause new orders (`is_accepting_online_orders`).
- **This tablet:** register or unregister.
- **Security:** two-step login (TOTP) and change password.

## 4. Backend changes

### Order claim and `preparing_at`

- **Alembic migration:**
  - adds `orders.claimed_by_user_id` (nullable FK to `users.id`), `orders.claimed_at` and `orders.preparing_at` (nullable `UtcDateTime`)
  - backfills `preparing_at` from the earliest `order_status_events` row with `to_status='preparing'` for each order
- **Setting `preparing_at`:** the move into `preparing` sets `preparing_at`. An admin's backward correction out of `preparing` leaves it as it is.
- **`POST /staff/orders/{id}/claim`:**
  - body `{version}`; same optimistic version check as transitions
  - allowed while the status is `placed` or `preparing`
  - claiming again by the same user returns the order unchanged
  - taking over from another user is allowed and writes an audit-log entry `order.claim_takeover` (old claimer → new)
  - a locked tablet (no user) gets the existing not-authenticated error
- **Start Cooking:** the `placed → preparing` transition with `claimed_by_user_id` null sets the claimer to the acting user.
- **Schema fields:** `OrderSummary` and `OrderDetail` gain `claimed_by_name`, `claimed_at` and `preparing_at`. `OrderDetail` gains a timeline list `[{status, at, actor_name}]` built from `order_status_events`.

### Queue metrics

`GET /staff/queue-metrics` (staff and admin) returns `{open_orders, avg_prep_minutes, avg_prep_minutes_last_week, running_late, orders_today, orders_same_day_last_week}`.
- Dates use `business_date` and the branch timezone, like the existing reports.
- The response contains no money.

### Dashboard

`Dashboard` gains:
- `same_day_last_week: Totals`
- `cancelled_today: int`
- `hours_today: list[HourRow]`
- `hours_same_day_last_week: list[HourRow]`

Existing fields are unchanged.

### Reports

`Totals` gains `refunds_sen` and `net_sen`, where net is `sales_sen − refunds_sen`. The refunds come from `payments` rows with `kind='refund'` in the period. `Dashboard` gets these too, because it shares `Totals`.

`Report` gains:
- `previous: Totals`, the same-length period immediately before `date_from`
- each `PeriodRow` gains `refunds_sen`, a per-method net map `{cash, qr_counter, card_terminal, gateway}`, and `peak_hour: int | None`

### Menu units sold

`GET /admin/menu/units-sold?days=7` (owner only) returns `[{menu_item_id, units}]`. It counts non-cancelled orders over the last N business days.

### Types

Regenerate `frontend/src/api/schema.d.ts` with `npm run gen:types`.

## 5. Error handling

- **Claim or transition clash:** the server returns 409, as today. The console shows a toast naming who already acted ("Aisyah already took #42") and refetches the board.
- **Metrics failure:** cards show `—`. The queue never blocks on metrics.
- **Locked tablet:** every action goes through `ensureUnlocked()` and the PIN pad.
- **Owner route on the shared tablet:** the explanatory panel, not a blank page or a redirect loop.
- **Old URLs:** client-side redirects, so bookmarks and the installed app keep working.

## 6. Testing

**Backend (`backend/tests/`, pytest against the MySQL test DB):**
- Claim: claiming, claiming again, takeover with an audit entry, auto-claim on Start Cooking, version conflict, locked device rejected.
- `preparing_at` is set on the transition, and the migration backfill is correct.
- Queue metrics: average prep time, running late against `prep_minutes`, the weekday comparison, and business-date boundaries.
- Dashboard and report additions: previous-period totals, per-method daily net, peak hour, units sold.

**Frontend:** the repo has no unit-test runner and this spec doesn't add one. The checks are:
- `npm run typecheck`
- `npm run check:i18n` (every new key in `en.json` and `ms.json`)
- `npm run build`

**Manual run:**
- Desktop (1440), tablet landscape (1024) and phone (390) widths.
- Staff and owner accounts.
- A registered tablet, locked and unlocked by PIN.
- Every redirect.
- Each screen against the design.

## 7. Build order (within this sub-project)

1. Theme (`theme.ts`, brand palette, Inter) and `ConsoleLayout` with nav, rail, drawer, lock context, logout modal and redirects. This is the first visible change.
2. Backend: migration, claim, `preparing_at`, queue metrics, and their tests.
3. Order Queue and Order Detail.
4. Add Order and Search.
5. Menu, plus the units-sold endpoint.
6. Owner pages: Dashboard, Sales History, Sales Report, Staff & Roles, Audit, Settings. Plus the dashboard and report backend additions.
7. Remove `StaffLayout`, `AdminLayout`, `OrderDetailDrawer` and the moved admin pages. Update the README's route list.
