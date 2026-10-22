# Pay at the counter: design

- **Date:** 2026-10-22
- **Status:** approved in brainstorming, awaiting spec review
- **Sub-project:** "pay at counter", set aside in the customer redesign (`2026-10-21-customer-redesign-design.md`, Scope)

## Goal

Let a shop take online orders without an online payment gateway. The customer orders on their phone and pays by QR (DuitNow) or cash when they collect. In Malaysia most customers prefer QR or cash, and the shop can start taking phone orders before it has a merchant account. The owner chooses which payment options customers see.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Payment options | The owner chooses: **Pay online** (only once a gateway is set up) and/or **Pay at the counter (QR or cash)**. |
| When the kitchen starts | **Straight away, with limits.** A pay-at-counter order goes to the kitchen at once, like a paid one. |
| Limits | The mobile number is required for pay at the counter. Only **one unpaid order per number** at a time. Staff can cancel a no-show. |
| Approach | The order is placed **unpaid**; staff record the payment at pickup with a **Take payment** step. Rejected: a pretend "counter gateway" that marks orders paid at once (reports would count money not collected), and holding orders until staff accept them (the user chose straight away). |

**Assumptions:**
- **The customer doesn't pick QR or cash in the app.** Staff record the real method when payment is taken.
- **The app doesn't show the shop's DuitNow QR code.** Customers scan the QR at the counter as they do today.

## Scope

**In:**
- owner switches for Pay online and Pay at the counter
- online ordering allowed when either is on
- checkout payment choice, with the mobile number required for pay at the counter
- placing an unpaid order straight into the kitchen
- one-unpaid-order limit per number
- an unpaid notice on tracking
- the staff "Unpaid" label, Take payment, and collect-needs-payment
- a no-show cancel reason
- day close skipping unpaid orders
- a Needs attention entry for leftover unpaid orders
- reports counting the order once paid

**Out:**
- showing a QR code in the app
- customers choosing QR vs cash
- deposits or partial payment
- SMS or WhatsApp reminders
- banning repeat no-show numbers
- pre-orders for later times

## 1. Data

### New columns (one Alembic migration)

| Table | Column | Type | Meaning |
|---|---|---|---|
| `branches` | `pay_online` | `Boolean`, not null, default true | Owner allows paying online. It only takes effect when the gateway is set up (`PAYMENT_GATEWAY` not `none`). |
| `branches` | `pay_at_counter` | `Boolean`, not null, default false | Owner allows online orders paid at the counter. |
| `orders` | `pay_at_counter` | `Boolean`, not null, default false | This online order is paid at the counter. Set when the order is created and never changed. |

Existing rows: branches get `pay_online = true` and `pay_at_counter = false`, so nothing changes until the owner switches the new option on. Existing orders get `false`.

## 2. Backend

### When online ordering is possible (`app/shop/service.py`)

- `online_payment_ready(branch) = settings.online_payments_enabled and branch.pay_online`
- `takes_online_orders(branch) = is_open(branch) and branch.is_accepting_online_orders and (online_payment_ready(branch) or branch.pay_at_counter)`
- `set_online_orders` (the staff pause switch) no longer refuses with `online_payments_off` when `pay_at_counter` is on. It still refuses when neither option is available. The error is renamed `no_payment_option`, with the message "Turn on a payment option in Settings first."

### Shop endpoints (`ShopOut`)

`ShopOut` gains:
- `pay_online_available: bool`: the gateway is set up and `branch.pay_online` is on.
- `pay_at_counter: bool`
- `pay_online_enabled: bool`: the owner's own switch, for the Settings page.

The existing `online_payments_enabled` stays and means "a gateway is set up". This is public data about the shop's options only; no amounts, no order data.

`SettingsPatch` gains `pay_online: bool | None` and `pay_at_counter: bool | None`. Changes are audited like other settings, with the existing settings audit entry and these fields in its before/after.

### Placing an online order (`app/orders/service.py`, `OnlineOrderIn`)

`OnlineOrderIn` gains `pay_at_counter: bool = False`.
- **Pay online chosen** (`pay_at_counter` false): unchanged. The order is created `pending_payment` and the payment starts. Refused with `payment_option_off` (409) if online payment isn't available.
- **Pay at the counter chosen:**
  - Refused with `payment_option_off` (409) if the branch has `pay_at_counter` off.
  - **Phone required:** a missing or invalid phone returns `invalid_phone` (422) with the field error.
  - **Limit:** if this phone already has an order with `pay_at_counter = true`, `payment_status = 'unpaid'` and a status in `placed`, `preparing` or `ready`, it is refused with `unpaid_at_counter` (429). The message is "You already have an order waiting to be paid at the counter."
  - **Created:** the order is created with `status = placed`, `placed_at = now`, `payment_status = 'unpaid'`, `pay_at_counter = true`. No payment is started, and `payment_url` is `None`.
  - **Records:** `record_creation` with actor customer, like today. The idempotency key works as today.
- The existing rate limit and `too_many_unpaid` check (pending online payments) stay as they are.

### Taking payment (new staff endpoint)

`POST /staff/orders/{id}/payment`, body `{ method: "cash" | "qr_counter" | "card_terminal", tendered_sen?: int }`, for staff and admin.
- **Refusals:**
  - the order isn't `payment_status = 'unpaid'` with `pay_at_counter = true` → 409 `not_unpaid`
  - the order is `cancelled` → 409 `invalid_transition`
  - cash with `tendered_sen` below the total → 422 `insufficient_cash`, as in counter orders
- **On success:**
  - Adds a `Payment(kind="charge", method, amount_sen=total, status="succeeded", paid_at=now, recorded_by_user_id=user)`. `raw_payload` holds `tendered_sen` and `change_sen`, as in counter orders.
  - Sets `order.payment_status = 'paid'`.
  - Writes an audit entry, `payment_taken`.
- **Returns** the updated `OrderSummary` plus `change_sen`.
- **Repeats:** an `Idempotency-Key` header is accepted. A repeat with the same key returns the same result without a second payment.

### Collected needs payment (`app/orders/state_machine.py` / transition service)

- **Collected needs payment.** A transition to `completed` for an order with `pay_at_counter = true` and `payment_status = 'unpaid'` is refused with 409 `payment_needed`. Other transitions are unchanged.
- **No-show cancel.** Cancelling an unpaid pay-at-counter order is allowed for staff and admin. There is no refund step, since nothing was paid. The cancel modal's quick reasons gain "Didn't come to collect" (`cancel.reasons.noShow`).

### Day close (`app/jobs.py`)

`close_day` skips `ready` orders with `pay_at_counter = true` and `payment_status = 'unpaid'`. They stay open.

### Needs attention (`app/reports/queries.py`)

New `Attention.kind = "unpaid_at_counter"` for pay-at-counter orders that:
- are still unpaid
- are not cancelled
- have a `business_date` earlier than today

`since` is `placed_at`.

### Reports

No rule changes. Sales already count only `payment_status = 'paid'` orders by `business_date`. A pay-at-counter order counts once payment is taken, under the payment's real method. Cancelled no-shows are excluded as today.

## 3. Frontend

### Owner settings (`SettingsPage`, Online orders section)

- **Pay online:**
  - a switch when `online_payments_enabled`
  - otherwise a disabled row reading "Not set up yet. Ask your developer to connect a payment gateway."
- **Pay at the counter (QR or cash):** a switch, with help text "Customers order on their phone and pay when they collect. A mobile number is required."
- **Both off:** a warning, "Customers can't order online until a payment option is on."

### Customer checkout (`CheckoutPage`)

- **Payment card:**
  - both options available: two `ChoiceRow` radios, "Pay now online" and "Pay at the counter (QR or cash)". The first available one is preselected.
  - one option available: it is shown as plain text.
- **Pay at the counter selected:**
  - the Mobile field becomes required (the label loses "Optional"; an empty field shows "Needed so the shop can reach you")
  - the button reads "Place order · RM12.50"
  - `customer.pickupOnly` becomes "Pay by QR or cash when you collect."
- **Submit:** sends `pay_at_counter`.
- **New error:** `unpaid_at_counter` shows its message.
- **Redirect:** with no `payment_url`, the existing redirect to `/t/{token}` applies.

### Customer tracking (`OrderPage`)

An unpaid pay-at-counter order that isn't cancelled shows an amber card above the timeline: "Pay RM12.50 by QR or cash when you collect." The heading and timeline work as for paid orders.

### Orders tab (`RecentOrders`)

An unpaid pay-at-counter order keeps its kitchen status badge. It is not shown as "Awaiting payment", which is for pending online payments.

### Staff

- **Board cards and order lists** (`OrderCard`, Search): an orange "Unpaid · RM12.50" label on unpaid pay-at-counter orders.
- **Order page:**
  - a **Take payment** button opens the existing `PaymentModal` (Cash with amount given and change, QR, Card) and calls the new endpoint
  - **Collected** on an unpaid order opens Take payment first, then completes the order
- **Cancel modal:** the new quick reason. No refund step for unpaid orders, as today.
- **Dashboard Needs attention:** a row for `unpaid_at_counter`, "Unpaid order from {date}: take payment or cancel it."

### Text

All new text is in English and Malay. `npm run check:i18n` must pass.

## 4. Error handling

- **The owner switches pay at the counter off while orders are open.** Open pay-at-counter orders are unaffected; staff still take payment as normal.
- **The customer's checkout page is stale and the option has been switched off since.** They get `payment_option_off`; the page refetches the shop and shows "This payment option isn't available any more."
- **Two staff press Take payment at once.** The order row is locked (`SELECT … FOR UPDATE`), so the second gets `not_unpaid` and the order is paid once.
- **Order completed some other way.** A completed order can't be unpaid with pay at the counter, because the transition and day close both refuse it.

## 5. Testing

**Backend (pytest, MySQL test DB):**
- **When ordering is possible:**
  - with gateway `none` and `pay_at_counter` on, `can_order_online` is true
  - with both off, it is false and the staff resume switch gives `no_payment_option`
  - `pay_online` off with a gateway set up hides the online option
- **Placing:**
  - a pay-at-counter order is `placed` and unpaid, with no payment URL
  - a missing phone gives 422
  - a second unpaid order on the same number gives `unpaid_at_counter`
  - after the first is paid or cancelled, a new one is allowed
  - pay online when it's off gives `payment_option_off`
- **Take payment:**
  - cash with change, and QR, record the payment and mark the order paid
  - a second take-payment gives `not_unpaid`
  - insufficient cash gives 422
  - a paid order, or a cancelled one, is refused
- **Collected needs payment:** completing an unpaid order gives `payment_needed`; once paid, it completes.
- **No-show:** an unpaid order cancels without a refund and doesn't count in sales.
- **Day close** leaves an unpaid ready order open and still completes paid ones.
- **Needs attention** lists an unpaid order from yesterday.
- **Reports** count the order in sales only after payment, under the method used.
- **Settings:** the PATCH audits the two new switches.

**Frontend:**
- `npm run typecheck`, `npm run check:i18n`, `npm run build`
- **Browser check at phone width:**
  - owner switches on Pay at the counter with no gateway
  - customer orders and the mobile is required
  - tracking shows the pay notice
  - staff see Unpaid, take a cash payment with change, and mark the order collected
  - a no-show cancel
  - in EN and BM

## 6. Build order

1. **Migration and options (backend, TDD):** columns, `takes_online_orders`, `ShopOut`, `SettingsPatch` and the pause switch.
2. **Placing pay-at-counter orders and the limit (backend, TDD).**
3. **Take payment, collected needs payment, no-show, day close, Needs attention (backend, TDD).**
4. **Frontend owner and customer:** Settings switches, checkout choice, tracking notice, Orders tab.
5. **Frontend staff:** Unpaid label, Take payment, collect flow, cancel reason, dashboard row. Then full checks.
