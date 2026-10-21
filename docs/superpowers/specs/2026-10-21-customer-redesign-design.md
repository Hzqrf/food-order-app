# Customer app redesign: design

- **Date:** 2026-10-21
- **Status:** approved in brainstorming, awaiting spec review
- **Source design:** the user's Claude Design for the customer app (https://claude.ai/artifact/9aEqYmd4AFpEQAgCj9ZuDA): Menu, Item, Cart, Checkout, Tracking, bottom tab bar

## Goal

Rebuild every customer screen to follow the user's new design, in the app's orange instead of the design's accent colour. Add a few small improvements that make the customer app more honest and easier to use: a Popular label, a busy-kitchen banner, a realistic ready time, an item page with its own link, and photo placeholders.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Scope | Look plus a small backend change. Pre-orders ("Choose time") and pay at the counter wait for their own sub-projects. |
| Colour | Orange (`#c2410c`, Mantine `orange`, shade 7) wherever the design uses its accent. Greys, card style, radius and shadow follow the design, which already matches the Staff Console tokens. |
| Popular | **Both:** the owner can pick Popular items; when none are picked, the 3 best sellers are shown automatically. |
| Who is collecting | An optional Name, next to the existing optional Mobile. |
| Approach | A small customer kit built on tokens shared with the Staff Console. Rejected: importing console components (built for desktop tables; changes would leak) and a separate customer theme (the two apps would drift). |

**Left out of the design on purpose:**
- **Tax line:** there is no tax in the app.
- **"Counter N":** there is one counter.
- **Avatar and saved card:** there are no customer accounts or saved cards. The EN/BM switch takes the avatar's place.
- **"Kaunter":** the app stays white-label. Customers see only the shop name.

**Correction found in the code:** menu items have one name, not separate English and Malay names. Search therefore covers the item's name and description, ignoring case and accents.

## Scope

**In:**
- shared tokens and a customer UI kit
- page shell: grey page, 480px centred column, Inter font
- sticky Menu header, bottom tab bar, Orders tab
- restyled Menu, new item page at `/item/:id`, restyled Cart, Checkout and Tracking
- photo placeholder tile
- search over name and description
- Popular (owner switch plus automatic fallback)
- busy banner and pickup estimate
- Name at checkout

**Out:**
- pre-orders and "Choose time"
- pay at the counter
- customer accounts, saved cards, tax
- Malay item names
- staff screens, except the one Popular switch in the item editor

## 1. Data

### New column (one Alembic migration)

| Table | Column | Type | Meaning |
|---|---|---|---|
| `menu_items` | `is_popular` | `Boolean`, not null, default false | The owner marked this item as Popular. |

Existing rows get `false`.

## 2. Backend

### Popular (`app/menu/service.py`)

`_build_public_menu` decides which item ids are Popular:
1. If any active item has `is_popular = true`, exactly those items are Popular.
2. Otherwise the result is automatic. It takes the top 3 active items by units sold over the last 14 business days, counting only items with at least 5 units.
   - **Units** are `sum(order_items.quantity)` on sales orders: status in `SALES_STATUSES` and `payment_status = 'paid'`, the same base as the reports.
   - Cancelled and refunded orders don't count.
   - Ties are broken by item id.
3. With no qualifying items, nothing is Popular.

The rule lives in its own function, `popular_item_ids(db, branch, today) -> set[int]`, so it is tested directly. The public menu is already cached for 30 seconds, which is fine for this.

**API changes:**
- `MenuItemOut` gains `is_popular: bool`. This is the effective value from the rule above.
- `AdminItem` gains `is_popular: bool`. This is the owner's own switch.
- `ItemIn` and `ItemPatch` gain `is_popular`.
- `is_popular` joins the audited fields of `menu_item_changed`.

### Busy kitchen (`app/orders/metrics.py`, `app/shop`)

New function: `extra_wait_minutes(db, branch, now) -> int`.
- **Late orders:** status `placed` or `preparing`, with `placed_at < now - prep_minutes`. This is the same filter as `running_late`.
- **Fewer than 2 late orders:** the result is `0`.
- **2 or more:** take each late order's lateness in minutes (`now - placed_at - prep_minutes`) and average them. Round the average **up** to the next multiple of 5, so 1 to 5 becomes 5 and 6 to 10 becomes 10. Cap the result at 60.

`ShopOut` gains `extra_wait_minutes: int`.
- `GET /shop` fills it in, and the route now takes `db`.
- The staff and admin routes that also return `ShopOut` fill it in the same way.
- It carries minutes only: no counts, no order details, no money.

### Customer name

No backend change. `OnlineOrderIn.customer_name` already exists (max 50 characters).

## 3. Frontend

### Shared tokens and customer kit

**Shared tokens.** Move `areas/staff/console/tokens.ts` to `src/ui/tokens.ts`. The console imports it from there; its values don't change.

**Customer kit** in `areas/customer/ui/`, built on those tokens:
- `PhotoTile`: the item photo or, without one, a soft orange tile (`#fff7ed` background) with the item's first letter in `#c2410c`. Used at 84px in lists and full width on the item page.
- `ItemRow`: the design's item card.
  - Flex row, gap 14, padding 12, radius 16, white, card shadow.
  - 84px `PhotoTile` on the left.
  - Name 15px weight 600, description 13px `#6B6B6B` cut to 2 lines, price 15px weight 600.
  - A "Popular" label, or a grey "Sold out" label with the card at opacity .55.
- `TabBar`:
  - Menu, Cart (with a count badge), Orders.
  - Fixed to the bottom, respecting the safe-area inset.
  - The active tab is orange.
- `ChoiceRow`:
  - Radio or checkbox rows with an inset border `#D0D5DD` and radius 12, the option name, and the price change.
  - Selected rows get the orange border, tint and tick.
  - Replaces `OptionPicker` in the customer app only; staff keep theirs.
- `BottomBar`: a fixed bottom action area for the item, cart and checkout buttons.

### Shell and navigation

**`CustomerLayout`:**
- page background `#F4F5F7`
- content column at most 480px, centred
- Inter Variable loaded for the customer app
- shows `TabBar` on `/`, `/cart` and `/orders`; hides it on `/item/:id`, `/checkout` and `/t/:token`

**Menu header:** sticky, white at 92% opacity with an 8px blur, bottom border `#EAECF0`.
- Shop name: 20px, weight 600.
- Status line, 12px grey:
  - open: "Open until 10:00pm · 15 min prep"
  - closed: "Closed · opens 8:00am"
- The EN/BM switch sits on the right.

**Counter-only mode** (`can_order_online` false while the shop is open):
- no Cart tab and no add buttons
- items still open their item page, which shows "Order at the counter" instead of an add bar

### Routes

| Path | Screen |
|---|---|
| `/` | Menu |
| `/item/:id` | Item page (new). Replaces `ItemSheet`. |
| `/cart` | Cart |
| `/checkout` | Checkout |
| `/orders` | Orders on this phone (new). Replaces the `RecentOrders` block on the Menu. |
| `/t/:token` | Tracking |

**Back to the menu.** Going back from an item returns to the menu at the same scroll position.

**Unknown or removed items.** An unknown or inactive item id shows "This item isn't on the menu any more" and a link back to the menu.

### Screens

**Menu:**
- **Top of the page:**
  - the existing alerts (closed, paused, counter-only)
  - a search box, then round category chips that scroll to their section and highlight the one in view
- **Busy banner** when `extra_wait_minutes > 0`.
  - Background `#FEF6E7`, amber warning icon, radius 12, 13px text.
  - Text: "The kitchen is busy. Pickup times are running about {n} minutes longer."
- **"Popular this week"** section first, when any item is Popular, then each category.
- **Search:**
  - Filters items by name and description, ignoring case and accents.
  - Shows "No items match '{q}'" when nothing matches.
  - Hides the Popular section and chips while a search is typed.

**Item page:**
- full-width photo or placeholder, then name, description and price
- option groups as `ChoiceRow`s, with the existing min/max rules and sold-out options disabled
- a note field
- `BottomBar` with a quantity pill and "Add to cart · RM12.50", using the live total

**Cart ("Your order"):**
- **Line cards:** each line is a card with its options, note, a quantity stepper and remove.
- **Summary card:** the total, from the quote, as today.
- **Checkout button:** in a `BottomBar`.
- **Empty cart:** says so, with a link to the menu.
- **Problems the quote reports:** sold-out or changed items are shown as today.

**Checkout:**
- **Pickup card:**
  - "As soon as possible · ready around {time}"
  - `time` = now + `prep_minutes` + `extra_wait_minutes`, in the shop's timezone
- **Who is collecting card:**
  - Name: optional, at most 50 characters. New; sent as `customer_name`.
  - Mobile: optional, with the existing validation and read-back.
  - Both are saved with `saveDetails({ name, phone })` and filled in next time.
- **Order note:** as today.
- **Payment card:** the summary lines and total, then the existing pay button and privacy text in a `BottomBar`.
- **Errors:** all existing error handling stays (cart changed, shop closed, invalid phone, too many unpaid, network).

**Tracking:**
- **Heading:**
  - **Not ready yet, ready time still ahead:** "Ready for pickup at about {placed_at + prep_minutes}".
  - **Not ready yet, ready time passed:** "Running a little late. It won't be long."
  - **Ready:** "Ready now. Show this code at the counter."
  - **Collected, cancelled, unpaid:** keep their current messages, restyled.
- the order code in large type
- **Timeline:** Placed → Preparing → Ready → Collected, vertical, with the times that exist. A cancelled order shows its reason instead.
- **"In this order":** lines and total, then Order again.
- Pay again and Cancel for unpaid orders stay as they are.

**Orders tab:** the orders remembered on this phone (existing storage), newest first.
- Each row shows the number, time, total and current status (fetched as `RecentOrders` does today), and opens tracking.
- With no orders: "Orders you place on this phone show up here."

### Owner screen

The owner's item editor (`ItemDrawer`) gets a **Show as Popular** switch, with this help text: "If you pick none, the 3 best sellers are shown automatically."

### Text

All new text is in English and Malay. `npm run check:i18n` must pass.

## 4. Error handling

- **Shop info fails to load:** the menu still renders without the status line or banner, the same as today's fallback.
- **The extra wait can never be negative or above 60.**
- **The ready time is never shown in the past.** Tracking switches to "Running a little late" instead.
- **Item ids that aren't numbers** go to the "not on the menu" state, not an error page.

## 5. Testing

**Backend (pytest, MySQL test DB):**
- **Popular:**
  - an owner pick overrides the automatic list
  - the automatic list returns the top 3 by units, needs at least 5 units, and ignores cancelled, unpaid, refunded and older-than-14-days orders
  - ties are broken by id
  - the public menu exposes `is_popular`
  - an `is_popular` change writes `menu_item_changed`
- **Extra wait:**
  - `0` with no late orders and with 1 late order
  - rounds up to 5 and 10 at the edges
  - capped at 60
  - ready orders don't count
  - `GET /shop` returns `extra_wait_minutes`
- **Privacy:** the public `/shop` and `/menu` contain no `cost` keys and no order details.

**Frontend:**
- `npm run typecheck`, `npm run check:i18n`, `npm run build`
- **Browser check at phone width** through Menu → Item → Cart → Checkout → Tracking → Orders:
  - in online mode and in counter-only mode
  - in EN and BM
  - with and without photos
  - with a busy kitchen

## 6. Build order

1. Migration, Popular rule and admin field, extra wait on `/shop` (backend, TDD).
2. Shared tokens, customer kit, layout, tab bar, routes.
3. Menu (header, search, chips, banner, Popular) and the item page.
4. Cart and Checkout (Name, pickup estimate).
5. Tracking, the Orders tab and the owner Popular switch, then full checks.
