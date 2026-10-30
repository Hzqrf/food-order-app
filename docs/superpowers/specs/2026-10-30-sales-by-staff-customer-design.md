# Sales by staff and by customer: design

- **Date:** 2026-10-30
- **Status:** approved in brainstorming, awaiting spec review
- **Sub-project:** 4 of 6 in the Staff Console programme (`2026-10-14-staff-console-redesign-design.md`): "Sales by staff and by customer: report tabs."

## Goal

Two new tabs on the owner's Sales Report.
- **By staff** shows how much each person cooked.
- **By customer** shows returning online customers, identified by a masked phone number.

The checkout privacy text changes so customers know their number is also used to recognise them when they come back.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Staff credit | **Who cooked it.** This is the staff member who pressed Take or Start Cooking (`orders.claimed_by_user_id`). Orders nobody claimed show as **Unassigned**. |
| Customers | **Masked list plus an updated notice.** The owner sees customers by masked phone (`012-***6789`) and first name. The checkout notice changes to say the number also recognises returning customers. |
| Approach | Staff rows join the existing report response. Customers get their own owner-only endpoint, loaded only when the tab opens. Phones are masked on the server. Rejected: putting everything in one response. It would make every report load heavier and make masking easier to get wrong. |

**Assumptions (part of the approved design):**
- **Same orders as Sales.** Both tabs count the orders that count as sales: status in `SALES_STATUSES` and paid, by `business_date`. So the staff totals equal the report's Sales figure.
- **Online only.** Customers are online orders with a phone number. Counter orders have no phone, so walk-ins stay anonymous.
- **Owner-only,** like the rest of the Sales Report.

## Scope

**In:**
- staff rows in the report
- the customers endpoint and its summary
- the two tabs
- server-side masking
- the new privacy text in EN and BM

**Out:**
- full phone numbers anywhere in reports
- customer profiles or notes
- marketing or messaging
- staff commission or pay
- counter-order customers
- CSV export of these tabs

## 1. Backend

### By staff (`app/reports/queries.py`, `schemas.Report`)

`Report` gains `staff: list[StaffRow]`.

```
StaffRow:
  user_id: int | None        # None = Unassigned
  name: str | None           # full_name; None for Unassigned
  orders: int                # sales orders they cooked in the range
  sales_sen: int             # sum of those orders' total_sen
  share_pct: float | None    # sales_sen / report sales, 1 decimal; None when sales is 0
  avg_cook_minutes: float | None  # mean (ready_at - preparing_at) where both are set, 1 decimal
```

- **Grouping:** by `claimed_by_user_id`, over `_sales(branch, start, end)`.
- **Sorting:** by `sales_sen` descending. The Unassigned row (if any) comes last.
- **Inactive staff** still show, by name, if they cooked orders in the range.
- **Totals:** the sum of `sales_sen` across rows equals the report's sales figure (`totals.sales_sen`, the existing field).

### By customer (new endpoint)

`GET /admin/reports/customers?date_from=&date_to=&sort=spent|orders|last` (admin only; staff get 403). `sort` defaults to `spent`. It returns:

```
CustomerReport:
  date_from, date_to: date
  customers: int              # distinct phones with a sales order in the range
  returning: int              # of those, phones with any sales order before date_from
  repeat_rate_pct: float | None   # returning / customers, 1 decimal
  spend_per_customer_sen: int | None  # sales of phone orders / customers
  phone_coverage_pct: float | None    # online sales orders with a phone / all online sales orders
  rows: list[CustomerRow]     # top 50 by sort
CustomerRow:
  phone_masked: str           # e.g. "012-***6789"
  first_name: str | None      # first word of the most recent non-empty customer_name
  orders: int
  spent_sen: int
  last_order_at: datetime     # latest placed_at in the range
  is_new: bool                # no sales order with this phone before date_from
```

- **Which orders count:** `_sales(...)` orders with `channel == "online"` and `customer_phone` not null. Phones are stored normalised (`+60XXXXXXXXX`), so grouping by the stored value is exact.
- **Masking:** `mask_phone(e164) -> str` turns `+60123456789` into `012-***6789`. It prefixes the trunk `0`, keeps the first 3 digits and the last 4, and puts `***` in between. Numbers shorter than 7 digits become `***`.
  - The full number is never placed in any response model. There is no field for it.
- **Range limits:** the same validation as `Range` (`date_to ≥ date_from`; the existing maximum span applies).

## 2. Frontend

### By staff tab (`SalesReportPage`)

- A table with columns Staff, Orders cooked, Sales, Share, and Avg cook time.
- The Unassigned row label is `console.report.unassigned`.
- An empty range shows the existing empty-state text.

### By customer tab

- **Data:** loaded with `useCustomerReport(range, sort)` only when the tab is active.
- **Summary:** four `MetricCard`s: Customers, Returning (with repeat rate), Spend per customer, and Phone given (with coverage %).
- **Table:** Customer (masked phone · first name), Orders, Spent, Last visit, and a "New" badge. Sorting uses a `SegmentedControl` (Spent / Orders / Last visit).
- **Footnote:** "Online orders where a phone number was given. Numbers are partly hidden."

### Checkout privacy text

`customer.privacy` changes in both languages:
- **EN:** "If you give a phone number, the shop uses it for this order and to recognise you as a returning customer, as described in its privacy notice."
- **BM:** "Jika anda memberi nombor telefon, kedai menggunakannya untuk pesanan ini dan untuk mengenali anda sebagai pelanggan tetap, seperti yang diterangkan dalam notis privasinya."

### Text

All new text is in EN and BM, and `npm run check:i18n` must pass.

## 3. Error handling

- **No sales in the range:** both tabs show their empty states. Percentages are `null` and are shown as "—", never a division error.
- **No phone numbers at all:** the customer summary shows 0 customers, and coverage is 0% (or "—" if there are no online orders).
- **Staff account removed:** the row still shows the stored name. Accounts are deactivated, never deleted.

## 4. Testing

**Backend (pytest):**
- **Staff:**
  - two staff and one unclaimed order give rows for each plus Unassigned
  - the rows' sales add up to `totals.sales_sen`
  - cancelled, unpaid and refunded orders are excluded
  - `avg_cook_minutes` comes from `preparing_at`/`ready_at`
  - `share_pct` is correct
  - the sort order is right
- **Customers:**
  - orders are grouped by phone
  - `is_new` and `returning` are right across `date_from`, using an earlier order
  - the masking format is correct, and no response body contains the full `+60…` number
  - counter orders are ignored
  - `phone_coverage_pct` is correct
  - `sort=orders` and `sort=last` work, and the top 50 are capped
  - staff get 403
- **Masking unit test:** `+60123456789` → `012-***6789`, `+6031234567` → `031-***4567`, and a short number gives `***`.

**Frontend:**
- `npm run typecheck`, `npm run check:i18n`, `npm run build`
- **Browser check:** both tabs with data in EN and BM, and the new checkout privacy text.

## 5. Build order

1. Staff rows in the report (backend, TDD).
2. The customers endpoint and masking (backend, TDD).
3. Both tabs, the privacy text, then full checks.
