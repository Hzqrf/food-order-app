# Pre-orders (Same Day) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers choose a 15-minute pickup slot later today. The kitchen sees pre-orders in a "Later today" strip until their start time, then in New.

**Architecture:**
- **Pickup time:** a nullable `orders.pickup_at`. "Later" is worked out from the clock (`pickup_at − prep_minutes`), with no new status and no job.
- **Backend pieces:**
  - pure timing helpers
  - a slot calculator
  - slot checks under a branch row lock when placing
  - one "due time" rule used by the late figures, the busy figures and tracking
- **Frontend pieces:** the checkout choice, the tracking copy, and the board strip.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, MySQL 8, pytest; React 19, Mantine 9, TanStack Query, i18next.

**Spec:** `docs/superpowers/specs/2026-10-29-pre-orders-design.md`

## Global Constraints

- **Columns:**
  - `branches.preorders_enabled`: Boolean, not null, server default false.
  - `branches.preorder_slot_limit`: Integer, not null, server default 5, check `preorder_slot_limit >= 1`.
  - `orders.pickup_at`: UtcDateTime, nullable.
  - Index `ix_orders_branch_pickup (branch_id, pickup_at)`.
- **Slots:** `SLOT_MINUTES = 15`, local times "HH:MM" in the shop timezone, today only.
  - **Earliest:** the first boundary ≥ now + prep_minutes + extra_wait_minutes.
  - **Latest:** the last boundary ≤ the close of the window `now` is in. For an all-day window (start == end), the close is the next day-close hour (`settings.day_close_hour`).
  - **Empty list** when pre-orders are off or `takes_online_orders` is false.
- **Slot count:** orders with `pickup_at == slot` and status ≠ `cancelled`. Pending online payments count.
- **Due time:** `pickup_at` if set, else `placed_at + prep_minutes`.
- **Start time:** `pickup_at − prep_minutes`, for pre-orders only.
- **Later:** status `placed`, `pickup_at` set, and now < start time.
- **Error codes:**

  | Code | Status | Message |
  |---|---|---|
  | `preorders_off` | 409 | "Pre-orders aren't available right now." |
  | `slot_unavailable` | 422 | "Pick one of the available times." |
  | `slot_full` | 409 | "That time just filled up. Pick another time." |

- **Settings:** `preorder_slot_limit` is 1–50.
- **Text:** every new string goes in `frontend/src/locales/en.json` and `ms.json`, including `apiError.*` for the three codes, and `npm run check:i18n` must pass. Copy:

  | Key | EN | BM |
  |---|---|---|
  | `admin.settings.preorders` | Pre-orders | Pra-pesanan |
  | `admin.settings.preordersHint` | Customers can choose a pickup time later today. | Pelanggan boleh pilih masa ambil kemudian hari ini. |
  | `admin.settings.preorderSlotLimit` | Max pre-orders per 15 minutes | Maksimum pra-pesanan setiap 15 minit |
  | `customer.chooseTime` | Choose a time | Pilih masa |
  | `customer.slotFull` | Full | Penuh |
  | `customer.pickTime` | Pick a pickup time | Pilih masa ambil |
  | `customer.forTime` | For {{time}} | Untuk {{time}} |
  | `board.later` | Later today | Kemudian hari ini |
  | `board.laterCard` | For {{time}} · starts {{start}} | Untuk {{time}} · mula {{start}} |
  | `board.startEarly` | Start early | Mula awal |
  | `console.queue.metrics.preorders` | Pre-orders today | Pra-pesanan hari ini |
  | `console.queue.metrics.nextAt` | Next at {{time}} | Seterusnya {{time}} |
  | `console.queue.metrics.noneWaiting` | None waiting | Tiada yang menunggu |
  | `apiError.preorders_off` | Pre-orders aren't available right now. | Pra-pesanan tidak tersedia sekarang. |
  | `apiError.slot_unavailable` | Pick one of the available times. | Pilih salah satu masa yang tersedia. |
  | `apiError.slot_full` | That time just filled up. Pick another time. | Masa itu baru sahaja penuh. Pilih masa lain. |

  Tracking reuses `tracking.readyAt` with the pickup time, and `tracking.runningLate`.
- **Tests:**
  - **Backend:** `docker compose up -d mysql` (port 3307), then `cd backend && uv run pytest -q`.
  - **Frontend:** `npm run typecheck && npm run check:i18n && npm run build`, plus a browser check.
  - **API types:** after schema changes, run `npm run gen:types` and commit `src/api/schema.d.ts`.
- **Commits:** on branch `pre-orders`. Stage by name. Each message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A shop whose window runs past midnight** (18:00–02:00) at 23:30 offers slots up to 01:45, all on the same business day. Test: `test_slots_overnight_window` (Task 1).
2. **Two customers racing for the last place in a slot.** Exactly one succeeds; the other gets `slot_full`. Test: `test_last_place_goes_to_one_order` (Task 2), with two sequential placements that hit the limit check under the lock.
3. **A pre-order that was paid online after a delay** (pending, then placed at 11:00 for 12:30) is still "later" on the board and not late. Test: `test_paid_online_preorder_is_later_not_late` (Task 3).
4. **A pre-order whose pickup time has passed but which never started** shows as late on the board metrics and in tracking ("running a little late"). Test: `test_overdue_preorder_is_late` (Task 3).
5. **A board left open across a pre-order's start time.** The ticket moves from Later into New without a reload, and the new-order sound fires once. Browser check in Task 5.

---

### Task 1: Data, timing, settings and pickup slots (backend)

**Files:**
- Create: `backend/alembic/versions/20261029_c3a8f1e6d204_pre_orders.py` (revises `b7e1d4c9a2f0`)
- Create: `backend/app/orders/timing.py`, `backend/app/orders/slots.py`
- Create: `backend/tests/test_preorders.py`
- Modify:
  - `backend/app/models.py`
  - `backend/app/shop/service.py` (`window_close`, `shop_out`)
  - `backend/app/shop/schemas.py` (`ShopOut`, `SettingsPatch`)
  - `backend/app/shop/router.py` (`GET /shop/pickup-slots`)

**Interfaces:**
- **Produces:**
  - `timing.py`:
    - `SLOT_MINUTES = 15`
    - `due_at(order, prep_minutes: int) -> datetime | None`
    - `start_at(order, prep_minutes: int) -> datetime | None`
    - `is_later(order, prep_minutes: int, now: datetime) -> bool`
  - `shop.service.window_close(branch, now) -> datetime | None`: the aware datetime at which the open window containing `now` closes. All-day returns the next `day_close_hour`; not open returns `None`.
  - `slots.py`:
    - `Slot(BaseModel): time: str; available: bool`
    - `pickup_slots(db, branch, now: datetime | None = None) -> list[Slot]`
    - `slot_to_utc(branch, hhmm: str, now) -> datetime | None`: today's local time to UTC, or `None` if not a valid HH:MM
    - `count_in_slot(db, branch, pickup_at: datetime) -> int`
  - `ShopOut` gains `preorders_enabled: bool`, `preorder_slot_limit: int`.
  - `SettingsPatch` gains `preorders_enabled: bool | None`, `preorder_slot_limit: int | None = Field(None, ge=1, le=50)`.
  - `GET /shop/pickup-slots` → `{ "slots": [Slot] }`.

- [ ] **Step 1: Write the failing tests** in `tests/test_preorders.py`.
  - Use a fixture `preorders_on(db, branch, limit=5)`.
  - Pass explicit `now` values built in `Asia/Kuala_Lumpur`.
  - Set `branch.opening_hours` per test (the conftest default is all-day).
  - Tests:
    - `test_slots_round_up_from_prep`: hours 10:00–22:00, prep 15, now 12:07 local, no late orders. The first slot is "12:30" (12:22 rounds up) and the last is "22:00".
    - `test_slots_include_kitchen_delay`: two orders 7 minutes late (as in `test_metrics.late`) at 12:07 give an extra wait of 10, so the first slot is "12:45".
    - `test_slots_overnight_window`: hours 18:00–02:00, now 23:30. The first is "00:00" (23:45 rounds up to 00:00) and the last is "02:00". All slots are the same business date.
    - `test_slots_all_day_end_at_day_close`: the conftest all-day hours, now 22:00. The last slot is "04:00".
    - `test_no_slots_when_off_paused_or_closed`: with pre-orders off the list is `[]`; paused (`is_accepting_online_orders=False`) gives `[]`; at 23:00 with hours 10:00–22:00 it gives `[]`.
    - `test_full_slot_unavailable`: limit 1, one order inserted with `pickup_at` = the 12:30 slot in UTC, so "12:30" has `available False`. After setting that order `cancelled`, it has `available True`.
    - `test_pickup_slots_endpoint_is_public`: `GET /shop/pickup-slots` returns 200 with key `slots`, each item having exactly the keys `{"time","available"}`.
    - `test_preorder_settings_audited_and_validated`:
      - PATCH `{"preorders_enabled": true, "preorder_slot_limit": 3}` is 200 and writes a `settings_changed` entry with both fields.
      - `{"preorder_slot_limit": 0}` is 422.
      - `GET /shop` shows `preorders_enabled True, preorder_slot_limit 3`.
    - `test_timing_helpers`: a pure test with a stub object (`SimpleNamespace(status, placed_at, pickup_at)`).
      - `due_at` returns `pickup_at` when set, else `placed_at + 15 min`.
      - `start_at` is `pickup_at − 15 min`, or `None`.
      - `is_later` is true before the start and false at it.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_preorders.py -q`
  - Expected: FAIL (ImportError / KeyError).

- [ ] **Step 3: Implement.**
  - The migration and model columns, as in Global Constraints.
  - `window_close` follows `is_open`'s window rules and returns a local aware datetime.
  - **`pickup_slots` algorithm:**
    1. Return `[]` unless `branch.preorders_enabled and takes_online_orders(branch)`.
    2. `earliest = ceil_to_15(now_local + prep + extra_wait)`; `close = window_close(branch, now)`.
    3. Step 15 minutes from `earliest` to `close` inclusive.
    4. Mark each slot `available = count_in_slot(...) < limit`, using one grouped query over `pickup_at` in `[earliest, close]`, not one query per slot.
  - The endpoint in `shop/router.py` takes `db`.
  - `shop_out` fills the two new fields.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.
  - Update `tests/test_metrics.py::test_shop_reports_extra_wait`'s exact key set with the two new keys. A ruling is not needed; this was planned.
  - Then run `uv run alembic upgrade head`.

- [ ] **Step 5: Commit.**
  - Message: `feat(preorders): pickup slots, owner switch and slot limit`.

### Task 2: Placing pre-orders (backend) and API types

**Files:**
- Modify:
  - `backend/app/orders/schemas.py` (`OnlineOrderIn`, `OrderSummary`, `TrackingOut`)
  - `backend/app/orders/service.py` (`create_online_order`, `summary`, `tracking`)
- Modify: `frontend/src/api/schema.d.ts` (generated)
- Test: `backend/tests/test_preorders.py`

**Interfaces:**
- **Consumes:** Task 1's `slot_to_utc`, `pickup_slots`, `count_in_slot`, `start_at`.
- **Produces:**
  - `OnlineOrderIn.pickup_time: str | None = None`
  - `OrderSummary` gains `pickup_at: datetime | None`, `start_at: datetime | None`
  - `TrackingOut.pickup_at: datetime | None = None`

- [ ] **Step 1: Write the failing tests.**
  - Use `place()` from `tests/test_online.py` with `pickup_time=...` through `**over`, the `menu` fixture and `preorders_on`.
  - Freeze the time by choosing slots from `GET /shop/pickup-slots`, never hard-coded clock times, so the tests pass at any hour. Pick `slots[0]["time"]`.
  - Tests:
    - `test_online_preorder_waits_for_payment_then_is_placed`:
      - 201 and `pending_payment`; after `webhook(...)` paid, tracking shows `status "placed"` and `pickup_at` equal to that slot in UTC
      - the staff board row has `pickup_at` and `start_at = pickup_at − 15 min`
    - `test_counter_preorder_is_placed_unpaid`: with `no_gateway` + counter on (reuse the fixtures from `test_pay_at_counter.py`), the order is placed, unpaid, with `pickup_at` set.
    - `test_bad_times_refused`: `"25:00"`, `"12:07"` (off-grid), `"abc"`, and a slot time before the earliest all give 422 `slot_unavailable`.
    - `test_preorders_off_refused`: with pre-orders off, any `pickup_time` gives 409 `preorders_off`.
    - `test_last_place_goes_to_one_order`:
      - limit 1
      - the first order in a slot gives 201
      - a second order (new key, other phone) in the same slot gives 409 `slot_full`
      - the slots endpoint now shows it unavailable
    - `test_preorder_retry_same_key_same_order`: the same key twice returns the same `order_code`, even when the slot is now full (limit 1).
    - `test_asap_orders_have_no_pickup_time`: an order with no `pickup_time` has `pickup_at None` on tracking and the board.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_preorders.py -q`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **In `create_online_order`,** after the payment-option checks and before pricing:
    - if `body.pickup_time` is set: `preorders_off` check → `slot_to_utc` → must be one of `pickup_slots(db, branch)` times, else `slot_unavailable`
    - then lock the branch row (`select(Branch).where(Branch.id == branch.id).with_for_update()`) and recount with `count_in_slot`; at or over the limit raises `slot_full`
  - **Insert:** pass `pickup_at` into `_insert_numbered`.
  - **Responses:** fill `pickup_at` and `start_at` in `summary()`, and `pickup_at` in `tracking()`.
  - Run `cd ../frontend && npm run gen:types && npm run typecheck`. If the generated `OnlineOrderIn` makes `pickup_time` required, send `pickup_time: null` from CheckoutPage until Task 4.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit.**
  - Files: backend files and `schema.d.ts`.
  - Message: `feat(preorders): place orders for a pickup slot, with the slot limit enforced`.

### Task 3: Due time in late and busy figures; board metrics (backend)

**Files:**
- Modify: `backend/app/orders/metrics.py`, `backend/app/orders/schemas.py` (`QueueMetrics`)
- Test: `backend/tests/test_preorders.py`

**Interfaces:**
- **Consumes:** `Order.pickup_at`.
- **Produces:** `QueueMetrics` gains `preorders_today: int` and `next_preorder_at: datetime | None`.
- **The late filter becomes:**
  `status in (placed, preparing) and ((pickup_at is null and placed_at < now − prep) or (pickup_at is not null and pickup_at < now))`
- **`open_orders`** excludes later orders: `not (status == placed and pickup_at > now + prep)`.

- [ ] **Step 1: Write the failing tests.**
  - Set orders directly with `set_order` (as `test_metrics.py` does) and pass an explicit `now`.
  - Tests:
    - `test_preorder_placed_early_is_not_late`: placed 120 minutes ago with `pickup_at = now + 60 min` is not in `running_late`, adds nothing to `extra_wait_minutes`, and is not in `open_orders`.
    - `test_paid_online_preorder_is_later_not_late`: an order created `pending_payment`, then set `placed` with `placed_at = now − 30 min` and `pickup_at = now + 45 min`. It is not late, and `open_orders` excludes it.
    - `test_overdue_preorder_is_late`:
      - two pre-orders with `pickup_at = now − 7 min`, still `placed`
      - `running_late` is 2 and `extra_wait_minutes` is 10
      - each is in `open_orders`
    - `test_preorders_today_and_next`:
      - three pre-orders today at +30, +90 and −10 minutes (the last one `preparing`), plus one cancelled pre-order
      - `preorders_today` is 3
      - `next_preorder_at` is the +30 one (the earliest still `placed` with `pickup_at > now`)

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_preorders.py -q`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - Update `_late(branch, now)` to the filter above using `or_`/`and_` with Python-computed cutoffs, not SQL date arithmetic.
  - `extra_wait_minutes` measures lateness as `now − due_at`, using `pickup_at` when set.
  - `queue_metrics` adds the two fields and the `open_orders` exclusion.
  - Run `cd ../frontend && npm run gen:types`.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass, including the existing `test_metrics.py`.

- [ ] **Step 5: Commit.**
  - Message: `feat(preorders): late and busy figures use the pickup time; pre-orders today`.

### Task 4: Owner settings, checkout time choice, tracking and Orders tab (frontend)

**Files:**
- Modify:
  - `frontend/src/areas/staff/pages/SettingsPage.tsx` (`PaymentOptions` section or a sibling `PreorderOptions`)
  - `frontend/src/api/menu.ts` (`usePickupSlots(enabled: boolean)`)
  - `frontend/src/areas/customer/pages/CheckoutPage.tsx`
  - `frontend/src/areas/customer/pages/OrderPage.tsx`
  - `frontend/src/areas/customer/components/RecentOrders.tsx`
  - locales

**Interfaces:**
- **Consumes:**
  - `ShopOut.preorders_enabled`, `preorder_slot_limit`
  - `GET /shop/pickup-slots`
  - `OnlineOrderIn.pickup_time`
  - `TrackingOut.pickup_at`
- **Produces:** `usePickupSlots(enabled)`, a `useQuery(["pickup-slots"], …, { enabled, refetchInterval: 60_000 })`.

- [ ] **Step 1: Settings.**
  - Add a **Pre-orders** switch with help text `admin.settings.preordersHint`.
  - When it's on, add a `NumberInput` (`admin.settings.preorderSlotLimit`, min 1, max 50) that saves on blur.
  - Both use `useUpdateSettings`.

- [ ] **Step 2: Checkout.**
  - **State:** `when: "asap" | "later"`, default `"asap"`, and `slot: string | null`.
  - **Pickup card,** when `shop.preorders_enabled`:
    - two `ChoiceRow` radios: the existing ASAP line, and `customer.chooseTime`
    - choosing `"later"` enables `usePickupSlots(true)` and shows the slots as a wrapped `Chip` group
    - a full slot is disabled and shows `customer.slotFull`
    - if the list is empty, hide the "Choose a time" row
  - **Button:** with `"later"` and no slot, the button is disabled and `customer.pickTime` shows under it.
  - **Submit:** sends `pickup_time: when === "later" ? slot : null`.
  - **Errors:** `slot_full` / `slot_unavailable` refetch the slots, clear `slot`, and show `apiError.*`. `preorders_off` invalidates `["shop"]`.

- [ ] **Step 3: Tracking and Orders tab.**
  - **`heading()`:**
    - when `order.pickup_at` is set and the status is `placed` or `preparing`: `tracking.readyAt` with `formatTime(pickup_at)` while it's in the future, else `tracking.runningLate`
    - no kitchen delay is added for pre-orders
  - **`RecentOrders`:** add `customer.forTime` to rows whose tracking data has `pickup_at`.

- [ ] **Step 4: Verify.**
  - Run `npm run typecheck && npm run check:i18n && npm run build`. Expected: pass.
  - **Browser at 390px:**
    - pre-orders on with limit 1
    - checkout shows "Choose a time", picking a slot works, and an order is placed with "Ready for pickup at {slot}"
    - a second checkout shows that slot as "Full"
    - EN and BM

- [ ] **Step 5: Commit.**
  - Message: `feat(customer): choose a pickup time today; pre-order settings`.

### Task 5: Board Later today strip, auto-move, labels, metric card (frontend)

**Files:**
- Create: `frontend/src/areas/staff/components/LaterStrip.tsx`
- Modify:
  - `frontend/src/areas/staff/pages/BoardPage.tsx`
  - `frontend/src/areas/staff/components/OrderCard.tsx` ("For" badge)
  - `frontend/src/areas/staff/pages/OrderPage.tsx`
  - `frontend/src/areas/staff/pages/SearchPage.tsx`
  - locales

**Interfaces:**
- **Consumes:** `OrderSummary.pickup_at`, `start_at`; `QueueMetrics.preorders_today`, `next_preorder_at`; `useClaim`/`useTransition` as the board uses them.
- **Produces:**
  - `isLater(o: OrderSummary, now: number): boolean`, exported from `LaterStrip.tsx`: `o.status === "placed" && o.start_at !== null && now < Date.parse(o.start_at)`
  - `LaterStrip({ orders, now, busyId, onStart, onOpen })`

- [ ] **Step 1: Split the board.**
  - BoardPage already has a `now` interval. Split `board.data` into `later = data.filter(o => isLater(o, now))` and `live = data.filter(o => !isLater(o, now))`.
  - The columns and `useNewOrderAlert` get `live` only, so the sound and flash fire when a pre-order enters New.
  - Render `LaterStrip` above the columns when `later.length > 0`, sorted by `pickup_at`.

- [ ] **Step 2: The strip.**
  - A `SectionCard` titled `board.later` (with a count), holding a horizontal list (wrapping on narrow screens) of compact cards.
  - Each card shows:
    - `#number`, then `board.laterCard` with `formatTime(pickup_at)` and `formatTime(start_at)`
    - the items, one line each
    - the total
    - the Unpaid badge when `isUnpaidAtCounter`
    - a **Start early** button, which calls the same handler the board uses for Start Cooking (`placed → preparing`)
  - Clicking the card opens the order.

- [ ] **Step 3: Labels and the metric card.**
  - `OrderCard`, the staff OrderPage header and the Search rows show a `customer.forTime` badge (blue light) when `pickup_at` is set.
  - In BoardPage, replace the "Orders today" `MetricCard`:
    - label `console.queue.metrics.preorders`
    - value `preorders_today`
    - subtitle `console.queue.metrics.nextAt` with `formatTime(next_preorder_at)`, or `noneWaiting` when it's null

- [ ] **Step 4: Full checks.**
  - Run `cd backend && uv run pytest -q` and `cd ../frontend && npm run typecheck && npm run check:i18n && npm run build`. Expected: all pass.
  - **Browser at 1280px (staff) and 390px (customer):**
    - a pre-order shows in Later today with For and starts times
    - Start early moves it into Preparing
    - move a second pre-order's `pickup_at` in dev data to start within a minute; without a reload it appears in New and flashes
    - the metric card shows the count and next time
    - EN and BM

- [ ] **Step 5: Commit.**
  - Message: `feat(staff): Later today strip, pre-orders move into New on time`.
