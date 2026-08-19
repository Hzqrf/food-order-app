# Dessert Ordering — Frontend

Customer and admin interfaces for a single dessert shop's online ordering
system. Customers browse a menu, place a pickup order and track its status;
staff manage the order queue and menu. Payment is cash on collection. There
is no delivery and no online payment.

This repository contains the client only. The API and database live in a
separate backend repository and are deployed independently.

## Surfaces

Three route trees in one application.

- **Storefront** — public, no login. Browse menu, cart, checkout.
- **Tracking** — public, no login. Order status by token, or by lookup.
- **Admin** — login required. Order queue, menu, settings.

The admin tree is lazy-loaded so customers never download admin code. This
is a payload decision, not a security one: access control lives in the API,
and nothing in this repository may be treated as a control.

## Stack

- React with Vite, TypeScript
- React Router
- TanStack Query
- Tailwind CSS
- Cloudflare Pages for hosting
- Sentry for error tracking
- Cloudflare Turnstile widget on checkout

TanStack Query is chosen specifically for polling. The order board refreshes
every 10 seconds and the tracking page every 15, both as query
configuration rather than hand-rolled timers, and it refetches when a tab
regains focus — the common case for staff returning to the board.

## Architecture

### API origin and credentials

The API is a separate origin, so every request must send credentials
explicitly and the API must allowlist this origin. A single API client
module handles that, along with a shared response to authentication
failures.

### Admin session — confirm before building auth

The admin session depends on an httpOnly cookie set by the API. If the two
deployments sit on unrelated hosts such as `pages.dev` and `railway.app`,
that cookie is third-party: Safari blocks it and Chrome is phasing it out.
Admin login will work in development and fail on a staff member's phone.

The fix is a custom domain covering both, for example this app on
`shop.example.com` and the API on `api.example.com`.

If no custom domain is available, the backend issues bearer tokens instead
and this app holds one in memory with a refresh flow — a different auth
implementation entirely. **Confirm which before phase F2.**

### Server authority

Phone normalisation, money formatting and slot availability all exist on the
server. Any version here is a convenience for immediate feedback, never a
substitute. Assume every client-side check can be bypassed, and never let
the two implementations drift into disagreeing.

Business rules do not belong in this repository. If a rule needs
implementing here, that usually means it is missing an endpoint.

### Consuming the API contract

Two repositories cannot import from one another. The backend documents which
approach is in use — generated from an OpenAPI document, a published types
package, or a hand-written mirror. Follow it rather than inventing a second.

Build each phase against mock data as soon as the shapes are agreed, rather
than waiting for the endpoints to land.

## Conventions

**Money** — the API returns integers in sen. A single formatting helper
converts to display, used by every price on every screen. Never do
arithmetic on formatted strings.

**Time** — the API returns UTC. Display in the shop's local timezone. Pickup
times are the most visible place a timezone bug will show.

**Copy** — plain sentence case, active voice. A button says what happens
when it is used, and the confirmation echoes the same word. Errors say what
went wrong and what to do next. Empty states invite an action rather than
apologising.

**Quality floor** — responsive to mobile, visible keyboard focus, reduced
motion respected. Most customers will order on a phone and most staff will
work on a counter machine; both need to be genuinely usable, not merely
functional.

## Features

### Storefront

Menu grouped by category. Each item shows a photo, price, short description
and current availability. Item detail offers variants such as whole or slice
and flavour, plus add-ons such as candles or a message on the cake.

Sold-out items appear visibly unavailable and cannot be added.

The cart lives in browser storage and survives a refresh. A cart can sit
open for an hour, so the server rechecks availability and slot capacity at
checkout; the client must handle a rejection gracefully rather than assuming
its own state is current.

Checkout collects name, phone, pickup date and time slot, and notes. There
is no address field.

The phone field shows the parsed number back to the customer for
confirmation and blocks submission when it cannot be parsed. This is cheaper
than a second entry box and catches the same mistakes — and with no
accounts, a wrong digit means the shop cannot reach them at all.

The slot picker is driven entirely by the server's availability response.
When the shop is closed or fully booked it shows opening hours, never an
empty dropdown.

A Turnstile widget and an unticked consent checkbox sit beside the submit
button, which links to the privacy notice. Submission is blocked until the
box is ticked.

Submission carries an idempotency key and disables the button while in
flight.

### Tracking

Two ways in.

**Token link** — the primary route, and the confirmation screen after
checkout. The URL carries a long random token, so there is nothing to type
and nothing to enumerate. Staff also send this link over WhatsApp.

**Lookup form** — the fallback for a lost link, taking order code and phone.

Tracking tokens for recent orders are kept in browser storage and surfaced
as a quiet "Your recent orders" link in the header, covering the common case
of someone reopening the site on the same phone.

The page shows a vertical status stepper with a real timestamp against each
completed step, drawn from the API's event timeline. "Accepted 2:14 PM,
Preparing 2:31 PM" tells a customer far more than a highlighted pill.

Below it: pickup time, shop address, item list, and the total stated plainly
as payable in cash on collection.

Two states get their own treatment rather than being a step in the list.
**Ready** takes over the page, because that is the moment the customer needs
to act. **Cancelled** shows the reason staff entered — a silent cancellation
generates a phone call every time.

The page polls every 15 seconds while open.

Customers can cancel themselves only while the order is New. After that the
page shows the shop's phone number and asks them to call.

### Admin

**Order board** — the live queue, polling every 10 seconds, with a sound and
a badge when a new order arrives. Filters by status and date. Opening an
order shows its detail and full event timeline.

**Status controls** — move an order through `New → Accepted → Preparing →
Ready → Completed`, with `Cancelled` available before Completed and a reason
prompt when used.

**Payment flag** — separate from status, marked paid at handover.

**Order editing** — change quantities or remove lines while New or Accepted.
Totals come back recalculated from the server.

**Send WhatsApp** — opens WhatsApp Web in a new tab with a message
pre-filled from a template matching the order's current status; other
templates in a dropdown. Staff must already be signed in to WhatsApp Web,
which suits a counter machine.

The tab must open directly from the click handler and not after an await, or
popup blockers will suppress it. The button greys out with a "check phone
number" hint when the stored phone could not be normalised.

**Mark as notified** — a staff-ticked checkbox, and the authoritative record
that a customer was told. The WhatsApp button only records that a tab was
opened; the browser cannot know whether a message was sent, and the timeline
must not claim otherwise. Keep the two visually distinct so neither reads as
confirming the other.

**Message templates** — edited in settings, no deploy needed. Placeholders
cover customer name, order code, total, pickup time and tracking link.
Three to start: accepted, ready, cancelled.

**Phone link** — the customer's number as a tap-to-call link.

**Kitchen ticket** — a printable order summary with its own print
stylesheet, targeting a normal desktop printer.

**Menu management** — create and edit items with name, description, price,
image, category, sort order and published state. Delete is soft; items stay
in past orders.

**Image upload** — request a presigned URL from the API, upload the file
directly to R2, then save the returned URL on the product. Bytes never pass
through the API.

**Availability** — an in-stock or sold-out toggle per product and per
variant. No counts.

**Settings** — opening hours, closed days, orders per slot, minimum lead
time, order cutoff, shop phone and address, message templates.

**Dashboard** — today's order count, revenue, top sellers, and a permanent
banner counting currently sold-out items. The banner exists because staff
forget to clear sold-out flags and the nightly reset job will fail silently
one day.

**Export** — a CSV download of orders.

## Environment

API base URL, Turnstile site key, Sentry DSN. Vite bakes these in at build
time, so changing one requires a rebuild, not a restart.

## Deployment

Cloudflare Pages, building from the repository.

A catch-all redirect rule must send all paths to the index document with a
200 status. Without it, any deep link — a tracking URL in particular —
returns a 404 from Pages.

A preview branch seeded against the backend's staging environment, so
testing never runs against real orders.

## Build phases

Numbered to match the backend track: F2 consumes what its B2 builds. The
backend leads by one phase, so start each phase against mocks once the
shapes are agreed.

### F0 — Shell

*No backend dependency. Can start immediately.*

Vite with React and TypeScript, Tailwind, React Router. TanStack Query
client configured, including the polling intervals used later. API client
sending credentials, with a shared error boundary and a single handler for
authentication failures. Route trees stubbed — storefront, tracking, admin,
with admin lazy-loaded. Cloudflare Pages deploying with the catch-all
redirect rule. Sentry wired. Money formatting helper.

*Done when:* a deep link to an unbuilt route loads the app shell rather than
a 404, and the deployed app reaches the deployed API with no CORS errors.

### F1 — Browse and cart

*Needs backend B1.*

Storefront layout and menu listing grouped by category. Item detail with
variants and add-ons. Cart persisted in browser storage, with quantity
editing and removal. Sold-out items unavailable and not addable.

*Done when:* a full cart survives a refresh and totals are correct to the
sen.

### F2 — Order, track, admin core

*Needs backend B2.* The largest phase.

Checkout form with the phone confirmation behaviour, server-driven slot
picker, Turnstile widget, consent checkbox, idempotency key and in-flight
button state. Confirmation screen, which is the tracking page. Tracking page
with the stepper, its distinct Ready and Cancelled states, and polling.
Lookup form. Recent orders in browser storage, surfaced in the header.
Customer self-cancel while New. Admin login and protected route tree. Order
board with polling, sound, badge, filters and detail view. Status controls,
cancellation reason prompt, payment flag. Availability toggles. Privacy
notice page, linked from the footer and from checkout.

*Done when:* an order placed on the storefront reaches the board within ten
seconds and the customer sees every subsequent status change with correct
timestamps.

### F3 — Staff tooling

*Needs backend B3.*

WhatsApp button with template selection and the disabled state. Mark-as-
notified checkbox. Template editor. Menu CRUD forms. Image upload via
presigned URL. Settings screen. Dashboard with the sold-out banner. Order
editing UI.

*Done when:* a new product can be created with an image and ordered from the
storefront entirely through the UI.

### F4 — Polish

*Needs backend B4.*

Printable kitchen ticket. CSV export trigger. Bahasa Malaysia privacy notice
and a language toggle.

*Done when:* the shop can run a full day without developer involvement.

## Privacy notice

The shop is subject to Malaysia's Personal Data Protection Act 2010 as
amended. The backend documents the operational obligations; this repository
owns the customer-facing notice.

The notice lives at a dedicated route, linked from the storefront footer and
again beside the checkout button. Checkout carries an unticked consent
checkbox reading: *"I have read the Privacy Notice and consent to my details
being used to process this order."*

The Act requires the notice in both Bahasa Malaysia and English. English
only is a compliance gap; the BM version lands in F4.

Placeholders in square brackets need filling before publication. Seven years
is the usual Malaysian accounting answer for retention, but confirm it, and
keep it consistent with what the backend actually deletes.

---

PRIVACY NOTICE

[Shop name] ("we") is the data controller for personal data collected
through this website, in accordance with the Personal Data Protection Act
2010.

WHAT WE COLLECT

When you place an order: your name, phone number, order details and any
notes you provide. We do not collect delivery addresses, and we do not
collect payment card details — all orders are collected in person and paid
in cash.

WHY WE COLLECT IT

To prepare and fulfil your order, to contact you about that order, to keep
accounting records, and to resolve disputes. We do not use your details for
marketing and we do not sell or share them with third parties for their own
purposes.

WHO CAN SEE IT

Our staff, and our service providers who host this website and its database.
These providers process data only on our instructions.

WHERE IT IS STORED

Our hosting and file storage providers operate servers outside Malaysia.
Your data is therefore transferred and stored abroad under safeguards
intended to give it protection equivalent to that required by the Act.

HOW LONG WE KEEP IT

Order records are kept for [X] years for accounting purposes, then deleted.
Cancelled and abandoned orders are deleted after [X] months.

YOUR RIGHTS

You may request access to your personal data, ask us to correct it, limit
how we use it, or withdraw your consent. Withdrawing consent means we can no
longer process outstanding orders. Contact us at [email] or [phone].

SECURITY

We use encrypted connections and restrict access to order data to authorised
staff. No system is completely secure, and we cannot guarantee absolute
security.

CHANGES

The current version of this notice is always available at this page.

Last updated: [date].

---

## Out of scope

No delivery, no online payment, no customer accounts, no automatic customer
notifications, no multi-outlet support, no per-staff admin logins.

Deferred: email notifications; delivery; per-staff logins; deposits or
online payment. Each depends on backend work first.
