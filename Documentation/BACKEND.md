# Snack Shop Ordering — Backend

API and database for a single snack shop's online ordering system — fried
and savoury items, sweet bites, cooked to order for collection. Customers
place pickup orders and track them; staff manage the order queue and menu.
Payment is cash on collection. There is no delivery and no online payment.

Each staff member signs in as themselves and works a shift. Sales are
attributed per person, because pay here is commission-based — which makes the
order and event tables payroll evidence, not merely an audit trail. That
single fact drives most of the access rules below.

This repository serves a JSON API only. The customer and admin interfaces
live in a separate frontend repository and are deployed independently.

A plain-English version of this document, for the shop owner rather than a
developer, is in [OVERVIEW.md](OVERVIEW.md).

## Stack

- Node with Express, TypeScript
- Prisma ORM against MySQL
- Zod for request validation
- MySQL and application hosting on Railway
- Cloudflare R2 for product images, via the S3-compatible SDK and presigner
- Sentry for error tracking
- Cloudflare Turnstile verification on checkout

## Architecture

The API is a single Express service. The frontend is a separate origin, so
CORS needs an allowlist containing only the frontend origin, with
credentials enabled and preflight handled.

### Cookie domain constraint — resolve before building auth

Staff sessions use a JWT in an httpOnly cookie. If the API and frontend sit
on unrelated hosts such as `railway.app` and `pages.dev`, that cookie is
third-party: Safari blocks it and Chrome is phasing it out. Staff login will
work on some machines and silently fail on others.

Per-staff logins raise the stakes here. One shared account on one counter
machine could have limped along; several people signing in and out, some from
their own phones, cannot. Treat the custom domain as a prerequisite.

The fix is a custom domain covering both, for example the API on
`api.example.com` and the app on `shop.example.com`, with the cookie scoped
to the parent domain.

Without a custom domain, auth must instead issue bearer tokens held in
frontend memory with a refresh flow — more code, more XSS exposure, and a
different contract for the frontend. **Decide this in phase B0.** Changing
it later means rewriting the auth layer on both sides.

### Image uploads

Image bytes never pass through this service. The API issues a presigned PUT
and the browser uploads directly to R2.

1. Client requests a presign for a given content type and size.
2. API verifies the admin session, validates type and size, returns a URL
   scoped to a products path with a generated filename.
3. Browser uploads to R2 directly.
4. Client saves the resulting public URL on the product record.

The R2 bucket needs its own CORS policy allowing PUT from the frontend
origin — separate from this service's CORS config. Serve reads through an R2
custom domain; the default `r2.dev` URL is rate-limited and unsuitable for
production. Add a lifecycle rule deleting unreferenced objects, since
abandoned edit forms leave orphans.

## Conventions

**Money** — always integers in sen. RM 12.90 is `1290`. Never float, never
decimal. Prisma should map these as integers; its decimal type needs
conversion at every boundary for no benefit here.

**Naming** — camelCase in application code, snake_case in the database, via
Prisma field and model mapping. Establish this in the first model or the
schema ends up half and half.

**Time** — all timestamps stored in UTC. The service sets its timezone to
`Asia/Kuala_Lumpur` for slot arithmetic and display. Pickup slots are where
timezone bugs surface first.

**Deletion** — nothing is ever hard-deleted. Products and categories carry a
deleted-at timestamp. Order history references products permanently, so a
hard delete would either be refused by the foreign key or destroy past
orders.

Prisma has no built-in soft delete, so put every menu read behind a
repository module rather than repeating the filter at each call site.
Missing it once makes deleted items reappear on the storefront.

**Price snapshots** — order line items store the product name and unit price
as they were at time of order. Changing a price later must never rewrite a
past receipt.

**Order events** — append-only. Every status change and notable staff action
writes a row. It feeds the customer's status timeline, the admin audit trail,
and the sales figures pay is calculated from. Each row records the staff
member who performed the action and the shift they were on.

Because wages depend on these rows, treat the table as a payroll record:
never update, never delete, never backfill an actor. A correction is a new
row, not an edit.

**Sales attribution** — an order counts towards the staff member who marked it
paid, not whoever accepted or prepared it. The value is written onto the
order at the moment the payment flag flips, and never recalculated.

Resist deriving attribution later by matching order times against shift start
and end times. It breaks the moment two people are on at once, which is the
normal case at lunch.

**Order codes** — format `YYMMDD-XXXX`, suffix random base32. Non-sequential
so order volume is not leaked to anyone counting, still sortable and
readable over the phone.

**Validation** — Zod validates every request body at the edge. Prisma types
describe the database, not untrusted browser input; keep the two separate.

**Authority** — where a rule also exists in the frontend, such as phone
normalisation, money formatting or slot availability, this service is
authoritative. Assume the client copy is stale or bypassed entirely.

## Data model

Field names below are conceptual; apply the naming convention above.

**categories** — name, sort order, deleted at.

**products** — category reference, name, description, price in sen, image
URL, is available, is published, sort order, deleted at.

**variants** — product reference, name, price delta in sen, is available.

**orders** — order code, public token (unique, indexed), customer name,
phone as typed, phone normalised, fulfilment type, scheduled for, status,
payment status, paid at, paid by staff reference, paid in shift reference,
cancel reason, notified at, consented at, subtotal in sen, total in sen,
idempotency key, created at.

The three payment columns are the sales attribution, denormalised onto the
order so that a report is a plain aggregate and no later change to a shift
can silently rewrite what somebody was paid.

Also on orders, present but unused: address, delivery fee in sen, both
nullable. They cost nothing now and save a migration against live order data
if delivery is ever added. The API rejects any fulfilment type other than
pickup.

**order_items** — order reference, product reference, variant reference,
name snapshot, unit price in sen, quantity, line total in sen.

**order_events** — order reference, status, note, actor staff reference,
actor shift reference, created at. Append only.

**settings** — key and value pairs.

**staff_users** — display name, username, PIN or password hash, role,
commission percent (nullable), is active, created at, deactivated at.

Two roles only: `owner` and `staff`. Never hard-delete a staff row — pay
history references it permanently. Deactivating blocks sign-in and leaves
every past figure intact.

**shifts** — staff reference, started at, ended at, opening float in sen,
counted cash in sen (nullable), note, was auto-closed, closed by staff
reference (nullable, set when an owner closes or corrects someone else's
shift).

One open shift per staff member. Shifts belonging to different staff may
overlap freely; that is the normal case, not an error.

Expected cash is derived from the float plus attributed sales rather than
stored, so it cannot drift out of step with the orders behind it.

## Business rules

### Order lifecycle

`New → Accepted → Preparing → Ready → Completed`, with `Cancelled`
reachable from any state before Completed. Every transition writes an event.

Payment is a separate flag moving unpaid to paid, marked at handover. Keeping
it out of the main status avoids needing a combined "ready but unpaid" state.

### Cancellation

Customers may cancel only while the order is New. After that the API
refuses, and the frontend directs them to phone the shop — once the kitchen
has started, a self-serve cancel costs ingredients.

Staff cancellation requires a reason, which is returned to the customer.

### Staff accounts and roles

Everyone who touches the order queue signs in as themselves. There is no
shared counter account. Two people on one login makes every sales figure
meaningless, and with pay attached to those figures that is not a tidiness
preference.

**staff** — the order queue, status transitions, the payment flag, the
notified flag, availability toggles, their own shift, and their own sales
figures. Nothing else.

**owner** — all of that, plus the menu, prices, settings, staff accounts,
every staff member's figures, and shift corrections.

The split exists because commission creates a specific conflict of interest.
A staff role must not be able to change a price, edit their own shift,
reassign an order's attribution, or read another person's figures. Enforce
each of those against the role held in the session, server-side. A hidden
button in the frontend is not a control.

### Shifts

A shift opens when a staff member starts one and closes when they end it. It
carries an opening float so the till reconciles, and optionally a counted
cash figure at close.

Marking an order paid with no open shift is refused. Without that rule the
sale lands nowhere and surfaces as a shortfall at the end of the month, long
after anyone can reconstruct what happened.

A shift still open past a configured maximum is closed by the nightly job and
flagged as auto-closed rather than quietly ended. Staff forget to clock out,
and one shift left running for three days poisons every report that touches
it.

Only an owner may alter a closed shift, and the alteration writes an event
recording who changed what, when, and what the value was before.

### Sales attribution

The rule itself is in Conventions above; its consequences are here.

**Confirm the rule with the shop before building it.** It decides what people
are paid, so it is not a developer's call. The alternatives are attributing
to whoever accepted the order, or splitting it across everyone who touched
it. Paid-by is recommended: cash changes hands exactly once, that moment has
exactly one owner, and it is the only version that reconciles against the
money in the till.

An owner may reassign attribution. Doing so updates the order and writes an
event carrying the previous value; the log is never overwritten.

Cancelling an order that has already been marked paid requires an owner, and
reverses the attribution with an event on the order. Without that, anyone
could inflate a figure by marking orders paid and cancelling them later.

### Pay reporting, not payroll

This service reports sales per staff member and per shift. It does not
calculate wages, tax, EPF or SOCSO, and must not grow to. A commission
percentage stored against a staff member lets a report show an indicative
figure; the authoritative payroll calculation happens outside this system.

### Pickup slots

One server-side function computes available slots for a date and is the only
source of truth. Both the slot listing endpoint and the order validator call
it. It accounts for opening hours, closed days, minimum lead time so nothing
is ordered for five minutes from now with an empty fryer, the daily cutoff,
and per-slot capacity. Capacity counts exclude cancelled orders. A closed day
returns no slots.

Lead time and slot length are settings, not constants, and this shop's values
will be short — minutes, not days. Food is cooked to order and does not hold:
if a slot runs longer than the food stays good, a ready order becomes a cold
one. Per-slot capacity therefore models kitchen throughput rather than oven
or fridge space. Nothing in the function assumes either shape; do not
hard-code defaults that only suit long lead times.

### Availability

Sold-out is a manual toggle per product and per variant. No counts, no
quantities, no ingredient tracking.

The real risk is staff forgetting to clear it. Two defences: a nightly job
resets everything to available in the early morning, and the dashboard
aggregate exposes a sold-out count the frontend renders as a permanent
banner. The banner matters because the job will fail silently one day.

### Phone numbers

Normalise on receipt. Strip non-digits, convert a leading zero to the
country code, leave an existing country code alone. Store both the raw input
for display and the normalised form for the WhatsApp link the admin UI
builds. Reject orders where normalisation fails.

### Order creation

Transactional: order, items and first event written together. Availability
and slot capacity revalidated server-side, never trusted from the client. An
idempotency key makes a double-tapped button produce one order.

### Abuse and no-shows

Pickup with cash means a no-show costs whatever has already been cooked,
with no recourse — no address, no payment, only a phone number. Order values
here are small, so no single no-show hurts much; the exposure is cumulative,
and fried food cannot be re-sold once it has gone cold. Defences are
Turnstile verification, a cap on open orders per normalised phone per day,
slot capacity limiting total exposure, and the Accepted step as a human gate
before the kitchen starts.

Put that per-phone cap in the settings table rather than hard-coding it. A
snack shop sees far more legitimate same-day repeat ordering than a cake shop
does — the same customer at lunch and again at four is normal — so the right
number will not be known until real traffic is visible.

If no-shows become a real problem the answer is a deposit, which means
adding a payment method. Nothing in this design prevents that later.

## API surface

Described by area rather than exhaustively; shapes belong in the contract
module below.

**Public menu** — categories with their published, non-deleted products and
variants. Available pickup slots for a given date.

**Ordering** — create an order. Requires a Turnstile token, an idempotency
key and a consent flag.

**Tracking** — fetch an order by its public token. Look up an order by order
code plus phone, rate-limited per IP; without that limit the lookup form
recreates the enumeration hole the token exists to avoid. Customer
self-cancel while New.

Tracking responses must never include internal record ids, staff notes, or
any field not needed by the tracking page.

**Staff session required** — sign in and out. List and filter orders. Order
detail with items and event timeline. Change status. Set payment flag. Set
notified flag. Edit an order's lines while New or Accepted. Toggle
availability. Open a shift, close a shift, read the current shift. Read own
sales for a date range.

**Owner only** — menu CRUD. Settings read and write. Staff account create,
edit and deactivate. Dashboard aggregates across everyone. Sales by staff
member for a date range. Shift listing and correction. Reassign an order's
attribution. Cancel a paid order. Presign an image upload. CSV export,
including a payroll export of sales per staff per period.

Every owner-only route checks the role held in the session. Never trust a
role, a staff id or a shift id sent by the client — all three decide what
somebody is paid.

### Sharing the contract with the frontend repo

Two repositories cannot import from one another. Pick one approach in B0 and
document it in both repos:

- **Generated schema** — the API publishes an OpenAPI document, the frontend
  generates its types from it. Most robust, some setup.
- **Published types package** — a small versioned package the frontend
  depends on. Clean, but adds a release step to every contract change.
- **Manual mirror** — the frontend keeps hand-written types. Zero setup, and
  it will drift. Only acceptable if one person owns both repos.

Whichever is chosen, write the shapes for a phase's endpoints before
building them, so the frontend can build against mocks rather than waiting.

## Environment

Database connection string, JWT signing secret, allowed frontend origin, R2
account credentials and bucket name, R2 public base URL, Turnstile secret
key, Sentry DSN, timezone.

## Deployment

Railway, with migrations run as a release step — never on application boot,
and never with the interactive development migration command, which can
prompt to reset the database. Review every generated migration before it
runs, especially any that drops a column.

Prisma's client is heavy and adds engine initialisation on top of Node boot,
so keep the service warm rather than letting it idle. A customer's first page
load should not wait for a cold start.

A nightly database dump to R2, with a retention lifecycle rule. Test a
restore once; an untested backup is not a backup.

A second Railway environment seeded from fixtures, so testing never runs
against real orders.

## Build phases

The frontend track mirrors these numbers: its phase 2 consumes what B2
builds. Backend leads by one phase throughout.

### B0 — Foundations

Repository layout, TypeScript config, linting. Prisma schema covering every
model above, including the dormant delivery columns, with naming mapping
applied from the first model. Initial migration. Seed script with
categories, products, variants, a default settings row and an owner
account.
Express skeleton with CORS allowlist, cookie configuration, Zod error
handling and a health check. Railway deploying with migrations as a release
step. Sentry wired.

Resolve the custom domain question and choose the contract-sharing approach
here.

*Done when:* seeded data is readable from the deployed endpoints and
migrations run cleanly against a fresh database.

### B1 — Menu API

Menu endpoints returning published, non-deleted products with variants,
grouped by category. Repository module enforcing the soft-delete filter.
Money helpers.

*Done when:* soft-deleting a product removes it from the menu response while
leaving the row intact.

### B2 — Ordering, tracking, admin core

The largest phase.

Slot availability function and the settings that drive it. Order creation,
transactional, with revalidation, idempotency, code and token generation.
Phone normalisation. Turnstile verification and the per-phone daily cap.
Tracking by token. Lookup by code and phone, rate-limited. Customer
self-cancel while New. Staff auth with per-person accounts and the two roles,
session middleware, role-checked routes. Shift open and close, with the
one-open-shift rule. Order listing with filters, and detail with timeline.
Status transitions and payment flag, each writing an event carrying the staff
member and the shift. Sales attribution written at the moment of payment.
Availability toggles.

*Done when:* two rapid identical submissions create one order; a full slot is
rejected server-side even when the client offers it; the tracking response
contains no internal identifiers; an order marked paid records who marked it
and on which shift; marking paid with no open shift is refused; and a staff
role is refused a price change even when the request is sent straight to the
API.

### B3 — Staff tooling

Message templates in settings with placeholder substitution. Notified flag
endpoint, recorded independently of any client button. Menu CRUD with soft
delete. R2 presign endpoint with type and size checks behind the admin
session — configure bucket CORS and the orphan lifecycle rule here. Settings
CRUD. Dashboard aggregates. Nightly availability reset job. Order line
editing while New or Accepted, recalculating totals server-side and logging
the change, leaving price snapshots untouched.

Staff account management. Sales per staff member for a date range, and per
shift with opening float, attributed sales and expected cash. Attribution
reassignment and shift correction, both owner-only and both writing events.
Nightly auto-close of forgotten shifts. Payroll CSV export.

*Done when:* a product created through the API with an uploaded image
appears on the storefront with no direct database access; and two staff
working an overlapping lunch each see only their own sales, the two figures
summing to the day's takings with nothing double-counted.

### B4 — Operational

CSV export. Nightly dump to R2 with a verified restore. Staging environment
seeded from fixtures.

*Done when:* a restored dump produces a working database.

## PDPA obligations

The shop collects names and phone numbers, bringing it under Malaysia's
Personal Data Protection Act 2010 as amended in 2024. The amendments came
into force across 2025 and are now fully in effect. This is a working
summary, not legal advice — have a Malaysian firm review before real orders.

**No data protection officer needed.** The duty starts at 20,000 data
subjects, or 10,000 for sensitive personal data. A single shop is far below
either.

**Breach notification applies regardless of size.** Where a breach causes or
is likely to cause significant harm, or is of significant scale, the
Commissioner must be notified within 72 hours and affected individuals
within 7 days.

**Cross-border transfer rules touch this architecture directly.** Railway
and R2 both place customer data outside Malaysia. Set the Railway region and
R2 jurisdiction deliberately rather than accepting defaults. The frontend's
privacy notice discloses the transfer.

**Consent** is recorded as a timestamp on the order. Consent that cannot be
evidenced does not count.

**Retention** — order records kept for accounting, then deleted; cancelled
and abandoned orders deleted sooner. Confirm both periods with an accountant
and keep them consistent with the published notice.

**Staff data is personal data too.** Names, usernames and the sales figures
used to calculate pay are personal data about employees and fall under the
same Act. Staff should be told what is recorded about them and why, and no
staff member can read another's figures.

**Wage records outlast order records.** Malaysian employment law requires an
employer to keep wage records for a set period, and the orders behind a
commission figure are the evidence for one. The retention rule above must
therefore never delete an order that still supports a pay calculation.
Confirm both periods with an accountant and apply the longer one.

**Write a data breach incident procedure before taking real orders.** It
cannot be invented inside a 72-hour deadline. One page: who is contacted
first, what is recorded and when, who assesses the harm threshold, who
files, how customers are told.

## Out of scope

No delivery, no online payment, no customer accounts, no automatic customer
notifications, no stock counts or ingredient tracking, no multi-outlet
support, no payroll calculation, and no attendance or leave management beyond
the start and end of a shift.

A notify-customer function is stubbed at the status-transition point. If
email notifications are added later, that is where they attach, rather than
threading a new concern through the order code.

Deferred work the schema already accommodates: email notifications;
delivery, using the dormant address and fee columns; deposits or online
payment. Online payment would move the moment of payment away from handover,
so it means revisiting the attribution rule at the same time.
