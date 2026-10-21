# Customer App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every customer screen to follow the user's design in orange. Add Popular items, a busy-kitchen banner, honest ready times, an item page with its own link, photo placeholders and an Orders tab.

**Architecture:**
- **Backend:** one new column (`menu_items.is_popular`), a pure-ish `popular_item_ids` rule feeding the public menu, and an `extra_wait_minutes` figure on `ShopOut` built from the existing running-late filter.
- **Frontend tokens:** move the console's tokens to `src/ui/tokens.ts`.
- **Customer kit:** a small kit in `areas/customer/ui/` built on those tokens.
- **Screens:** the customer pages are rebuilt on that kit. Two new routes: `/item/:id` and `/orders`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, MySQL 8, pytest; React 19, Mantine 9, TanStack Query, react-router 7, i18next.

**Spec:** `docs/superpowers/specs/2026-10-21-customer-redesign-design.md`

## Global Constraints

- **Colour:**
  - The accent is Mantine `orange` (shade 7, `#c2410c`).
  - Greys, radius and shadow come only from `src/ui/tokens.ts`.
  - Four new token values: `placeholderBg: "#fff7ed"`, `placeholderText: "#c2410c"`, `busyBg: "#FEF6E7"`, `choiceBorder: "#D0D5DD"`. Add them to `tokens` and use no other raw hex in customer code.
- **White-label:** customers never see "Kaunter", only `shop.name`.
- **Popular rule** (spec §2):
  - If any active item has `is_popular`, exactly those are Popular.
  - Otherwise the top 3 active items by units over the last 14 business days, counting only items with at least 5 units. Units come from sales orders: `SALES_STATUSES` and `payment_status='paid'`.
  - Ties are broken by item id.
- **Extra wait:**
  - Late orders: status `placed`/`preparing` and `placed_at < now - prep_minutes`.
  - Fewer than 2 late orders gives `0`.
  - Otherwise, average the lateness in minutes, round **up** to a multiple of 5, then cap at 60.
- **Privacy:** `/shop` and `/menu` gain only `extra_wait_minutes` and `is_popular`. No costs, counts or order details.
- **Pickup estimate** = now + `prep_minutes` + `extra_wait_minutes`.
- **Tracking ready time:**
  - The ready time is `placed_at + prep_minutes`.
  - Once that time has passed and the order isn't ready, show "Running a little late" instead of a time.
- **Text:** every new string goes in `frontend/src/locales/en.json` and `ms.json`, and `npm run check:i18n` must pass. The copy is fixed by the spec:

  | Key | EN | BM |
  |---|---|---|
  | `shop.openUntil` | Open until {{time}} · {{minutes}} min prep | Buka hingga {{time}} · {{minutes}} min disediakan |
  | `shop.closedOpensAt` | Closed · opens {{when}} | Tutup · buka {{when}} |
  | `customer.search` | Search the menu | Cari menu |
  | `customer.noMatch` | No items match "{{q}}" | Tiada item sepadan dengan "{{q}}" |
  | `customer.popular` | Popular | Popular |
  | `customer.popularSection` | Popular this week | Popular minggu ini |
  | `customer.busy` | The kitchen is busy. Pickup times are running about {{minutes}} minutes longer. | Dapur sedang sibuk. Masa ambil pesanan lebih lama kira-kira {{minutes}} minit. |
  | `customer.tab.menu` / `.cart` / `.orders` | Menu / Cart / Orders | Menu / Troli / Pesanan |
  | `customer.itemGone` | This item isn't on the menu any more | Item ini sudah tiada dalam menu |
  | `customer.orderAtCounter` | Order at the counter | Pesan di kaunter |
  | `customer.addToCart` | Add to cart · {{total}} | Tambah ke troli · {{total}} |
  | `customer.pickup` | Pickup | Ambil pesanan |
  | `customer.pickupAsap` | As soon as possible · ready around {{time}} | Secepat mungkin · siap sekitar {{time}} |
  | `customer.whoCollecting` | Who is collecting | Siapa yang mengambil |
  | `customer.name` | Name | Nama |
  | `customer.payment` | Payment | Pembayaran |
  | `customer.ordersEmpty` | Orders you place on this phone show up here. | Pesanan yang anda buat di telefon ini akan dipaparkan di sini. |
  | `tracking.readyAt` | Ready for pickup at about {{time}} | Sedia untuk diambil sekitar {{time}} |
  | `tracking.runningLate` | Running a little late. It won't be long. | Sedikit lewat. Tidak lama lagi. |
  | `tracking.readyNow` | Ready now. Show this code at the counter. | Sudah siap. Tunjukkan kod ini di kaunter. |
  | `tracking.inThisOrder` | In this order | Dalam pesanan ini |
  | `console.menu.popular` | Show as Popular | Papar sebagai Popular |
  | `console.menu.popularHelp` | If you pick none, the 3 best sellers are shown automatically. | Jika tiada yang dipilih, 3 item paling laris dipaparkan secara automatik. |

- **Tests:**
  - **Backend:** MySQL test DB (`docker compose up -d mysql` on :3307), then `cd backend && uv run pytest`.
  - **Frontend:** `npm run typecheck && npm run check:i18n && npm run build` plus a phone-width browser check. The frontend has no unit-test runner and this plan does not add one.
- **API types:** after a backend schema change, run `cd frontend && npm run gen:types` and commit `openapi.json` and `src/api/schema.d.ts`.
- **Commits:** on branch `customer-redesign`. Stage files by name, never `git add -A`. Each message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An owner pick on an inactive or deleted item** must not count as "owner has picked", so the automatic list should still apply. Test: `test_inactive_owner_pick_is_ignored` (Task 1).
2. **Old sales outside the 14-day window, and unpaid online orders,** must not make an item Popular. Test: `test_popular_ignores_old_unpaid_and_cancelled` (Task 1).
3. **A shop with one very late order and nothing else late** must show no banner. Test: `test_extra_wait_needs_two_late_orders` (Task 2).
4. **A ready order that was late before it became ready** no longer counts towards the extra wait. Test: `test_extra_wait_ignores_ready_orders` (Task 2).
5. **Bad item links:**
   - `/item/abc`, `/item/99999`, or an item made inactive while the page is open, shows "This item isn't on the menu any more", never a crash or a blank page.
   - Opening `/item/:id` directly (a shared link) works on a cold load.
   - Browser check in Task 4.

---

### Task 1: Popular items (backend)

**Files:**
- Create: `backend/alembic/versions/20261021_a4c9e2f7b310_popular_items.py` (revises `7d2b4e9a1c55`)
- Create: `backend/tests/test_popular.py`
- Modify:
  - `backend/app/models.py` (`MenuItem.is_popular: Mapped[bool]`, default False, server default `0`)
  - `backend/app/menu/schemas.py` (`MenuItemOut`, `ItemIn`, `ItemPatch`, `AdminItem`)
  - `backend/app/menu/service.py` (`public_menu`, `_build_public_menu`, `_admin_item`, `create_item`, `update_item`)
  - `backend/app/menu/router.py` (the public route passes the branch)

**Interfaces:**
- Produces:
  - `popular_item_ids(db: Session, branch: Branch, today: date) -> set[int]` in `app/menu/service.py`.
    - Window: `today - 13 days .. today`, inclusive.
    - Uses `reports.queries._sales(branch, start, end)` for the order filter.
    - Joins `OrderItem` to `MenuItem` where `MenuItem.is_active`.
  - `public_menu(db: Session, branch: Branch) -> MenuOut`. The cache is unchanged; `today = business_date(branch)`.
  - The public `MenuItemOut.is_popular: bool`, plus `AdminItem.is_popular: bool`, `ItemIn.is_popular: bool = False` and `ItemPatch.is_popular: bool | None = None`.

- [ ] **Step 1: Write the failing tests** in `tests/test_popular.py`.
  - Use the `menu`, `db`, `branch`, `staff_client` and `admin_client` fixtures.
  - Add a local helper `sell(staff_client, item_id, qty)` that places a paid counter order with `counter_order(staff_client, [{"menu_item_id": item_id, "quantity": qty, ...}])`. The tender needs `option_ids` for Size, e.g. `[menu["Regular"]]`.
  - Clear the menu cache before each read with `invalidate_menu_cache()`, called from an autouse fixture.

```python
def popular(client):  # ids flagged on the public menu
    return {i["id"] for c in client.get(f"{API}/menu").json()["categories"] for i in c["items"] if i["is_popular"]}

def test_no_sales_means_nothing_popular(client, menu): assert popular(client) == set()

def test_needs_five_units(client, staff_client, menu):
    sell(staff_client, menu["milo"], 4); assert popular(client) == set()
    sell(staff_client, menu["milo"], 1); assert popular(client) == {menu["milo"]}

def test_top_three_by_units_ties_by_id(...):
    # add two more active items in the fixture's category (direct db inserts), sell 4 items 9/7/7/6 units
    # -> the three highest; on the 7/7 tie both make it, and a 6/6 tie for third goes to the lower id

def test_popular_ignores_old_unpaid_and_cancelled(client, staff_client, menu, db, branch):
    # 5 milo units: one order moved to business_date = today - 14 (outside), one set payment_status='unpaid',
    # one set status='cancelled' -> nothing popular

def test_owner_picks_override(client, admin_client, staff_client, menu):
    sell(staff_client, menu["milo"], 9)
    admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"is_popular": True})
    assert popular(client) == {menu["tender"]}

def test_inactive_owner_pick_is_ignored(client, admin_client, staff_client, menu):
    sell(staff_client, menu["milo"], 5)
    admin_client.patch(f"{API}/admin/menu/items/{menu['tender']}", json={"is_popular": True, "is_active": False})
    assert popular(client) == {menu["milo"]}

def test_popular_change_is_audited(admin_client, menu, db):
    # PATCH is_popular True -> an AuditLog "menu_item_changed" row with before {"is_popular": False}, after {"is_popular": True}
```

  Use the admin item route path the existing `test_menu.py` uses. If it differs from `/admin/menu/items/{id}`, follow `test_menu.py`.

- [ ] **Step 2: Run the tests.**
  - Run: `cd backend && uv run pytest tests/test_popular.py -q`
  - Expected: FAIL (`KeyError: 'is_popular'` / 422 on the PATCH).

- [ ] **Step 3: Implement.**
  - **Migration:** `op.add_column("menu_items", sa.Column("is_popular", sa.Boolean(), nullable=False, server_default=sa.false()))`, with a matching downgrade.
  - **Model column.**
  - **Schemas** as listed under Interfaces.
  - **Audit:** add `"is_popular"` to the `changes(...)` list in `update_item` and to the `menu_item_created` after-dict.
  - **`popular_item_ids`:**
    - Owner picks are `select(MenuItem.id).where(is_active, is_popular)`. If there are any, return them.
    - Otherwise group sales lines by `menu_item_id` with `sum(quantity) >= 5`, order by `sum desc, id asc`, limit 3.
  - **`_build_public_menu(db, branch)`** sets `is_popular=item.id in popular`.

- [ ] **Step 4: Run the tests.**
  - Run: `uv run pytest tests/test_popular.py tests/test_menu.py tests/test_cost.py -q`
  - Expected: all pass.

- [ ] **Step 5: Run the full suite.**
  - Run: `uv run pytest -q`
  - Expected: all pass.
  - Commit: the migration, models, schemas, service, router and test with message `feat(menu): Popular items, owner picks or the 3 best sellers`.

### Task 2: Busy kitchen extra wait (backend) and API types

**Files:**
- Modify:
  - `backend/app/orders/metrics.py`
  - `backend/app/shop/schemas.py` (`ShopOut.extra_wait_minutes: int`)
  - `backend/app/shop/service.py` (`shop_out(db, branch)`)
  - `backend/app/shop/router.py` (all four routes pass `db`)
- Modify: `frontend/openapi.json`, `frontend/src/api/schema.d.ts` (generated)
- Test: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: `MenuItemOut.is_popular` from Task 1, which arrives in the generated types here.
- Produces:
  - `extra_wait_minutes(db: Session, branch: Branch, now: datetime | None = None) -> int` in `app/orders/metrics.py`.
  - `shop_out(db: Session, branch: Branch) -> ShopOut`.
  - The frontend types `ShopOut["extra_wait_minutes"]` and `MenuItem["is_popular"]`.

- [ ] **Step 1: Write the failing tests** in `tests/test_metrics.py`.
  - Use the existing `set_order` and `milo` helpers.
  - `prep_minutes` is 15.
  - Pass an explicit `now` to the function, so the rounding edges are exact.

```python
def late(staff_client, menu, db, now, minutes_late):  # helper: one placed order this many minutes past its promise
    o = counter_order(staff_client, [milo(menu)]).json()["id"]
    set_order(db, o, placed_at=now - timedelta(minutes=15 + minutes_late)); return o

def test_extra_wait_needs_two_late_orders(...):   # no orders -> 0; one order 40 min late -> 0
def test_extra_wait_rounds_up_to_five(...):       # late 1 and 3 (avg 2) -> 5; late 4 and 8 (avg 6) -> 10; late 5 and 5 -> 5
def test_extra_wait_capped_at_sixty(...):         # late 90 and 100 -> 60
def test_extra_wait_ignores_ready_orders(...):    # two late orders, one set status="ready" -> 0
def test_shop_reports_extra_wait(client, staff_client, menu, db):
    # two orders 7 min late -> GET /shop has extra_wait_minutes == 10; the body's keys are exactly the previous
    # ShopOut keys plus "extra_wait_minutes" (no counts, no order data)
```

- [ ] **Step 2: Run the tests.**
  - Run: `uv run pytest tests/test_metrics.py -q`
  - Expected: FAIL (ImportError / missing key).

- [ ] **Step 3: Implement.**
  - Reuse the `running_late` filter. Extract it into `_late_filter(branch, now)` and use it in both `queue_metrics` and `extra_wait_minutes`.
  - Fetch the late orders' `placed_at`, compute their lateness in Python, round up with `math.ceil(avg / 5) * 5`, then cap at 60.
  - `shop_out` calls it.

- [ ] **Step 4: Run the tests.**
  - Run `uv run pytest -q`. Expected: all pass.
  - Then run `cd ../frontend && npm run gen:types && npm run typecheck`. Expected: passes.

- [ ] **Step 5: Commit.**
  - Files: backend files, `frontend/openapi.json`, `frontend/src/api/schema.d.ts`.
  - Message: `feat(shop): extra wait minutes when the kitchen is running late`.

### Task 3: Shared tokens, customer kit, shell and routes

**Files:**
- Move: `frontend/src/areas/staff/console/tokens.ts` → `frontend/src/ui/tokens.ts`. Update every import: `grep -rl "console/tokens" frontend/src`.
- Create in `frontend/src/areas/customer/ui/`:
  - `PhotoTile.tsx`
  - `ItemRow.tsx`
  - `TabBar.tsx`
  - `ChoiceRow.tsx`
  - `BottomBar.tsx`
- Create:
  - `frontend/src/lib/search.ts`
  - `frontend/src/lib/hours.ts`
- Create (placeholders, filled in later tasks):
  - `frontend/src/areas/customer/pages/ItemPage.tsx`
  - `frontend/src/areas/customer/pages/OrdersPage.tsx`
- Modify:
  - `frontend/src/areas/customer/CustomerLayout.tsx`
  - `frontend/src/routes.tsx`
  - `frontend/src/locales/en.json`, `ms.json`

**Interfaces:**
- Produces (props are exact):
  - `PhotoTile({ name: string; src: string | null; size: number | "full" })`
    - Shows the image `object-fit: cover` at radius 12.
    - With no image: a `tokens.placeholderBg` tile with `name.trim()[0].toUpperCase()` in `tokens.placeholderText`, weight 600, about 40% of the size.
  - `ItemRow({ item: MenuItem; onOpen: () => void })`
    - Spec card: gap 14, padding 12, radius 16, white, `tokens.cardShadow`, 84px `PhotoTile`.
    - Name 15/600, description 13 `tokens.muted` `lineClamp={2}`, price 15/600 via `formatSen`.
    - A `customer.popular` badge when `item.is_popular`; a grey `customer.problem.sold_out` badge plus opacity .55 when `item.is_sold_out`.
    - The whole card is an `UnstyledButton`.
  - `TabBar({ cartCount: number; showCart: boolean })`
    - Fixed bottom, white, top border `tokens.border`, `paddingBottom: env(safe-area-inset-bottom)`, centred at max 480px.
    - Tabs: `/` Menu, `/cart` Cart (orange `Badge` when the count is above 0), `/orders` Orders.
    - The active tab is `orange.7`; inactive tabs use `tokens.muted`.
    - Tabler icons: `IconToolsKitchen2`, `IconShoppingBag`, `IconReceipt`.
  - `ChoiceRow({ type: "radio" | "checkbox"; label: string; priceDeltaSen: number; checked: boolean; disabled: boolean; onChange: () => void })`
    - Inset border `tokens.choiceBorder`, radius 12.
    - When checked: orange.7 border, orange.0 background and a tick.
    - Shows "+RM4.00" when the delta is above 0, and the sold-out text when disabled.
  - `BottomBar({ children: ReactNode })`: fixed bottom, white, top border, safe-area padding, max 480px centred.
  - `normalizeSearch(s: string): string` in `lib/search.ts`: lower case, NFD, strips combining marks and trims.
  - `itemMatches(item: MenuItem, query: string): boolean` checks the normalised query against the normalised `name + " " + (description ?? "")`. An empty query matches everything.
  - `hoursLine(shop: ShopOut, now?: Date): { openUntil: string } | { opensAt: string; dayOffset: number } | null` in `lib/hours.ts`.
    - Takes the current day key and HH:MM in `shop.timezone` from `Intl.DateTimeFormat(..., { timeZone, weekday: "short", hour12: false })`.
    - **Open:** `openUntil` is the end of the window containing now.
    - **Closed:** returns the next window start within 7 days, with how many days ahead it is.
    - **No hours at all:** `null`.
    - A window whose end is earlier than its start crosses midnight.
  - `clockLabel(hhmm: string): string` formats "22:00" as "10:00pm".
  - Routes added as children of `/`:
    - `{ path: "item/:id", element: <ItemPage/> }`
    - `{ path: "orders", element: <OrdersPage/> }`

- [ ] **Step 1: Move the tokens and fix the imports.**
  - Add the four new token values from Global Constraints.
  - Run: `cd frontend && npm run typecheck`
  - Expected: passes, and the console looks unchanged.

- [ ] **Step 2: Build the kit components and helpers** to the props above.
  - `ChoiceRow` is customer-only. Do not change `components/OptionPicker.tsx`.

- [ ] **Step 3: Rewrite `CustomerLayout`.**
  - `import "@fontsource-variable/inter"`.
  - Page: `bg={tokens.pageBg}`, a content `Box` with `maw={480} mx="auto" px={16}`, and bottom padding of 96 when the `TabBar` shows.
  - Font: the column sets `fontFamily: "Inter Variable, sans-serif"`.
  - **Tab bar** shows when the pathname is `/`, `/cart` or `/orders`.
    - `showCart` = `shop?.can_order_online || cart.count > 0`, which needs `useCart` inside the provider. Split an inner `Shell` component inside `CartProvider`.
  - The old header and `CartBar` move out: the header becomes part of `MenuPage` in Task 4. Delete `components/CartBar.tsx` once nothing imports it.
  - Keep the `document.title` effect.

- [ ] **Step 4: Add the routes and placeholder pages, and the new copy.**
  - Add `ItemPage` and `OrdersPage` as placeholders returning `null`.
  - Add all `customer.*`, `shop.*`, `tracking.*` and `console.menu.*` keys from the Global Constraints table to `en.json` and `ms.json`.
  - Run: `npm run typecheck && npm run check:i18n && npm run build`
  - Expected: all pass. The i18n check may warn about unused keys if it checks for them; they get used in Tasks 4–6.

- [ ] **Step 5: Commit.**
  - Files: the moved tokens, kit, helpers, layout, routes, locales and pages.
  - Message: `feat(customer): shared tokens, customer kit, shell and tab bar`.

### Task 4: Menu page and item page

**Files:**
- Modify: `frontend/src/areas/customer/pages/MenuPage.tsx`, `pages/ItemPage.tsx`
- Create: `frontend/src/areas/customer/components/MenuHeader.tsx`
- Delete: `components/ItemCard.tsx`, `components/ItemSheet.tsx`. Remove `RecentOrders` from `MenuPage`; the file stays for Task 6.

**Interfaces:**
- Consumes: the Task 3 kit, `itemMatches`, `hoursLine`, `clockLabel`; `ShopOut.extra_wait_minutes`; `MenuItem.is_popular`.
- Produces: `MenuHeader({ query: string; onQuery: (q: string) => void; categories: { id: number; name: string }[]; activeId: number | null; onPick: (id: number) => void })`.

- [ ] **Step 1: Write `MenuHeader`.**
  - Sticky top, `rgba(255,255,255,.92)` with `backdropFilter: "blur(8px)"`, padding 8/16/12, bottom border `tokens.border`.
  - Shop name 20px/600, letter-spacing -.02em.
  - **Status line**, 12px `tokens.muted`:
    - open: `shop.openUntil` with `clockLabel(openUntil)`
    - closed: `shop.closedOpensAt`. `when` is `clockLabel(opensAt)` when `dayOffset === 0`, otherwise the localised short weekday plus the time.
    - When `hoursLine` returns `null`, it falls back to the existing `shop.open` / `shop.closed` text.
  - `LanguageSwitch` on the right.
  - Search `TextInput` with a search icon, radius 10, background `tokens.secondaryBg`, no border.
  - Category chips: a horizontal scroll of round `Chip`/`Button`s. The active one is orange filled; the others use `tokens.secondaryBg`.
  - Chips are hidden while `query` is not empty.

- [ ] **Step 2: Rewrite `MenuPage`.**
  - Keep the existing closed, paused and counter-only alerts and their copy.
  - **Busy banner:** when `extra_wait_minutes > 0`, show `customer.busy` with `IconAlertTriangle` in `tokens.warning`, background `tokens.busyBg`, radius 12 and 13px `tokens.body` text.
  - **Popular section:** the `customer.popularSection` title (14/600) above the Popular items, when any exist and no search is typed.
  - **Categories:** each category as a titled section (`id={"cat-" + id}`) of `ItemRow`s with 10px gaps.
  - **Chips** scroll with `scrollIntoView({ behavior: "smooth" })`, with an offset for the sticky header via `scroll-margin-top`. An `IntersectionObserver` sets `activeId`.
  - **Search** filters with `itemMatches`. When nothing matches, show `customer.noMatch`.
  - **Opening an item:** `navigate("/item/" + id)`.
  - **Scroll position:** save `window.scrollY` to `sessionStorage("menu-scroll")` before navigating, and restore it once the menu data is present on mount.

- [ ] **Step 3: Write `ItemPage`.**
  - `useParams().id` goes through `Number`. A NaN id, or an id not in `indexMenu(menu)`, shows `customer.itemGone` with a `customer.browseMenu` link to `/`. While the menu is still loading, show a `Loader`.
  - **Top:** a back button (`navigate(-1)` when `history.state?.idx > 0`, else `navigate("/")`), then `PhotoTile size="full"` (aspect 4/3) using `image_url_large ?? image_url`.
  - **Details:** name 22/600, description, price.
  - **Groups:** each group has its title and `ruleLabel`, then `ChoiceRow`s.
    - Radio when `max_select === 1`, checkbox otherwise.
    - The selection rules and validity reuse `Chosen`, `chosenIds`, `choicesValid` and `ruleLabel` from `components/OptionPicker.tsx`.
    - Sold-out options are disabled.
  - **Note:** the existing `customer.itemNote` field.
  - **`BottomBar`:**
    - **Can order** (`shop.can_order_online` and not sold out): a quantity pill (− n +, 1..20) and a button with `customer.addToCart` and `total = unitPrice(item, ids) * qty`. It is disabled until `choicesValid`. On click: `cart.add(item.id, ids, qty, note)`, then go back to the menu the same way as the back button.
    - **Otherwise:** a muted full-width message, `customer.orderAtCounter` (counter-only) or the sold-out label.

- [ ] **Step 4: Verify.**
  - Run `npm run typecheck && npm run check:i18n && npm run build`. Expected: pass.
  - **Browser at 390px:**
    - search with "MILO" and with an accented query
    - chips scroll and highlight
    - Popular section appears after selling 5 units (or after an owner pick through the API)
    - banner shows when two orders are made late in the DB
    - item page: back keeps the scroll position, direct load of `/item/<id>` works, `/item/abc` and `/item/99999` show the gone state
    - counter-only mode: no add bar, no Cart tab
    - EN and BM

- [ ] **Step 5: Commit.**
  - Message: `feat(customer): menu header, search, Popular, busy banner and item page`.

### Task 5: Cart and checkout

**Files:**
- Modify:
  - `frontend/src/areas/customer/pages/CartPage.tsx`
  - `components/CartLines.tsx`
  - `pages/CheckoutPage.tsx`
  - `frontend/src/api/types.ts`, if `OnlineOrderIn` needs `customer_name` exposed. It comes from the generated schema.

**Interfaces:**
- Consumes: `BottomBar`, `tokens`; `ShopOut.prep_minutes` and `extra_wait_minutes`; `loadDetails`/`saveDetails` (`GuestDetails` already has `name`).

- [ ] **Step 1: Cart ("Your order").**
  - The title is `customer.yourOrder`.
  - **Line cards:** each `CartLines` line becomes a white card (radius 16, `tokens.cardShadow`, padding 12) with the `PhotoTile` at 56, the name, option names and note, the line price and a quantity stepper. Removing at 0 keeps the existing behaviour.
  - **Quote problems:** keep showing them per line as today.
  - **Summary card:** the total from the quote.
  - **`BottomBar`:** the `customer.checkout` button, disabled while the cart has problems or the quote is loading.
  - **Empty cart:** keep the existing empty state.
  - **Read-only lines:** `CartLines` keeps its `editable={false}` mode for checkout. That mode shows no steppers.

- [ ] **Step 2: Checkout.** Sections as white cards with 14/600 titles:
  - **`customer.pickup`:** `customer.pickupAsap`. `time` = `formatTime` of `now + (prep_minutes + extra_wait_minutes) minutes`. Re-render each minute with an interval.
  - **`customer.whoCollecting`:** a Name `TextInput` (optional, `maxLength={50}`, `autoComplete="name"`, starts from `loadDetails().name`) and the existing phone input unchanged.
  - **Order note:** as today.
  - **`customer.payment`:** read-only `CartLines` plus the total, and `customer.pickupOnly`.
  - **`BottomBar`:** the existing pay button and privacy text.
  - **Submit:** sends `customer_name: name.trim() || null`, and on success saves `saveDetails({ name: name.trim(), phone })`.
  - **Errors:** all existing error handling unchanged.

- [ ] **Step 3: Verify.**
  - Run `npm run typecheck && npm run check:i18n && npm run build`. Expected: pass.
  - **Browser:**
    - add, change and remove lines
    - a sold-out-while-in-cart problem still blocks checkout
    - the checkout estimate moves when the extra wait changes
    - a placed order shows the name on the staff order page, and the name and phone come back on the next checkout

- [ ] **Step 4: Commit.**
  - Message: `feat(customer): cart and checkout redesign, name at checkout`.

### Task 6: Tracking, Orders tab and the owner Popular switch

**Files:**
- Modify:
  - `frontend/src/areas/customer/pages/OrderPage.tsx`
  - `pages/OrdersPage.tsx`
  - `components/RecentOrders.tsx` (becomes the Orders tab's list)
  - `frontend/src/areas/staff/components/menu/ItemDrawer.tsx`

**Interfaces:**
- Consumes: `TrackingOut` (`placed_at`, `prep_minutes`, `ready_at`, `status`, `items`, …), `loadRecent`, `AdminItem.is_popular`, `useUpdateItem`/`useCreateItem`.

- [ ] **Step 1: Tracking.**
  - **Heading**, 22/600:
    - `ready` → `tracking.readyNow`
    - `placed`/`preparing`, when `placed_at + prep_minutes` is in the future → `tracking.readyAt` with `formatTime`
    - when it is in the past → `tracking.runningLate`
    - Re-evaluate every 30s, alongside the existing polling.
  - **Other states:** awaiting payment, completed, cancelled and refunded keep their existing copy and actions (pay again, cancel unpaid, reasons), restyled into cards.
  - **Order code** in large type, as today, inside a white card.
  - **Timeline:** a vertical list of the `tracking.step.*` steps, each with its time: `placed_at`, `ready_at` and `completed_at`. `TrackingOut` has no preparing time, so Preparing shows no time. Done steps get an orange dot, the current step an orange ring, future steps grey. Cancelled orders show the reason card instead of the timeline.
  - **`tracking.inThisOrder` card:** lines and total, then the existing Order again button.
  - **No tab bar** here; it is already hidden by the route.

- [ ] **Step 2: Orders tab.**
  - `OrdersPage` renders the list from `RecentOrders`, restyled as cards: number, `formatTime(placedAt)`, total and the live status badge, keeping its existing fetching.
  - Each card links to `/t/{token}`.
  - When `loadRecent()` is empty, show `customer.ordersEmpty`.

- [ ] **Step 3: Owner switch.**
  - `ItemDrawer` gets a `Switch` labelled `console.menu.popular` with description `console.menu.popularHelp`.
  - It is bound to `is_popular` and sent on create and update like the other fields.
  - **Owner only:** the drawer is already owner-only. Confirm staff never see it.

- [ ] **Step 4: Full checks.**
  - Run `cd backend && uv run pytest -q`, then `cd ../frontend && npm run typecheck && npm run check:i18n && npm run build`. Expected: all pass.
  - **Browser walk at 390px:** Menu → Item → Cart → Checkout → Tracking → Orders.
    - online mode and counter-only mode
    - EN and BM
    - items with and without photos
    - busy and not busy
    - tracking in the placed, late, ready, collected and cancelled states
    - owner toggles Popular and the menu shows it within 30s
    - staff see no costs and no Popular switch

- [ ] **Step 5: Commit.**
  - Message: `feat(customer): tracking timeline, Orders tab, owner Popular switch`.
