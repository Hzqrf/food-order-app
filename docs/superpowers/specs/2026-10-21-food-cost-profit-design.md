# Food cost & profit: design

- **Date:** 2026-10-21
- **Status:** approved in brainstorming, awaiting spec review
- **Sub-project:** 3 of 6 in the Staff Console programme (see `2026-10-14-staff-console-redesign-design.md`, "Programme")

## Goal

Give the owner a food cost for each menu item and option. Sales History and the Sales Report then show **Gross Profit** and **margin**, and the owner can see which dishes actually make money.

## Decisions made with the user

| Topic | Decision |
|---|---|
| What has a cost | Menu items **and** options. Options carry an extra cost (Large +RM1.20, Cheese +RM0.80). |
| Cost history | Each order line saves its cost **at the time of sale**, the way it already saves the price. Editing a cost later never changes past profit. |
| Approach | Snapshot on order lines. A separate cost-history table was considered and rejected: same answers, more moving parts. |

**Assumptions** (confirmed in the design review):
- Costs and profit are **owner-only**.
- Costs are typed in by hand. Inventory (sub-project 5) may compute them from ingredient prices later; not now.
- **Gross profit** means sales minus the food cost of what was sold. Overheads (rent, wages, utilities) are out of scope.

## Scope

**In:**
- cost fields on menu items and options
- cost snapshot on order lines
- profit figures in reports
- cost and margin on the owner's Menu table, item editor and option editor
- a Gross Profit card on Sales History
- profit columns in the Sales Report

**Out:**
- recipe or ingredient costing
- overheads and net profit
- profit on the Sales Dashboard
- back-filling costs onto orders sold before this feature (they stay "cost not set")
- staff access to any cost figure

## 1. Data

### New columns (one Alembic migration)

| Table | Column | Type | Meaning |
|---|---|---|---|
| `menu_items` | `cost_sen` | `Integer`, nullable | Food cost of one item. `NULL` = not set yet; this is not the same as 0. |
| `options` | `cost_delta_sen` | `Integer`, not null, default 0 | Extra food cost when this option is chosen. |
| `order_items` | `unit_cost_sen` | `Integer`, nullable | Saved at sale: item cost plus the chosen options' extra cost, per unit. `NULL` when the item had no cost set. |

**Constraints:**
- `menu_items.cost_sen >= 0` when set.
- `options.cost_delta_sen >= 0`.

**Existing rows:**
- Items: `cost_sen` NULL.
- Options: `cost_delta_sen` 0.
- Order lines: `unit_cost_sen` NULL.

### Pricing (`app/orders/pricing.py`)

`MenuItem` gains `cost_sen: int | None`, `MenuOption` gains `cost_delta_sen: int`, and `PricedLine` gains `unit_cost_sen: int | None`. The rule is pure, so it is tested without a database:
- item cost `NULL` → line cost `NULL`
- otherwise → `item.cost_sen + sum(option.cost_delta_sen for chosen options)`

Order creation (counter and online) writes `PricedLine.unit_cost_sen` to `order_items.unit_cost_sen`, next to the price it already writes.

### Owner-only

The cost fields appear only in the owner's admin menu schemas (`AdminItem`, `AdminOption`) and in owner report schemas. They are never in:
- the public menu (`MenuOut` and its children)
- `OrderSummary` / `OrderDetail`
- any `/staff/*` response
- the quote endpoint

### Audit

Cost edits are recorded the same way price edits are:
- `cost_sen` joins the `changes(...)` field list for `menu_item_changed`.
- `cost_delta_sen` joins it for `option_changed`.
- Creating an item or option records its cost in the `*_created` entry.

## 2. How profit is counted

**Base:** order lines on **sales orders**, the same base as today's `sales_sen`. These are orders whose status is in `SALES_STATUSES` and whose `payment_status = 'paid'`, by `business_date`. Cancelled and fully refunded orders are excluded, as they already are from Sales.

For a set of order lines:
- **Costed sales** = sum of `line_total_sen` over lines with `unit_cost_sen IS NOT NULL`
- **Food cost** = sum of `unit_cost_sen × quantity` over those lines
- **Gross profit** = costed sales − food cost
- **Margin** = gross profit ÷ costed sales, rounded to 1 decimal place. `null` when costed sales is 0.
- **Cost coverage** = costed sales ÷ all sales lines' `line_total_sen`, as a percentage. `null` when there are no sales.

Lines without a cost are **left out** of profit, not counted as free. The coverage figure tells the owner how much of the period the profit figure describes.

## 3. API changes

**Menu admin (`app/menu/schemas.py`, `service.py`):**
- `ItemIn` and `ItemPatch` gain `cost_sen: int | None` (0 to 10,000,00 sen). On `ItemPatch`, sending `null` clears it.
- `OptionIn` and `OptionPatch` gain `cost_delta_sen` (0 to 1,000,00 sen).
- `AdminItem` gains `cost_sen: int | None`; `AdminOption` gains `cost_delta_sen: int`.

**Reports (`app/reports/schemas.py`, `queries.py`):**
- `Totals` gains `food_cost_sen: int`, `gross_profit_sen: int`, `margin_pct: float | None`, `cost_coverage_pct: float | None`.
- `PeriodRow` gains `gross_profit_sen: int`.
- `ItemRow` gains `cost_sen: int` (food cost of that item's costed lines), `gross_profit_sen: int`, `margin_pct: float | None` and `costed: bool` (true when every sold line of that item had a cost).

These are owner endpoints (`/admin/reports`, `/admin/dashboard`). `Dashboard.today` gets the new `Totals` fields because the type is shared, but the dashboard UI does not show them.

## 4. Screens (owner only)

- **Item editor (`ItemDrawer`):** a **Food cost** money input, optional, under Price. Below it: "Margin 65%" when both are set, or "Not set: profit won't count this item" when empty. If the cost is above the price, the margin shows in red; it's allowed but flagged.
- **Option groups panel:** each option row gets an **Extra cost** money input beside its price.
- **Menu page, Items table (owner):** **Cost** and **Margin** columns after Price. An item with no cost shows "—" in amber. Staff see neither column.
- **Sales History:** a 4th metric card, **Gross Profit**:
  - value `gross_profit_sen`, delta against `previous.gross_profit_sen`
  - label "Margin 55%"
  - when coverage is below 100%, the label instead reads "Cost set for 82% of sales"
- **Sales Report, By day:** a **Gross profit** column after Net.
- **Sales Report, By item:** **Cost**, **Profit** and **Margin** columns. Items with uncosted sales show an amber "cost not set" badge.

All new text is in English and Malay.

## 5. Error handling

- Negative or oversized costs are rejected by the schemas with the usual 422. The editor's MoneyInput already prevents negatives.
- A cost above the price is accepted and shown as a negative margin in red, not blocked. Some items are deliberately sold at a loss.
- Reports with no sales show `—` for margin and coverage, never a division error.

## 6. Testing

**Backend (pytest, MySQL test DB):**
- **Pricing (pure):** line cost = item cost + option extra costs; item cost `None` gives line cost `None`.
- **Order snapshot:** a counter order with options saves `unit_cost_sen`. After the item's cost is changed, the old order's `unit_cost_sen` and its report profit are unchanged.
- **Reports:**
  - one costed and one uncosted item give the right gross profit, margin, and coverage below 100%
  - a fully refunded or cancelled order is excluded
  - per-period and per-item profit
- **Owner-only:**
  - the public `/menu`, `/staff/orders`, `/staff/orders/{id}` and `/orders/quote` responses contain no `cost` keys
  - staff get 403 on `/admin/menu`
- **Audit:** a cost change writes `menu_item_changed` / `option_changed` with before and after.

**Frontend:**
- `npm run typecheck`, `npm run check:i18n`, `npm run build`
- browser check: set costs, place an order, see profit on Sales History and the Sales Report; as staff, see no cost anywhere

## 7. Build order

1. Migration, models, pricing and order snapshot (backend, TDD).
2. Menu admin schemas and audit (backend, TDD).
3. Report figures (backend, TDD).
4. Item editor, option groups and Menu table (frontend).
5. Sales History card and Sales Report columns (frontend), then full checks and README.
