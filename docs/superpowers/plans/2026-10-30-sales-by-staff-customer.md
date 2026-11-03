# Sales by Staff and by Customer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two owner-only Sales Report tabs. By staff covers who cooked which sales. By customer covers online customers grouped by a masked phone number. Checkout's privacy text changes to match.

**Architecture:**
- **By staff:** the `staff` rows join the existing `GET /admin/reports` response, built from `_sales()` grouped by `claimed_by_user_id`.
- **By customer:** a new `GET /admin/reports/customers` groups online sales orders by `customer_phone`, masks every phone with `mask_phone()` on the server, and returns the top 50.
- **Frontend:** adds two tabs to `SalesReportPage` and a `useCustomerReport` hook.

**Tech Stack:** FastAPI, SQLAlchemy 2, MySQL 8, pytest; React 19, Mantine 9, TanStack Query, i18next.

**Spec:** `docs/superpowers/specs/2026-10-30-sales-by-staff-customer-design.md`

## Global Constraints

- **Sales base:** `_sales(branch, start, end)`. That is status in `SALES_STATUSES`, `payment_status == 'paid'`, and `business_date` in range. Customer rows also need `channel == "online"` and `customer_phone IS NOT NULL`.
- **Masking:** `mask_phone("+60123456789") == "012-***6789"`. Prefix `0` to the digits after `+60`, keep the first 3 and last 4, and put `***` between. Fewer than 7 digits gives `"***"`.
  - No customer response model has a field holding the full phone.
- **Percentages:** 1 decimal, `None` when the denominator is 0. Money is integer sen.
- **Customer rows:** top 50, `sort` ∈ `spent` (default) | `orders` | `last`.
- **Staff rows:** sorted by `sales_sen` descending, with Unassigned (`user_id None`) last.
- **Owner-only:** both endpoints use `AdminUser`, so staff get 403.
- **Text:** every new string goes in `en.json` and `ms.json`, and `npm run check:i18n` must pass. Copy:

  | Key | EN | BM |
  |---|---|---|
  | `console.report.byStaff` | By staff | Ikut pekerja |
  | `console.report.byCustomer` | By customer | Ikut pelanggan |
  | `console.report.staff` | Staff | Pekerja |
  | `console.report.ordersCooked` | Orders cooked | Pesanan dimasak |
  | `console.report.share` | Share | Bahagian |
  | `console.report.avgCook` | Avg cook time | Purata masa masak |
  | `console.report.unassigned` | Unassigned | Tiada penama |
  | `console.report.customers` | Customers | Pelanggan |
  | `console.report.returning` | Returning | Pelanggan tetap |
  | `console.report.repeatRate` | {{pct}}% came back | {{pct}}% datang semula |
  | `console.report.spendPerCustomer` | Spend per customer | Belanja setiap pelanggan |
  | `console.report.phoneGiven` | Phone given | Nombor diberi |
  | `console.report.phoneCoverage` | on {{pct}}% of online orders | pada {{pct}}% pesanan dalam talian |
  | `console.report.customer` | Customer | Pelanggan |
  | `console.report.spent` | Spent | Dibelanjakan |
  | `console.report.lastVisit` | Last visit | Kunjungan terakhir |
  | `console.report.new` | New | Baharu |
  | `console.report.customerNote` | Online orders where a phone number was given. Numbers are partly hidden. | Pesanan dalam talian yang memberi nombor telefon. Nombor disembunyikan sebahagian. |

  `customer.privacy` becomes the EN/BM text in spec §2, verbatim.
- **Tests:**
  - **Backend:** MySQL test DB on :3307, then `cd backend && uv run pytest -q`.
  - **Frontend:** `npm run typecheck && npm run check:i18n && npm run build`, plus a browser check.
  - **API types:** `npm run gen:types` after schema changes, then commit `src/api/schema.d.ts`.
- **Commits:** on branch `sales-by-staff-customer`. Stage by name. Do not push until the user approves the merge. Each message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An order cooked in the range but paid later** (pay at the counter, paid the next day) is counted by `business_date` like every other sales figure, so the staff rows still sum to `totals.sales_sen`. Test: `test_staff_rows_sum_to_sales` (Task 1) includes a pay-at-counter order paid after cooking.
2. **The same customer with two different name spellings** groups as one row by phone, and the first name comes from the latest order. Test: `test_customer_name_from_latest_order` (Task 2).
3. **A customer whose only earlier order was cancelled or unpaid** is still "New", because only sales orders count as history. Test: `test_unpaid_history_does_not_make_returning` (Task 2).
4. **Responses never contain a full number.** No customer JSON contains `+60` or the 10-digit local number. Test: `test_full_phone_never_in_response` (Task 2), which asserts on the raw response text.
5. **A range with sales but no phones at all** gives `customers 0`, `repeat_rate_pct None`, `spend_per_customer_sen None` and `phone_coverage_pct 0.0`, with no division errors. Test: `test_no_phones_in_range` (Task 2).

---

### Task 1: Staff rows in the report (backend)

**Files:**
- Modify: `backend/app/reports/schemas.py` (`StaffRow`, `Report.staff`), `backend/app/reports/queries.py` (`staff()`, `report()`)
- Create: `backend/tests/test_report_people.py`

**Interfaces:**
- **Produces:**
  - `StaffRow(user_id: int | None, name: str | None, orders: int, sales_sen: int, share_pct: float | None, avg_cook_minutes: float | None)`
  - `Report.staff: list[StaffRow]`
  - `staff(db, branch, start: date, end: date) -> list[StaffRow]`

- [ ] **Step 1: Write the failing tests** in `tests/test_report_people.py`.
  - Use `counter_order`, `login`, the `staff` / `admin` fixtures, and a second staff user created with `conftest._user`.
  - Claim through `POST /staff/orders/{id}/claim` or the transition to `preparing`; both set `claimed_by_user_id`.
  - Tests:
    - `test_staff_rows_sum_to_sales`:
      - setup: staff A cooks two orders (RM10 + RM4.50), staff B cooks one (RM4.50), and one order is never claimed. Also a pay-at-counter online order, cooked by A, that gets paid via take-payment after it is `ready` (reuse fixtures from `test_pay_at_counter.py`)
      - rows are ordered A, B, Unassigned
      - `sum(r.sales_sen) == totals.sales_sen`
      - A's `orders` is 3
      - Unassigned has `user_id None` and `name None`
    - `test_staff_excludes_cancelled_and_unpaid`:
      - a claimed then cancelled order (refund cash) is not counted
      - an unpaid pay-at-counter order cooked but not yet paid is not counted
    - `test_avg_cook_minutes`: two orders by A with `preparing_at`→`ready_at` of 10 and 20 minutes (set with `update(Order)`) give `avg_cook_minutes == 15.0`.
    - `test_share_pct`: A has RM10 out of RM20 total, so `share_pct == 50.0`.
    - `test_staff_report_is_owner_only`: a staff login gets 403 from `/admin/reports`. The existing behaviour is restated here for the new field.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_report_people.py -q`
  - Expected: FAIL (`KeyError: 'staff'`).

- [ ] **Step 3: Implement.**
  - **`staff()`:**
    - One query over `Order` with `*_sales(...)`, grouped by `claimed_by_user_id`, selecting `count`, `sum(total_sen)` and the average of `TIMESTAMPDIFF(SECOND, preparing_at, ready_at)` where both are set.
    - Join `User` with an outer join for names.
    - `share_pct` comes from `totals.sales_sen`, computed in Python from the rows' sum, which equals it by construction.
  - **`report()`:** fills `staff=staff(...)`.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit.**
  - Message: `feat(reports): sales by staff, credited to who cooked`.

### Task 2: Customers endpoint and masking (backend) and API types

**Files:**
- Modify: `backend/app/reports/schemas.py` (`CustomerRow`, `CustomerReport`, `CustomerQuery`), `backend/app/reports/queries.py` (`customers()`), `backend/app/reports/admin_router.py`
- Create: `backend/app/reports/masking.py`
- Modify: `frontend/src/api/schema.d.ts` (generated)
- Test: `backend/tests/test_report_people.py`

**Interfaces:**
- **Produces:**
  - `mask_phone(e164: str) -> str` in `app/reports/masking.py`
  - `CustomerQuery(Range)`, adding `sort: Literal["spent","orders","last"] = "spent"`
  - `CustomerRow(phone_masked: str, first_name: str | None, orders: int, spent_sen: int, last_order_at: datetime, is_new: bool)`
  - `CustomerReport(date_from: date, date_to: date, customers: int, returning: int, repeat_rate_pct: float | None, spend_per_customer_sen: int | None, phone_coverage_pct: float | None, rows: list[CustomerRow])`
  - `customers(db, branch, q: CustomerQuery) -> CustomerReport`
  - `GET /admin/reports/customers` with response model `CustomerReport`

- [ ] **Step 1: Write the failing tests.**
  - Place online orders with phones using `place()` + `webhook()` from `test_online.py` (paid online), or the pay-at-counter path with a take-payment. Move `business_date` with `update(Order)` for "earlier" history.
  - Tests:
    - `test_mask_phone`:
      - `mask_phone("+60123456789") == "012-***6789"`
      - `mask_phone("+6031234567") == "031-***4567"`
      - `mask_phone("+60123") == "***"`
    - `test_customers_grouped_by_phone`: two orders from 012-345 6789 and one from 013-222 3333, all today.
      - `customers == 2`
      - the top row by spent is the 012 number with `orders == 2`
      - `rows[0].phone_masked == "012-***6789"`
    - `test_new_and_returning`: one phone with a paid order 10 days ago and another today, plus one phone with only today.
      - The range is today, so `returning == 1`, `repeat_rate_pct == 50.0`
      - `is_new` is False for the first phone and True for the second
    - `test_unpaid_history_does_not_make_returning`: an earlier order from that phone that is cancelled, or never paid, still leaves today's customer `is_new True` and `returning 0`.
    - `test_customer_name_from_latest_order`: the same phone ordered as "Farah Aziz" earlier today and "Fara" later gives `first_name == "Fara"`.
    - `test_counter_orders_ignored_and_coverage`:
      - a counter order with a `customer_name` is not a customer
      - with 2 online sales orders, one with a phone and one without (pass `phone=None` to `place`), `phone_coverage_pct == 50.0`
    - `test_no_phones_in_range`:
      - only counter sales gives `customers == 0`, `repeat_rate_pct is None`, `spend_per_customer_sen is None`, and `phone_coverage_pct is None` (no online orders)
      - one online order without a phone gives `phone_coverage_pct == 0.0`
    - `test_sort_and_limit`: 52 distinct phones, each with one order (insert directly with `Order` rows copied from a placed order, or by a loop of `place`; direct insert is faster).
      - `len(rows) == 50`
      - `sort=orders` and `sort=last` order correctly on a 3-row case
    - `test_full_phone_never_in_response`:
      - the raw `r.text` contains neither `"+60123456789"` nor `"0123456789"`
      - every row has exactly the keys `{"phone_masked","first_name","orders","spent_sen","last_order_at","is_new"}`
    - `test_customer_report_owner_only`: a staff login gets 403.

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_report_people.py -q`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **`mask_phone`:** as specified in Global Constraints.
  - **`customers()`:**
    - **Base:** `_sales(...)` with `channel=="online"` and a non-null `customer_phone`, grouped by `customer_phone`, taking `count`, `sum(total_sen)` and `max(placed_at)`.
    - **First name:** for each phone in the top 50, the latest non-empty `customer_name` within the range, first word. Use one query over those phones, ordered by `placed_at desc`, and keep the first per phone.
    - **New or returning:** phones with any order before `date_from` that passes the `_sales` filters (paid, sales statuses), using a `business_date < date_from` variant of `_sales` with no lower bound. Compute it with one `IN (...)` query over all the range's phones.
    - **Coverage:** online sales orders with a phone divided by all online sales orders.
  - **Router:** `GET /reports/customers`, taking `q: Annotated[schemas.CustomerQuery, Query()]` and admin only.
  - Then run `cd ../frontend && npm run gen:types && npm run typecheck`.

- [ ] **Step 4: Run the suite.**
  - Run `uv run pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit.**
  - Message: `feat(reports): returning customers by masked phone number`.

### Task 3: The two tabs and the privacy text (frontend)

**Files:**
- Modify: `frontend/src/api/admin.ts` (`useCustomerReport`), `frontend/src/areas/staff/pages/SalesReportPage.tsx`, `frontend/src/locales/en.json`, `ms.json`

**Interfaces:**
- **Consumes:** `Report.staff`, `GET /admin/reports/customers`.
- **Produces:** `useCustomerReport(range: { date_from: string; date_to: string }, sort: "spent" | "orders" | "last", enabled: boolean)`, query key `["customer-report", range, sort]`.

- [ ] **Step 1: The hook and copy.**
  - Add the hook beside `useReport`, using the same `qs()`.
  - Add every key from the Global Constraints table, and replace `customer.privacy` in both languages.

- [ ] **Step 2: The By staff tab** (`value="staff"`, after By item).
  - A `Table` with Staff (name, or `console.report.unassigned`), Orders cooked, Sales (`formatSen`), Share (`{pct}%` or "—") and Avg cook time (`console.queue.metrics.minutes` with the rounded count, or "—").
  - An empty `report.staff` uses the page's existing empty text.

- [ ] **Step 3: The By customer tab** (`value="customer"`).
  - **Loading:** `enabled` only when this tab is active.
  - **Summary:** a `SimpleGrid` of four `MetricCard`s:
    - Customers (`customers`)
    - Returning (`returning`, with `console.report.repeatRate` when `repeat_rate_pct` isn't null)
    - Spend per customer (`formatSen` or "—")
    - Phone given (`console.report.phoneCoverage`, or "—")
  - **Sorting:** a `SegmentedControl` (Spent / Orders / Last visit).
  - **Table:** Customer (`phone_masked` · `first_name`), Orders, Spent, Last visit (`formatDateTime`), and a `console.report.new` badge.
  - **Footnote:** `console.report.customerNote`.

- [ ] **Step 4: Full checks.**
  - Run `cd backend && uv run pytest -q` and `cd ../frontend && npm run typecheck && npm run check:i18n && npm run build`. Expected: all pass.
  - **Browser** (temporary owner login, deactivated afterwards):
    - By staff shows the dev orders with names and Unassigned
    - By customer shows masked numbers, the New badge and the cards
    - sorting switches
    - BM labels
    - the checkout footer shows the new privacy text

- [ ] **Step 5: Commit.**
  - Message: `feat(staff): By staff and By customer report tabs; privacy text names returning customers`.
