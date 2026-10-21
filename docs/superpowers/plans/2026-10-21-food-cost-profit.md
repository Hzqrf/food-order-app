# Food Cost & Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners enter a food cost per menu item and option. Each order line saves its cost at sale time, and Sales History and the Sales Report show gross profit, margin and cost coverage.

**Architecture:**
- **Data:** new nullable `menu_items.cost_sen`, `options.cost_delta_sen` (default 0) and nullable `order_items.unit_cost_sen` (the snapshot).
- **Pricing:** the pure pricing module computes the line's unit cost next to its price, and order building stores it.
- **Reports:** queries sum profit over costed lines of sales orders.
- **Frontend:** adds cost fields to the owner's menu editors and profit to Sales History and the Sales Report.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, MySQL 8, pytest; React 19, Mantine 9, TanStack Query, i18next.

**Spec:** `docs/superpowers/specs/2026-10-21-food-cost-profit-design.md`

## Global Constraints

- **Owner-only:** cost fields appear only in `AdminItem`, `AdminOption` and owner report schemas. They are never in `MenuOut` (or its children), `OrderSummary`/`OrderDetail`, any `/staff/*` response, or `/orders/quote`.
- **Money:** integer sen.
  - `menu_items.cost_sen` is `NULL` = "not set" (not 0), and `>= 0` when set.
  - `options.cost_delta_sen` is `>= 0`, default 0.
  - Item cost bounds `0..10_000_00`; option bounds `0..1_000_00` (same as price).
- **Profit base:** order lines of orders matching `_sales()` (status in `SALES_STATUSES`, `payment_status='paid'`, by `business_date`).
  - costed sales = Σ `line_total_sen` where `unit_cost_sen IS NOT NULL`
  - food cost = Σ `unit_cost_sen * quantity` over the same lines
  - gross profit = costed sales − food cost
  - margin % = profit ÷ costed sales × 100, 1 decimal place, `None` if costed sales is 0
  - coverage % = costed sales ÷ all sales lines' `line_total_sen` × 100, 1 decimal place, `None` if no sales
- **Audit:** `cost_sen` joins the `changes()` list for `menu_item_changed`; `cost_delta_sen` joins it for `option_changed`. Both are recorded in the `*_created` entries.
- **Text:** all new UI text in `en.json` and `ms.json` under `console.cost.*`. `npm run check:i18n` must pass.
- **Tests:** backend uses MySQL test DB `docker compose up -d mysql` on :3307 and `cd backend && uv run pytest`. Frontend uses `npm run typecheck && npm run check:i18n && npm run build` plus a browser check.
- **Commits:** on branch `food-cost-profit`; each message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Item costed, option with no extra cost set:** the option counts as 0, so line cost = item cost. Test: `test_option_without_extra_cost_adds_nothing` (Task 1).
2. **Owner clears a cost** (PATCH `cost_sen: null`): new orders save `NULL`, and earlier orders keep their saved cost. Test: `test_clearing_cost_stops_new_snapshots_only` (Task 2).
3. **A fully refunded order that had costs** is excluded from profit, like it is from sales. Test: `test_refunded_and_cancelled_orders_excluded_from_profit` (Task 3).
4. **A period whose sales are all uncosted:** profit 0, margin `None`, coverage `0.0`, never a division error. Test: `test_uncosted_period_has_no_margin` (Task 3).
5. **Cost never leaks to staff or customers** through the menu, quote, board or order detail. Test: `test_cost_is_owner_only` (Task 2).

---

### Task 1: Data, pricing and order snapshot (backend)

**Files:**
- Create: `backend/alembic/versions/20261021_7d2b4e9a1c55_food_cost.py`
- Modify: `backend/app/models.py` (`MenuItem`, `Option`, `OrderItem`), `backend/app/orders/pricing.py`, `backend/app/orders/service.py` (`load_menu_index`, `_build_order`)
- Test: `backend/tests/test_pricing.py`, `backend/tests/test_cost.py` (new)

**Interfaces:**
- Produces:
  - `MenuItem.cost_sen: int | None`, `Option.cost_delta_sen: int`, `OrderItem.unit_cost_sen: int | None`
  - `pricing.MenuItem.cost_sen: int | None = None` (last field)
  - `pricing.MenuOption.cost_delta_sen: int = 0` (last field)
  - `pricing.PricedLine.unit_cost_sen: int | None = None` (last field)

  Defaults keep every existing constructor call working.

- [ ] **Step 1: Write the failing pure-pricing tests** in `tests/test_pricing.py`. Reuse the file's menu helpers; give the tender item `cost_sen=350`, Large `cost_delta_sen=120`, Cheese `cost_delta_sen=80`:

```python
def test_line_cost_is_item_cost_plus_option_costs():
    line = price_cart([CartLine(TENDER, 2, (LARGE, CHEESE))], menu_with_costs()).lines[0]
    assert line.unit_cost_sen == 350 + 120 + 80

def test_uncosted_item_gives_no_line_cost():
    line = price_cart([CartLine(TENDER, 1, (REGULAR,))], menu_with_costs(item_cost=None)).lines[0]
    assert line.unit_cost_sen is None

def test_option_without_extra_cost_adds_nothing():
    line = price_cart([CartLine(TENDER, 1, (REGULAR, SPICY))], menu_with_costs()).lines[0]
    assert line.unit_cost_sen == 350  # Regular and Spicy Sauce have cost_delta_sen 0
```

(Use the file's actual id constants and existing menu builder. Add a `menu_with_costs(item_cost=350)` helper beside it.)

- [ ] **Step 2: Write the failing snapshot test** in `tests/test_cost.py`, using the `menu` fixture:

```python
def test_counter_order_saves_line_cost(staff_client, menu, db):
    # set costs directly: tender 350, Large +120
    o = counter_order(staff_client, [tender_large]).json()
    assert db.scalar(select(OrderItem.unit_cost_sen).where(OrderItem.order_id == o["id"])) == 470
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_pricing.py tests/test_cost.py -q`
Expected: FAIL (unexpected keyword `cost_sen` / missing column).

- [ ] **Step 4: Migration and models**
  - **Migration:** revision `7d2b4e9a1c55`, down_revision `5c1e7a2b9d40`. It adds:
    - `menu_items.cost_sen` (Integer, nullable)
    - `options.cost_delta_sen` (Integer, not null, `server_default="0"`)
    - `order_items.unit_cost_sen` (Integer, nullable)
    - check constraints `ck_menu_items_cost` (`cost_sen IS NULL OR cost_sen >= 0`) and `ck_options_cost` (`cost_delta_sen >= 0`)
  - `downgrade()` drops them all.
  - **Models:** mirror the migration, and add the two check constraints to `__table_args__`.

- [ ] **Step 5: Pricing and order building**
  - `_price_line` sets `unit_cost_sen = None if item.cost_sen is None else item.cost_sen + Σ chosen option.cost_delta_sen`. `PricedOption` stays unchanged; keep the chosen `MenuOption`s for the sum.
  - `load_menu_index` passes `cost_sen=row.cost_sen` and `cost_delta_sen=o.cost_delta_sen`.
  - `_build_order` writes `unit_cost_sen=line.unit_cost_sen` on each `OrderItem`.

- [ ] **Step 6: Run the tests**

Run: `cd backend && uv run pytest -q`
Expected: all PASS (existing pricing and order tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(cost): food cost on items and options, saved on each order line"
```

---

### Task 2: Owner menu API, audit, owner-only guarantee (backend)

**Files:**
- Modify: `backend/app/menu/schemas.py` (`ItemIn`, `ItemPatch`, `OptionIn`, `OptionPatch`, `AdminItem`, `AdminOption`), `backend/app/menu/service.py` (`_admin_item`, `create_item`, `update_item`, `create_option`, `update_option`)
- Test: `backend/tests/test_cost.py`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces:
  - `ItemIn.cost_sen: int | None = Field(default=None, ge=0, le=10_000_00)`; `ItemPatch.cost_sen` the same.
  - `OptionIn.cost_delta_sen: int = Field(default=0, ge=0, le=1_000_00)`; `OptionPatch.cost_delta_sen: int | None` with the same bounds.
  - `AdminItem.cost_sen: int | None`, `AdminOption.cost_delta_sen: int`.

- [ ] **Step 1: Write the failing tests** in `tests/test_cost.py`:

```python
def test_owner_sets_costs_and_they_are_audited(admin_client, menu, db):
    # PATCH /admin/menu/items/{tender} {"cost_sen": 350}
    #   -> AdminItem.cost_sen == 350, and an AuditLog row with
    #      action "menu_item_changed", before {"cost_sen": None}, after {"cost_sen": 350}
    # PATCH /admin/menu/options/{Large} {"cost_delta_sen": 120}
    #   -> AdminOption.cost_delta_sen == 120, and an AuditLog row with
    #      action "option_changed", after {"cost_delta_sen": 120}

def test_negative_cost_rejected(admin_client, menu):
    # PATCH item {"cost_sen": -1} -> 422; PATCH option {"cost_delta_sen": -5} -> 422

def test_clearing_cost_stops_new_snapshots_only(client, staff, admin, menu, db):
    # owner sets tender cost 350; staff sells one (unit_cost_sen 350)
    # owner PATCHes {"cost_sen": null}; staff sells another
    # assert first line still 350, second line None

def test_cost_is_owner_only(client, staff, admin, menu):
    # owner sets costs; then as staff:
    #   GET /menu, POST /orders/quote, GET /staff/orders, GET /staff/orders/{id}
    #   -> no key containing "cost" anywhere in the JSON (walk the dict recursively)
    #   GET /admin/menu -> 403
```

Write these four tests as full code, following the comments.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_cost.py -q`
Expected: the new tests FAIL (422 on unknown field / missing key).

- [ ] **Step 3: Implement** the schema fields above.
  - `_admin_item` passes `cost_sen`. `AdminOption.model_validate` picks up `cost_delta_sen` from the model.
  - `update_item` uses `changes(item, ["price_sen", "cost_sen", "is_active"], values)`.
  - `update_option` uses `changes(option, ["price_delta_sen", "cost_delta_sen", "is_active"], values)`.
  - The created-entry `after` dicts gain `cost_sen` and `cost_delta_sen`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && uv run pytest -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(cost): owner menu API for costs, audited, never shown to staff"
```

---

### Task 3: Profit in reports (backend)

**Files:**
- Modify: `backend/app/reports/schemas.py` (`Totals`, `PeriodRow`, `ItemRow`), `backend/app/reports/queries.py` (`totals`, `periods`, `items`)
- Test: `backend/tests/test_cost.py`, `backend/tests/test_reports.py` (update the exact-dict assertion in `test_dashboard_counts_only_paid_live_orders`)

**Interfaces:**
- Consumes: `OrderItem.unit_cost_sen` (Task 1).
- Produces:
  - `Totals` gains `food_cost_sen: int`, `gross_profit_sen: int`, `margin_pct: float | None`, `cost_coverage_pct: float | None`.
  - `PeriodRow` gains `gross_profit_sen: int`.
  - `ItemRow` gains `cost_sen: int`, `gross_profit_sen: int`, `margin_pct: float | None`, `costed: bool` (no sold line of that item lacks a cost; `True` when unsold).
  - helper `queries._profit(db, branch, start, end, until=None) -> tuple[int, int, int]` returning `(all_line_sales_sen, costed_sales_sen, food_cost_sen)`. Callers derive profit, margin and coverage with the Global Constraints formulas. It honours `placed_by(until)` the way `totals()` does.

- [ ] **Step 1: Write the failing tests** in `tests/test_cost.py`:

```python
def test_report_profit_margin_and_coverage(client, staff, admin, menu, branch):
    # owner: tender cost 350 (Regular 0); milo uncosted
    # staff: one counter order: 2 tender Regular (2000) + 1 milo (450)
    # GET /admin/reports today -> totals:
    assert t["food_cost_sen"] == 700 and t["gross_profit_sen"] == 1300
    assert t["margin_pct"] == 65.0 and t["cost_coverage_pct"] == round(2000 / 2450 * 100, 1)
    # periods[0]["gross_profit_sen"] == 1300
    # items: tender {"cost_sen": 700, "gross_profit_sen": 1300, "margin_pct": 65.0, "costed": True}
    #        milo   {"costed": False, "gross_profit_sen": 0, "margin_pct": None}

def test_refunded_and_cancelled_orders_excluded_from_profit(client, staff, admin, menu, branch):
    # costed order A completed then fully refunded; costed order C cancelled; costed order B kept
    # totals profit counts only B

def test_uncosted_period_has_no_margin(client, staff, admin, menu, branch):
    # one sale, nothing costed -> gross_profit_sen 0, margin_pct None, cost_coverage_pct 0.0
    # empty day -> margin_pct None, cost_coverage_pct None

def test_cost_change_does_not_change_past_profit(client, staff, admin, menu, branch):
    # cost 350, sell 1 tender; change cost to 900; report profit for that order still 1000 - 350
```

Write these four tests as full code, following the comments. Then update `test_dashboard_counts_only_paid_live_orders`: its `d["today"]` dict gains `"food_cost_sen": 0, "gross_profit_sen": 0, "margin_pct": None, "cost_coverage_pct": 0.0`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_cost.py tests/test_reports.py -q`
Expected: FAIL (missing keys).

- [ ] **Step 3: Implement**
  - `_profit()`: one grouped query over `OrderItem` joined to `Order` with `_sales(...)` and `placed_by(until)`, using `case(unit_cost_sen IS NOT NULL)` sums.
  - `totals()` fills the four fields from it.
  - `periods()` gets `gross_profit_sen` from a per-`business_date` variant grouped into periods, alongside the existing per-day loop.
  - `items()` adds per-item costed sales, cost and an uncosted-lines count.

- [ ] **Step 4: Run the whole suite**

Run: `cd backend && uv run pytest -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(cost): gross profit, margin and coverage in reports"
```

---

### Task 4: Cost in the owner's menu editors and Menu table (frontend)

**Files:**
- Modify:
  - `frontend/src/api/schema.d.ts` (regenerate)
  - `frontend/src/areas/staff/components/menu/ItemDrawer.tsx`
  - `frontend/src/areas/staff/components/menu/OptionGroupsPanel.tsx`
  - `frontend/src/areas/staff/pages/MenuPage.tsx`
  - locales
- Create: `frontend/src/lib/margin.ts`

**Interfaces:**
- Consumes: Task 2 fields (`AdminItem.cost_sen`, `AdminOption.cost_delta_sen`, `ItemPatch/OptionPatch` cost fields).
- Produces: `marginPct(priceSen: number, costSen: number | null): number | null`, which returns `null` when cost is null or price is 0, otherwise `round((price-cost)/price*100, 1)`.

- [ ] **Step 1:** `cd frontend && npm run gen:types`. Expected: `cost_sen` and `cost_delta_sen` appear in `schema.d.ts`.

- [ ] **Step 2: Item editor:** a **Food cost** `MoneyInput` under Price. It is optional; clearing it sends `cost_sen: null`. The hint below it shows:
  - when cost is set: `console.cost.marginHint` ("Margin {{pct}}%"), in red if negative
  - when cost is empty: `console.cost.notSetHint` ("Not set: profit won't count this item")

  Save includes `cost_sen` in create and update.

- [ ] **Step 3: Option groups panel:** each option row gets an **Extra cost** `MoneyInput` beside its price change, saved with `useUpdateOption` (`cost_delta_sen`). New options default to 0.

- [ ] **Step 4: Menu table (owner only):** **Cost** and **Margin** columns after Price, using `marginPct`. No cost shows "—" in `yellow.8` with a `console.cost.notSet` tooltip. Staff rows don't render these columns. Update `cols` for the colspan.

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run typecheck && npm run check:i18n && npm run build`
Expected: pass.

Browser check, as owner:
- set a cost on Chicken Tender and +RM1.20 on Large
- the Menu table shows cost and margin
- the item editor shows a live margin

As staff: no Cost or Margin columns.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(cost): food cost in the menu editors and Menu table"
```

---

### Task 5: Profit on Sales History and the Sales Report, README (frontend)

**Files:**
- Modify: `frontend/src/areas/staff/pages/SalesHistoryPage.tsx`, `frontend/src/areas/staff/pages/SalesReportPage.tsx`, locales, `README.md` (Owner pages table: Menu, Sales History and Sales Report rows)

**Interfaces:**
- Consumes: Task 3 report fields; `marginPct` is not needed here (the server sends `margin_pct`).

- [ ] **Step 1: Sales History.** The metric grid becomes 4 columns at `sm` (2 on mobile). Add a **Gross Profit** `MetricCard`:
  - value `formatSen(totals.gross_profit_sen)`, with `percentChange` against `previous.gross_profit_sen`
  - `deltaLabel` is `console.cost.marginLabel` ("Margin {{pct}}%") when `cost_coverage_pct === 100`
  - otherwise `console.cost.coverageLabel` ("Cost set for {{pct}}% of sales")
  - when `cost_coverage_pct` is null, the label is `console.cost.noSales`

- [ ] **Step 2: Sales Report.**
  - **By day:** a **Gross profit** column after Net, with the total row from `totals.gross_profit_sen`.
  - **By item:** **Cost**, **Profit**, **Margin** columns, and an amber `console.cost.notSet` badge when `!costed && quantity > 0`.

- [ ] **Step 3: README.** In the Owner pages table, mention food cost on **Menu**, Gross Profit on **Sales History**, and the profit columns on **Sales Report**. Add one line under "How sales are counted": gross profit counts only lines that had a cost when sold.

- [ ] **Step 4: Verify**

Run:
```bash
cd backend && uv run pytest -q
cd ../frontend && npm run typecheck && npm run check:i18n && npm run build
```
Expected: all pass.

Browser check:
- with costs set from Task 4, place a counter order with a costed item and an uncosted one
- Sales History shows Gross Profit with "Cost set for N% of sales"
- the Sales Report By item shows profit and margin for the costed item and "cost not set" for the other
- staff see no profit anywhere

- [ ] **Step 5: Commit**

```bash
git add frontend README.md
git commit -m "feat(cost): gross profit on Sales History and the Sales Report"
```
