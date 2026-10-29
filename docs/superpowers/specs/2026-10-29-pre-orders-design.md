# Pre-orders (same day): design

- **Date:** 2026-10-29
- **Status:** approved in brainstorming, awaiting spec review
- **Sub-project:** 2 of 6 in the Staff Console programme (`2026-10-14-staff-console-redesign-design.md`, "Programme": "Pre-orders: same day only. Customers pick a later pickup time today.")

## Goal

Customers can choose a pickup time later today ("ready at 12:30") instead of "as soon as possible". The kitchen sees what's coming but starts cooking at the right moment, so food is ready on time and not hours early. Pre-orders work with both payment options: online at once, or at the counter on pickup.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Kitchen view | A **"Later today"** strip on the board shows pre-orders straight away. Each one **moves into New automatically** at its start time (pickup time − prep time). Staff can start one early. |
| Slot limit | Pickup times are **15-minute slots**. The owner sets a **maximum number of pre-orders per slot**. A full slot is greyed out for customers. |
| Approach | Store a **pickup time on the order** and work out "later" from the clock. Rejected: a new "scheduled" status moved to New by a background job. That means more moving parts, and an order stays hidden if the job misses. |

**Assumptions (part of the design the user approved):**
- **Today only.** Pre-orders are only for later the same business day, and only while the shop is open (the same rule as ordering now). Ordering before opening is out of scope.
- **No counter pre-orders.** Staff don't take pre-orders at the counter; walk-ins want food now.
- **Order count moves.** The board's "Orders today" card becomes "Pre-orders today", as the programme spec planned. The day's order count stays on the Sales Dashboard.

## Scope

**In:**
- owner switch and slot limit
- available pickup slots for today
- the choice at checkout
- server-side slot checks
- pickup time on the order
- the board's Later today strip and auto-move
- "For 12:30" labels
- the due-time rule for late and busy figures and tracking
- the Pre-orders today card
- tracking and Orders tab copy

**Out:**
- pre-orders for tomorrow or later days
- ordering before opening
- counter pre-orders
- changing a pre-order's time after placing
- reminders
- per-item capacity

## 1. Data

### New columns (one Alembic migration)

| Table | Column | Type | Meaning |
|---|---|---|---|
| `branches` | `preorders_enabled` | `Boolean`, not null, default false | The owner allows pre-orders. |
| `branches` | `preorder_slot_limit` | `Integer`, not null, default 5, check `>= 1` | Most pre-orders per 15-minute slot. |
| `orders` | `pickup_at` | `UtcDateTime`, nullable | The chosen pickup time (UTC). `NULL` for every as-soon-as-possible and counter order. |

Index `ix_orders_branch_pickup` on (`branch_id`, `pickup_at`).

### Derived times (`app/orders/timing.py`, new and pure)

- `SLOT_MINUTES = 15`
- `due_at(order, prep_minutes) = order.pickup_at or order.placed_at + prep_minutes`: when the customer expects the food.
- `start_at(order, prep_minutes) = order.pickup_at - prep_minutes` for a pre-order, else `None`: when the kitchen should start.
- `is_later(order, prep_minutes, now) = order.status == "placed" and order.pickup_at is not None and now < start_at(...)`.

## 2. Backend

### Slots (`app/orders/slots.py`, new)

`pickup_slots(db, branch, now) -> list[Slot]`, where `Slot(time: "HH:MM", available: bool)`. Times are local times today in the shop's timezone.
- **Empty list** when pre-orders are off, the shop isn't taking online orders (`takes_online_orders` false), or no slot fits.
- **Earliest slot:** the first 15-minute boundary at or after `now + prep_minutes + extra_wait_minutes`.
- **Latest slot:** the last 15-minute boundary at or before the closing time of the opening window that `now` is in. A window running past midnight closes at its end time on the next calendar day. If the shop is open all day (start == end), the latest is the day-close hour of this business day (`settings.day_close_hour`).
- **Available** when fewer than `preorder_slot_limit` orders have `pickup_at` equal to that slot and status ≠ `cancelled`.
  - Unpaid online pre-orders count while they are `pending_payment`.
  - Once they expire they are cancelled and stop counting.

`GET /shop/pickup-slots` returns `{ slots: [Slot] }`. It is public and uncached, with no counts beyond `available`.

### Placing (`OnlineOrderIn`, `create_online_order`)

`OnlineOrderIn` gains `pickup_time: str | None` ("HH:MM", today, shop timezone). With `None` the order is placed exactly as today.

When given, after the existing shop-open and payment-option checks:
1. **Pre-orders off:** refused with `preorders_off` (409), "Pre-orders aren't available right now."
2. **Not a valid slot:** the time is not one of `pickup_slots(...)`, it is badly formed, or it is earlier than the earliest slot. Refused with `slot_unavailable` (422), "Pick one of the available times."
3. **Slot full:** the count is taken again under `SELECT … FOR UPDATE` on the branch row, so two orders can't both take the last place. If the slot is full the order is refused with `slot_full` (409), "That time just filled up. Pick another time."
4. **Stored:** `pickup_at` is the slot converted to UTC.

An idempotent retry returns the first order before any slot check, as today.

Paying is unchanged:
- **Online:** `pending_payment` until paid, then `placed`.
- **At the counter:** `placed` and unpaid at once.

In both cases the order is `placed` with `pickup_at` set, and the board decides whether it shows as later.

### Responses

- **`OrderSummary`, `OrderDetail` (staff):** gain `pickup_at: datetime | None` and `start_at: datetime | None`.
- **`TrackingOut`:** gains `pickup_at: datetime | None`.
- **`ShopOut`:** gains `preorders_enabled: bool` and `preorder_slot_limit: int`.
- **`SettingsPatch`:** gains `preorders_enabled: bool | None` and `preorder_slot_limit: int | None` (1 to 50). Changes are audited through the existing `settings_changed` entry.

### Due time everywhere (`app/orders/metrics.py`, tracking)

- **`running_late` and `extra_wait_minutes`:** "late" becomes `status in (placed, preparing)` and `due_at < now`. In SQL: `coalesce(pickup_at, placed_at + prep)`. Extra wait measures lateness from `due_at`.
- **Before its start time,** a pre-order counts as neither late nor open in the `open_orders` metric. `open_orders` counts orders the kitchen should be working on now.

### Board metrics

`QueueMetrics` gains:
- `preorders_today: int`: today's pre-orders that aren't cancelled
- `next_preorder_at: datetime | None`: the earliest `pickup_at` among those still `placed` and later

`orders_today` stays in the API, but the board card stops showing it.

### Day close

No change. A pre-order is for the same business day, so any left open at close are treated like other orders.

## 3. Frontend

### Owner settings (Settings → Online orders)

Under the payment options:
- **Pre-orders:** a switch, with help text "Customers can choose a pickup time later today."
- **Max pre-orders per 15 minutes:** a `NumberInput` from 1 to 50, shown when the switch is on.

### Customer checkout

The **Pickup** card shows two `ChoiceRow` radios when `preorders_enabled` and the slot list isn't empty:
- **"As soon as possible · ready around {time}"**: the existing estimate.
- **"Choose a time":** shows a grid of slot chips (`12:15`, `12:30`, …).
  - A full slot is disabled and shows "Full".
  - Choosing one sets `pickup_time`.
  - The slot list is fetched from `/shop/pickup-slots` when the choice opens, and refreshed every minute.

Otherwise the card is as today.
- **Submit:** "Choose a time" with no slot picked disables the pay or place button, with the hint "Pick a pickup time".
- **Errors:**
  - `slot_full` and `slot_unavailable` refetch the slots and show their message.
  - `preorders_off` refetches the shop.

### Customer tracking and Orders tab

- **Tracking heading:**
  - for a pre-order not ready yet: "Ready for pickup at {pickup time}"
  - once that time has passed and it's still not ready: "Running a little late. It won't be long."
  - **Ready** and later states are unchanged.
  - The kitchen-delay addition doesn't apply to pre-orders, because their time was chosen.
- **Orders tab:** a pre-order's row adds "For {time}".

### Staff board

- **"Later today" strip:** above the columns, shown when any order `is_later` (worked out on the client from `start_at` and the current time, re-checked every 30 seconds).
  - Each compact card shows `#003 · For 12:30 · starts 12:15`, the items, the total, an "Unpaid" label if relevant, and a **Start early** button.
  - **Start early** is the existing Start Cooking: `placed → preparing`, which also claims it.
- **Columns:** later orders don't appear in New until `now ≥ start_at`. Then they show with a "For 12:30" badge.
- **New-order sound and flash:** fire when a pre-order enters New, not when it is placed into Later. `useNewOrderAlert` is given only the orders in the columns.
- **Metric card:** "Orders today" is replaced by **"Pre-orders today"** with the value `preorders_today` and the subtitle "Next at {time}", or "None waiting".
- **Order page and search:** "For {time}" next to the status.

### Text

All new text is in English and Malay. `npm run check:i18n` must pass.

## 4. Error handling

- **The owner switches pre-orders off.** Existing pre-orders stay and are cooked as normal; only new ones are refused.
- **The owner lowers the slot limit below a slot's bookings.** Existing bookings stay. The slot shows full until it drops below the limit.
- **The kitchen delay grows after a pre-order is placed.** The pickup time doesn't move. If the kitchen falls behind, the order becomes late against its pickup time like any other.
- **The customer's clock is wrong.** All times come from the server's slot list in the shop's timezone; the browser only displays them.
- **Prep time is longer than the time until pickup.** The order can't be placed, because the earliest slot already accounts for prep time.

## 5. Testing

**Backend (pytest, MySQL test DB):**
- **Slots (pure-ish, with an explicit `now`):**
  - the earliest slot is rounded up from now + prep + extra
  - the latest is the window's close
  - overnight windows are handled
  - all-day shops end at day close
  - the list is empty when pre-orders are off, the shop is paused, or it's after the last slot
- **Slot limit:**
  - a full slot is marked unavailable and placing into it gives `slot_full`
  - a cancelled pre-order frees its place
  - an unpaid online pre-order holds its place until it expires
- **Placing:**
  - an online pre-order is pending then `placed` with `pickup_at`
  - a pay-at-counter pre-order is `placed` and unpaid with `pickup_at`
  - a bad, past or off-grid time gives `slot_unavailable`
  - pre-orders off gives `preorders_off`
  - an idempotent retry returns the same order
- **Due time:**
  - a pre-order placed long before its time isn't running late and doesn't raise the extra wait
  - after its pickup time, still unpaid or not ready, it is late
- **Metrics:** `preorders_today` and `next_preorder_at`.
- **Tracking and staff responses:** they carry `pickup_at`, and staff responses carry `start_at`.
- **Settings:** the PATCH audits the two new fields, and the limit is validated to 1–50.

**Frontend:**
- `npm run typecheck`, `npm run check:i18n`, `npm run build`
- **Browser check:**
  - the owner turns pre-orders on with a limit of 1
  - a customer picks a slot, and a second customer sees that slot "Full"
  - the board shows the pre-order in Later today, with Start early working
  - after moving the order's `pickup_at` close in dev data, it moves into New and the sound fires
  - tracking shows "Ready for pickup at …"
  - in EN and BM

## 6. Build order

1. **Data, timing helpers, settings and the slots endpoint** (backend, TDD).
2. **Placing pre-orders with slot checks; `pickup_at`/`start_at` in responses** (backend, TDD).
3. **Due time in late and busy figures; board metrics** (backend, TDD).
4. **Frontend: owner settings, checkout time choice, tracking and Orders tab.**
5. **Frontend: board Later today strip, auto-move, labels, metric card,** then full checks.
