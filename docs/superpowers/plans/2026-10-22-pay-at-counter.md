# Pay at the Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers order online and pay by QR or cash at pickup, without an online payment gateway. The owner chooses which payment options are on.

**Architecture:**
- **Owner switches:** two switches on `branches` decide what customers may choose.
- **Placing:** a pay-at-counter order is created `placed` and unpaid, and goes straight to the kitchen.
- **Paying:** staff record the payment later through a new take-payment endpoint, which reuses counter-order payment rules.
- **Guards:** completion, day close and Needs attention respect unpaid orders.
- **Frontend:** adds the switches, the checkout choice, the tracking notice and the staff payment steps.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, MySQL 8, pytest; React 19, Mantine 9, TanStack Query, i18next.

**Spec:** `docs/superpowers/specs/2026-10-22-pay-at-counter-design.md`

## Global Constraints

- **Columns:**
  - `branches.pay_online`: Boolean, not null, server default true.
  - `branches.pay_at_counter`: Boolean, not null, server default false.
  - `orders.pay_at_counter`: Boolean, not null, server default false. It never changes after the order is created.
- **Who may order online:**
  - `online_payment_ready(branch) = settings.online_payments_enabled and branch.pay_online`
  - `online_ordering_available(branch) = online_payment_ready(branch) or branch.pay_at_counter`
  - `takes_online_orders(branch) = is_open and is_accepting_online_orders and online_ordering_available`
- **Unpaid at counter** means `pay_at_counter = true` and `payment_status = 'unpaid'`. An open one also has status in `placed`, `preparing` or `ready`.
- **Error codes:**

  | Code | Status | Message |
  |---|---|---|
  | `no_payment_option` | 409 | "Turn on a payment option in Settings first." |
  | `payment_option_off` | 409 | "This payment option isn't available any more." |
  | `unpaid_at_counter` | 429 | "You already have an order waiting to be paid at the counter." |
  | `not_unpaid` | 409 | "This order has already been paid." |
  | `payment_needed` | 409 | "Take payment before marking this order collected." |
  | `invalid_phone` | 422 | (existing) |
  | `insufficient_cash` | 422 | (existing) |

- **Payment methods** for taking payment: `cash`, `qr_counter`, `card_terminal`. The Payment row is shaped exactly like counter orders' (`kind="charge"`, `status="succeeded"`, `raw_payload` holds `tendered_sen` and `change_sen`).
- **Reports:** no query changes. Sales count `payment_status='paid'` only.
- **Text:** every new string goes in `frontend/src/locales/en.json` and `ms.json`, and `npm run check:i18n` must pass. Copy:

  | Key | EN | BM |
  |---|---|---|
  | `admin.settings.payOnline` | Pay online | Bayar dalam talian |
  | `admin.settings.payOnlineNotSetUp` | Not set up yet. Ask your developer to connect a payment gateway. | Belum disediakan. Minta pembangun anda sambungkan gerbang pembayaran. |
  | `admin.settings.payAtCounter` | Pay at the counter (QR or cash) | Bayar di kaunter (QR atau tunai) |
  | `admin.settings.payAtCounterHint` | Customers order on their phone and pay when they collect. A mobile number is required. | Pelanggan pesan di telefon dan bayar semasa mengambil. Nombor telefon diperlukan. |
  | `admin.settings.noPaymentOption` | Customers can't order online until a payment option is on. | Pelanggan tidak boleh pesan dalam talian sehingga satu pilihan pembayaran dihidupkan. |
  | `customer.payNowOnline` | Pay now online | Bayar sekarang dalam talian |
  | `customer.payAtCounter` | Pay at the counter (QR or cash) | Bayar di kaunter (QR atau tunai) |
  | `customer.payAtCounterNote` | Pay by QR or cash when you collect. | Bayar dengan QR atau tunai semasa mengambil. |
  | `customer.placeOrder` | Place order · {{total}} | Buat pesanan · {{total}} |
  | `customer.phoneNeeded` | Needed so the shop can reach you | Diperlukan supaya kedai boleh hubungi anda |
  | `customer.unpaidAtCounter` | You already have an order waiting to be paid at the counter. | Anda sudah ada pesanan yang menunggu bayaran di kaunter. |
  | `customer.paymentOptionOff` | This payment option isn't available any more. | Pilihan pembayaran ini tidak lagi tersedia. |
  | `tracking.payAtCounter` | Pay {{total}} by QR or cash when you collect. | Bayar {{total}} dengan QR atau tunai semasa mengambil. |
  | `order.unpaid` | Unpaid · {{total}} | Belum bayar · {{total}} |
  | `order.takePayment` | Take payment | Terima bayaran |
  | `cancel.reasons.noShow` | Didn't come to collect | Tidak datang mengambil |
  | `attention.unpaid_at_counter` | Unpaid order from {{date}}: take payment or cancel it. | Pesanan belum bayar dari {{date}}: terima bayaran atau batalkan. |

  Follow the file's existing key layout if `attention.*` or `order.*` live under another parent; keep the copy.
- **Tests:**
  - **Backend:** `docker compose up -d mysql` (port 3307), then `cd backend && uv run pytest -q`.
  - **Frontend:** `npm run typecheck && npm run check:i18n && npm run build`, plus a phone-width browser check.
  - **API types:** after backend schema changes, run `cd frontend && npm run gen:types` and commit `src/api/schema.d.ts`. (`openapi.json` is gitignored.)
- **Commits:** on branch `pay-at-counter`. Stage by name, never `git add -A`. Each message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A paused shop, or a closed one, still refuses pay-at-counter orders** with `shop_closed`, exactly as for online-paid orders. Test: `test_pay_at_counter_respects_pause_and_hours` (Task 2).
2. **An idempotent retry of a pay-at-counter order** returns the same order. It must not be refused by the one-unpaid limit as a "second" order. Test: `test_same_key_retry_is_not_a_second_order` (Task 2).
3. **A no-show cancel needs no refund method.** Staff can cancel an unpaid order without a refund prompt, and it doesn't count in sales. Test: `test_no_show_cancel_needs_no_refund` (Task 3).
4. **Taking payment on a counter-paid or gateway-paid order is refused,** so money is never recorded twice. Test: `test_take_payment_refuses_paid_orders` (Task 3).
5. **The customer screens no longer treat "no gateway" as "counter only"** when pay at the counter is on. The menu shows no counter-only alert, the item page shows the add bar, and the cart allows checkout. Browser check in Task 4.

---

### Task 1: Payment options and switches (backend)

**Files:**
- Create: `backend/alembic/versions/20261022_b7e1d4c9a2f0_pay_at_counter.py` (revises `a4c9e2f7b310`)
- Create: `backend/tests/test_pay_at_counter.py`
- Modify:
  - `backend/app/models.py` (`Branch`, `Order`)
  - `backend/app/shop/service.py`
  - `backend/app/shop/schemas.py` (`ShopOut`, `SettingsPatch`)
  - `backend/app/reports/queries.py` (Dashboard flag)
  - `backend/app/reports/schemas.py` (`Dashboard`)

**Interfaces:**
- Produces:
  - `online_payment_ready(branch: Branch) -> bool`
  - `online_ordering_available(branch: Branch) -> bool`
  - `ShopOut` gains `pay_online_available: bool`, `pay_online_enabled: bool`, `pay_at_counter: bool`, `online_ordering_available: bool`
  - `SettingsPatch` gains `pay_online: bool | None`, `pay_at_counter: bool | None`
  - `Dashboard` gains `online_ordering_available: bool`
  - Model attributes `Branch.pay_online`, `Branch.pay_at_counter`, `Order.pay_at_counter`

- [ ] **Step 1: Write the failing tests** in `tests/test_pay_at_counter.py`.
  - Add a fixture `no_gateway(monkeypatch)` that sets `get_settings().payment_gateway = "none"`, the way `test_hardening.py:42` does.
  - Add a helper `counter_on(db, branch, on=True)` that sets `branch.pay_at_counter` and commits.
  - Tests:
    - `test_no_gateway_and_counter_off_means_no_online_orders`: `GET /shop` gives `can_order_online False` and `online_ordering_available False`. Resuming via `PATCH /staff/shop/online-orders {"accepting": true}` returns 409 `no_payment_option`.
    - `test_counter_payment_turns_online_ordering_on`: with `no_gateway`, `counter_on`, and the shop open, `GET /shop` has `can_order_online True`, `pay_at_counter True` and `pay_online_available False`. The staff pause/resume switch returns 200.
    - `test_owner_can_switch_off_online_payment`: with the fake gateway, PATCH `/admin/settings {"pay_online": false}`. Then `pay_online_available False`, `pay_online_enabled False`, and `can_order_online False` while the counter option is off.
    - `test_payment_switches_are_audited`: PATCH `{"pay_at_counter": true}` writes `settings_changed` with before `{"pay_at_counter": False}` and after `{"pay_at_counter": True}`.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_pay_at_counter.py -q`
  - Expected: FAIL (`KeyError`, or 409 where 200 is expected).

- [ ] **Step 3: Implement.**
  - Migration (three `add_column`s, matching downgrade) and the model attributes.
  - The two helpers. `takes_online_orders` uses them.
  - `set_online_orders` raises `no_payment_option` when resuming without `online_ordering_available` (it replaces the `online_payments_off` check).
  - `shop_out` fills the new fields.
  - `update_settings` needs no change: it writes any `SettingsPatch` field and audits it.
  - Dashboard's builder sets `online_ordering_available`.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.
  - Fix any existing test that expected `online_payments_off`, e.g. `test_hardening.py`. With counter off and no gateway it now expects `no_payment_option`. That error rename is a spec decision, not a regression.
  - Then run `uv run alembic upgrade head`.

- [ ] **Step 5: Commit.**
  - Message: `feat(shop): payment options, pay online and pay at the counter switches`.

### Task 2: Placing pay-at-counter orders (backend) and API types

**Files:**
- Modify:
  - `backend/app/orders/schemas.py` (`OnlineOrderIn`, `TrackingOut`, `OrderSummary`)
  - `backend/app/orders/service.py` (`create_online_order`, `summary`, tracking builder)
- Modify: `frontend/src/api/schema.d.ts` (generated)
- Test: `backend/tests/test_pay_at_counter.py`

**Interfaces:**
- Consumes: Task 1 helpers and `Order.pay_at_counter`.
- Produces:
  - `OnlineOrderIn.pay_at_counter: bool = False`
  - `TrackingOut.pay_at_counter: bool = False`
  - `OrderSummary.pay_at_counter: bool`
  - `OnlineOrderOut.payment_url` is `None` for pay-at-counter orders

- [ ] **Step 1: Write the failing tests.**
  - Reuse `place()` from `tests/test_online.py`; import it or copy the helper. Pass `pay_at_counter=True` through `**over`.
  - All tests use `no_gateway` and `counter_on`.
  - Tests:
    - `test_counter_order_goes_straight_to_the_kitchen`: status 201.
      - Tracking shows `status "placed"`, `payment_status "unpaid"`, `pay_at_counter True`, and `payment_url` is `None`.
      - The order appears on `GET /staff/orders/board`, or whatever path `test_online.py` uses for the board, with `pay_at_counter True`.
    - `test_counter_order_needs_a_phone`:
      - `phone=None` gives 422 `invalid_phone`
      - `phone="12"` gives 422
    - `test_one_unpaid_counter_order_per_phone`:
      - a second order on the same phone gives 429 `unpaid_at_counter`
      - a different phone works
      - after the first is cancelled by staff (reason "x"), the same phone works again
    - `test_same_key_retry_is_not_a_second_order`: repeating the same `Idempotency-Key` returns 201 or 200 with the same `order_code`.
    - `test_pay_at_counter_respects_pause_and_hours`:
      - with `is_accepting_online_orders False`, the response is 409 `shop_closed`
      - with `opening_hours` set to `{}`, it is also 409
    - `test_option_that_is_off_is_refused`:
      - with counter off and the fake gateway, `pay_at_counter=True` gives 409 `payment_option_off`
      - with `no_gateway` and counter on, `pay_at_counter=False` also gives 409 `payment_option_off`

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_pay_at_counter.py -q`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement in `create_online_order`.**
  - **Order of checks:**
    1. idempotency lookup
    2. `takes_online_orders`, else `shop_closed`
    3. rate limit
    4. option check: `payment_option_off`
    5. phone: required and valid when pay at counter
    6. limit: `unpaid_at_counter`, counting open unpaid-at-counter orders for that phone
    7. the existing `too_many_unpaid` check, for pending online payments only
    8. pricing
  - **Insert:** `status=sm.PLACED`, `placed_at=now`, `payment_status="unpaid"`, `pay_at_counter=True`. Do not call `payments.start_payment`; return `None` as the URL.
  - **Responses:** fill `pay_at_counter` in `summary()` and in the tracking builder.
  - Then run `cd ../frontend && npm run gen:types && npm run typecheck`. Fix any type error by passing the new field where a literal object needs it.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit.**
  - Files: backend files and `frontend/src/api/schema.d.ts`.
  - Message: `feat(orders): pay-at-counter orders go straight to the kitchen, one unpaid per number`.

### Task 3: Take payment, collect, no-show, day close, Needs attention (backend)

**Files:**
- Modify:
  - `backend/app/orders/schemas.py` (`TakePaymentIn`, `TakePaymentOut`)
  - `backend/app/orders/service.py` (`take_payment`, `move`)
  - `backend/app/orders/staff_router.py`
  - `backend/app/jobs.py` (`close_day`)
  - `backend/app/reports/queries.py`, `backend/app/reports/schemas.py` (`Attention.kind`)
- Test: `backend/tests/test_pay_at_counter.py`

**Interfaces:**
- Produces:
  - `POST /staff/orders/{id}/payment`
    - body `TakePaymentIn { method: Literal["cash","qr_counter","card_terminal"]; tendered_sen: int | None = None }`
    - optional `Idempotency-Key` header
    - returns `TakePaymentOut(OrderSummary) + change_sen: int | None`
  - `take_payment(db, order_id: int, user: User, body: TakePaymentIn, key: str | None, ip: str) -> tuple[Order, int | None]`
  - `Attention.kind` gains `"unpaid_at_counter"`

- [ ] **Step 1: Write the failing tests.**
  - Use a helper `counter_order_placed(client, db, branch, menu)` that does `no_gateway` + `counter_on` + `place(..., pay_at_counter=True)` and returns the order id via `staff_client` search or the db.
  - Tests:
    - `test_take_cash_payment_with_change`:
      - POST `{"method":"cash","tendered_sen":2000}` on a RM10 order gives 200, `change_sen 1000`, `payment_status "paid"`.
      - The Payment row has `method "cash"`, `recorded_by_user_id` set, and `raw_payload` `{"tendered_sen":2000,"change_sen":1000}`.
      - The audit log has `payment_taken`.
    - `test_take_qr_payment`: `{"method":"qr_counter"}` gives paid, `change_sen None`.
    - `test_take_payment_twice_is_refused`: the second POST with a new key gives 409 `not_unpaid`. Exactly one charge Payment exists.
    - `test_take_payment_same_key_is_one_payment`: two POSTs with the same key both succeed, and there is one Payment.
    - `test_take_payment_refuses_paid_orders`:
      - a counter order (`counter_order` from conftest) gives 409 `not_unpaid`
      - a cancelled unpaid counter-pay order gives 409 `invalid_transition`
    - `test_insufficient_cash`: `tendered_sen 500` gives 422 `insufficient_cash`.
    - `test_collect_needs_payment`:
      - transition `to "completed"` while unpaid gives 409 `payment_needed`
      - after take-payment it gives 200
      - `to "ready"` while unpaid is allowed
    - `test_no_show_cancel_needs_no_refund`:
      - cancel with `{"reason": "Didn't come to collect", "version": v}` and no `refund_method` gives 200
      - `/admin/reports` for today has `sales_sen` 0
    - `test_sales_count_after_payment`: before payment `sales_sen` is 0; after taking QR payment it is 1000. Use the same report endpoint and field names `test_reports.py` uses.
    - `test_day_close_leaves_unpaid_ready_orders_open`:
      - set the unpaid order to `ready`, and a paid counter order to `ready`
      - run `close_day(db)`
      - the unpaid one is still `ready`; the paid one is `completed`
    - `test_needs_attention_lists_yesterdays_unpaid_order`: set the unpaid order's `business_date` to yesterday. `/admin/dashboard` attention has an item with `kind "unpaid_at_counter"`.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_pay_at_counter.py -q`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **`take_payment`:**
    - Load the order with `select(Order).where(Order.id == order_id).with_for_update()`.
    - Then: an idempotency replay returns the stored result (keep it in the Payment's `raw_payload["idempotency_key"]` and look it up first). A cancelled order raises `invalid_transition`. An order not unpaid at counter raises `not_unpaid`.
    - Apply the cash rule as in `create_counter_order` (factor out a small `_cash_change(total, tendered) -> int` used by both).
    - Add the Payment, set `payment_status="paid"`, `audit(... "payment_taken" ...)`.
  - **`move`:** raise `payment_needed` when `body.to == "completed"` and the order is unpaid at counter.
  - **`cancel`:** needs no change. An unpaid order already skips the refund path; confirm with the test.
  - **`close_day`:** add `~(Order.pay_at_counter & (Order.payment_status == "unpaid"))` to the READY query.
  - **Attention:** select orders unpaid at counter with status not cancelled and `business_date < today`, kind `unpaid_at_counter`, `since=placed_at`.
  - Run `cd ../frontend && npm run gen:types`.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit.**
  - Message: `feat(orders): take payment at pickup, collect needs payment, no-shows, day close`.

### Task 4: Owner settings and customer screens (frontend)

**Files:**
- Modify:
  - `frontend/src/areas/staff/pages/SettingsPage.tsx`
  - `frontend/src/areas/staff/console/ConsoleLayout.tsx` (online switch condition)
  - `frontend/src/areas/staff/pages/DashboardPage.tsx` (flag)
  - `frontend/src/areas/customer/pages/MenuPage.tsx`, `CartPage.tsx`, `ItemPage.tsx`, `CheckoutPage.tsx`, `OrderPage.tsx`
  - `frontend/src/areas/customer/components/RecentOrders.tsx`
  - `frontend/src/api/` settings mutation, if `SettingsPatch` typing needs it
  - `frontend/src/locales/en.json`, `ms.json`

**Interfaces:**
- Consumes:
  - `ShopOut.pay_online_available`, `pay_online_enabled`, `pay_at_counter`, `online_ordering_available`
  - `OnlineOrderIn.pay_at_counter`
  - `TrackingOut.pay_at_counter`
  - `Dashboard.online_ordering_available`

- [ ] **Step 1: Replace "gateway set up" with "online ordering available".**
  - Every frontend place that reads `online_payments_enabled` to mean "can order online at all" now reads `online_ordering_available`:
    - the customer Menu counter-only alert
    - Cart
    - the Item page "Order at the counter" text
    - the console header online switch
    - the Settings online switch's `disabled`
    - the Dashboard card
  - Find them with `grep -rn online_payments_enabled frontend/src --include=*.tsx`.

- [ ] **Step 2: Settings.**
  - Under the online orders switch, add the Pay online row:
    - a switch bound to `pay_online_enabled` when `online_payments_enabled`
    - else a disabled row with `admin.settings.payOnlineNotSetUp`
  - Add the Pay at the counter switch with `admin.settings.payAtCounterHint`.
  - Both save through the existing settings PATCH mutation, then invalidate `["shop"]`.
  - When both are off, show an amber `Alert` with `admin.settings.noPaymentOption`.

- [ ] **Step 3: Checkout.**
  - **Options:** `options = [pay_online_available && "online", pay_at_counter && "counter"].filter(Boolean)`. `choice` state starts at `options[0]`.
  - **Payment card:**
    - two options: `ChoiceRow type="radio"` rows (`customer.payNowOnline` / `customer.payAtCounter`)
    - one option: its label as text
  - **When `choice === "counter"`:**
    - the phone `TextInput` is `required`, with `customer.phoneNeeded` as its error when empty after touch
    - `canSubmit` needs a valid phone
    - the button uses `customer.placeOrder`
    - `customer.pickupOnly` text becomes `customer.payAtCounterNote`
  - **Submit:** sends `pay_at_counter: choice === "counter"`.
  - **Error mapping:**
    - `unpaid_at_counter` shows `customer.unpaidAtCounter`
    - `payment_option_off` invalidates `["shop"]` and shows `customer.paymentOptionOff`

- [ ] **Step 4: Tracking and Orders tab.**
  - `OrderPage` shows an amber card (background `tokens.busyBg`) with `tracking.payAtCounter` when `order.pay_at_counter && order.payment_status === "unpaid" && order.status !== "cancelled"`. It goes above the timeline card.
  - `RecentOrders.statusOf` keeps `awaitingPayment` for `pending_payment` only. Unpaid pay-at-counter orders show their kitchen status, which is already the case. Confirm there's no regression.

- [ ] **Step 5: Verify.**
  - Run `npm run typecheck && npm run check:i18n && npm run build`. Expected: pass.
  - **Browser at 390px** (dev API with `PAYMENT_GATEWAY=fake`, owner switches pay_online off and pay_at_counter on):
    - Settings switches work
    - the menu shows no counter-only alert and the item page shows the add bar
    - checkout shows the single "Pay at the counter" option, needs the phone, and the button reads "Place order"
    - the order lands on tracking with the pay notice
    - a second order on the same phone shows the limit message
    - with both options on, the two radios appear
    - EN and BM
  - Restore the dev settings afterwards.

- [ ] **Step 6: Commit.**
  - Message: `feat(customer): pay at the counter at checkout, owner payment options`.

### Task 5: Staff payment steps (frontend)

**Files:**
- Modify:
  - `frontend/src/api/orders.ts` (`useTakePayment`)
  - `frontend/src/areas/staff/components/OrderCard.tsx`
  - `frontend/src/areas/staff/pages/OrderPage.tsx`
  - `frontend/src/areas/staff/pages/SearchPage.tsx` (label)
  - `frontend/src/areas/staff/components/CancelOrderModal.tsx`
  - `frontend/src/areas/staff/pages/DashboardPage.tsx` (attention row)
  - locales

**Interfaces:**
- Consumes:
  - `POST /staff/orders/{id}/payment`
  - `OrderSummary.pay_at_counter`
  - `PaymentModal({ opened, totalSen, busy, initialMethod, onClose, onConfirm })`
  - `Attention.kind "unpaid_at_counter"`
- Produces: `useTakePayment(): UseMutationResult<TakePaymentOut, unknown, { id: number; method: PaymentMethod; tenderedSen: number | null; key: string }>`. It invalidates the board and order queries on success.

- [ ] **Step 1: The hook and the label.**
  - Add `useTakePayment` beside `useTransition`, sending the key as `Idempotency-Key`.
  - `OrderCard` and the Search results show an orange `Badge` `order.unpaid` (`formatSen(total)`) when `pay_at_counter && payment_status === "unpaid"`.

- [ ] **Step 2: Order page.**
  - **Take payment:** when unpaid at counter and not cancelled, show a primary **Take payment** button. It opens `PaymentModal` and on confirm calls `useTakePayment`. For cash it shows the change, the same way TakeOrderPage shows change after a cash sale.
  - **Collected:** if the order is unpaid at counter, the Collected action opens `PaymentModal` first. On success it runs the existing completed transition.
  - **Errors:** `payment_needed` and `not_unpaid` responses refetch the order and show their message with the existing toast.

- [ ] **Step 3: Cancel and dashboard.**
  - Add `cancel.reasons.noShow` to `QUICK_REASONS` in `CancelOrderModal`.
  - The dashboard Needs attention row renders `attention.unpaid_at_counter`, with the date from `order.business_date` and a link to the order, as the other kinds do.

- [ ] **Step 4: Full checks.**
  - Run `cd backend && uv run pytest -q` and `cd ../frontend && npm run typecheck && npm run check:i18n && npm run build`. Expected: all pass.
  - **Browser:** a staff login at desktop width, plus the phone-width customer pages:
    - the Unpaid badge on the board
    - Take payment with cash shows the change, and the badge goes away
    - Collected on an unpaid order asks for payment first
    - no-show cancel with the new chip
    - an unpaid order from yesterday appears in Needs attention (set its `business_date` in the dev DB)
    - EN and BM

- [ ] **Step 5: Commit.**
  - Message: `feat(staff): take payment at pickup, unpaid label, no-show reason`.
