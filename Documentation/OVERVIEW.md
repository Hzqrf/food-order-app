# Your Online Ordering System — A Plain-English Overview

**For:** the shop owner
**About:** the pickup ordering website for your snack shop
**Last updated:** 24 August 2026

This document explains what we are building, what your customers will see,
what your staff will see, and what we need from you. There is no technical
jargon here. If you want the technical detail, it lives in
[BACKEND.md](BACKEND.md) and [FRONTEND.md](FRONTEND.md).

> **About the pictures in this document.** The screens below are *mockups* —
> drawings of how each page will work, made to show the layout and the
> wording. Your real site will use your shop name, your logo, your colours
> and photographs of your own food. Nothing about the look is final; the
> *behaviour* shown is what we are agreeing on.

---

## 1. In one paragraph

Customers browse your snack menu on their phone, put items in a basket,
choose a pickup date and time, and place an order without paying online (FOR NOW).
They get a link that shows the live status of their order — accepted,
preparing, ready. Your staff see every incoming order on one screen at the
counter, move it along with a button press, and message the customer on
WhatsApp when it is ready. Payment is cash when the customer collects.

---

## 2. What it does — and what it deliberately does not

| The system does | The system does not |
| --- | --- |
| Show your menu with photos and prices | Take card or online payment for now |
| Take pickup orders with a chosen time slot | Deliver, or collect an address |
| Let customers track their order live | Create customer accounts or passwords |
| Give staff one screen to run the day | Count ingredients or stock levels |
| Let staff edit the menu and prices themselves | Send automatic emails or texts |
| Mark items sold out with one tap | Support more than one outlet |
| Export the day's orders to a spreadsheet | Give each staff member their own login |

The right-hand column is not a list of missing work — these are decisions we
made on purpose to keep the system simple, cheap to run and quick to
launch. Every one of them can be added later; the system has been designed
so that adding them does not mean starting again. See
[section 9](#9-what-we-left-out-on-purpose-and-what-it-would-take-to-add).

---

## 3. How the pieces fit together

Three things talk to each other. You only ever see the two on the ends.

```mermaid
flowchart LR
  A["Customer<br/>on their phone"] --> B["Your website<br/>menu, basket, checkout"]
  B --> C["The order system<br/>stores every order,<br/>your menu and settings"]
  C --> D["Staff screen<br/>on the counter computer"]
  D --> C
  C --> E["Tracking page<br/>the customer keeps open"]
  E -.->|"updates by itself"| A

  style C fill:#FFF3EC,stroke:#B4471F,color:#241E1A
  style B fill:#FFFFFF,stroke:#C9BEB4,color:#241E1A
  style D fill:#FFFFFF,stroke:#C9BEB4,color:#241E1A
  style A fill:#F4EFE9,stroke:#C9BEB4,color:#241E1A
  style E fill:#F4EFE9,stroke:#C9BEB4,color:#241E1A
```

**The order system in the middle is the single source of truth.** If a time
slot is full, or an item has just sold out, the middle box refuses the order
even if the customer's phone still shows it as available. That matters: it
means two people cannot book the last 12pm slot at the same time.

---

## 4. What your customers see

### 4.1 The journey, start to finish

```mermaid
flowchart TD
  A["Opens your website"] --> B["Browses the menu<br/>by category"]
  B --> C["Adds items to the basket"]
  C --> D["Checkout:<br/>name, phone,<br/>pickup date and time"]
  D --> E["Ticks the privacy consent box<br/>and places the order"]
  E --> F["Sees the tracking page<br/>with an order code"]
  F --> G["Watches the status change:<br/>Accepted, Preparing, Ready"]
  G --> H["Collects in person<br/>and pays cash"]

  style E fill:#FFF3EC,stroke:#B4471F,color:#241E1A
  style H fill:#E6F6EE,stroke:#2F7D5B,color:#241E1A
```

The basket survives if they close the browser and come back an hour later.
The tracking link also gets saved on their phone, so "I lost the link" is
usually solved by reopening your site.

### 4.2 The three customer screens

<table>
<tr>
<td align="center"><img src="mockups/01-storefront-menu.svg" width="250" alt="Menu screen on a phone"><br><b>1. The menu</b></td>
<td align="center"><img src="mockups/02-checkout.svg" width="250" alt="Checkout screen on a phone"><br><b>2. Checkout</b></td>
<td align="center"><img src="mockups/03-tracking.svg" width="250" alt="Order tracking screen on a phone"><br><b>3. Tracking</b></td>
</tr>
</table>

**1. The menu.** Items grouped the way you group them — Chicken, Snacks,
Sweet Bites. Each shows a photo, a short description and the price. Anything
you have marked sold out appears greyed out and cannot be added, so nobody
orders keropok lekor you ran out of at 9am. The basket total sits at the
bottom of the screen the whole time.

**2. Checkout.** Four things only: name, phone, pickup slot, and an optional
note. **No address field, no card details.**

Two details on this screen were chosen deliberately:

- *The phone number is read back to the customer.* They type `012-345 6789`
  and the screen confirms `+60 12-345 6789` underneath. With no customer
  accounts, a mistyped digit means you cannot reach them at all — this
  catches it at the moment it happens, and it is friendlier than making them
  type the number twice.
- *Full slots show as full, not as missing.* If 1pm is fully booked it stays
  visible and greyed. An empty dropdown makes customers think the site is
  broken and phone you.

The tick box and the "you are not a robot" check are both required before
the button works — one is a legal requirement (see [section 8](#8-privacy-and-malaysian-law-pdpa)),
the other keeps automated junk orders out.

**3. Tracking.** This is the page the customer sees straight after ordering,
and the page your staff send over WhatsApp. It shows each completed step
**with the actual time it happened** — "Accepted 2:14 PM, Preparing 2:31 PM"
— because a real timestamp tells a waiting customer far more than a
highlighted label. Underneath: pickup time, your address, the item list and
the total, stated plainly as payable in cash on collection.

Two moments get special treatment rather than being just another line:

- **Ready** takes over the whole screen, because that is the moment the
  customer needs to act.
- **Cancelled** always shows the reason your staff typed. A cancellation
  with no reason generates a phone call every single time.

Customers can cancel themselves only while the order is still New. Once you
have accepted it and the kitchen has started, the page shows your phone
number and asks them to call — by then the food is already in the fryer.

---

## 5. What your staff see

Four screens, behind a login. Staff use these on the counter computer.

### 5.1 The order queue — the screen that stays open all day

![The staff order queue](mockups/04-admin-order-board.svg)

Every order for the day on one list, newest at the top. **The screen
refreshes itself every ten seconds** and plays a sound with a pop-up when a
new order arrives — nobody has to keep pressing refresh. Filter by status
(New, Preparing, Ready…) or by date. Click any row to open it.

### 5.2 One order in full

![A single order with its history](mockups/05-admin-order-detail.svg)

Everything about one order in one place, and the buttons to move it along.

Three things worth pointing out:

- **Payment is tracked separately from status.** An order can be *Ready* and
  still *Unpaid*; you tick "paid" at handover. Keeping these apart avoids a
  confusing "ready but not paid yet" status.
- **"Send WhatsApp" and "Mark as notified" are two different things,
  on purpose.** The WhatsApp button opens WhatsApp Web with a message
  already written for you. But the website cannot know whether you actually
  pressed send — so the *record* that a customer was told is the tick box,
  ticked by a human. If we merged them, your history would claim customers
  were notified when they were not.
- **Every change is stamped with a time and kept forever.** That list at the
  bottom right is your audit trail. It is also exactly what the customer
  sees on their tracking page, so the two can never disagree.

Cancelling asks for a reason, and that reason goes straight to the customer.

There is also a **Print kitchen ticket** button that produces a clean paper
summary on an ordinary desktop printer.

### 5.3 Your menu — you control it, no developer needed

![Menu management](mockups/06-admin-menu.svg)

Add items, change prices, upload photos, reorder the list, and toggle two
separate switches per item:

- **In stock / Sold out** — the quick daily toggle.
- **On the site / Hidden** — for seasonal items you are not selling yet.

**Changing a price never changes a past receipt.** Every order permanently
stores the name and price as they were the moment it was placed. Likewise,
removing an item hides it from customers but keeps it intact in your order
history, so last month's records stay accurate.

### 5.4 Today at a glance

![Dashboard](mockups/07-admin-dashboard.svg)

Order count, takings, what is waiting for pickup, what still needs
accepting, your busiest hours and your best sellers. One button downloads
the day as a spreadsheet for your accounts.

The yellow bar at the top counts items currently marked sold out. **It is
there because of a specific failure we expect.** Every night the system
automatically switches everything back to in-stock. One day that automatic
job will fail quietly, and without the bar you would spend a Saturday
turning customers away from food you actually had in the kitchen. The bar makes a
forgotten sold-out flag impossible to miss.

---

## 6. The life of an order

Six states. Every arrow is a button someone presses, and every press is
recorded with a time.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> New: customer places order
  New --> Accepted: staff accept
  Accepted --> Preparing: kitchen starts
  Preparing --> Ready: staff message customer
  Ready --> Completed: collected and paid
  Completed --> [*]
  New --> Cancelled: customer or staff
  Accepted --> Cancelled: staff, with a reason
  Preparing --> Cancelled: staff, with a reason
  Ready --> Cancelled: staff, with a reason
  Cancelled --> [*]
```

**Why "Accepted" exists as a separate step.** It is a deliberate human gate.
An order sits as *New* until a person looks at it and agrees to make it.
Nothing goes into the kitchen automatically. That single step is your main
protection against a prank order costing you a full tray of food.

---

## 7. How the system protects you

Cash on collection with no address is genuinely exposed: if someone does not
turn up, you have already cooked the food and you have only a phone number. Four
defences work together.

| Defence | What it does |
| --- | --- |
| **"Not a robot" check at checkout** | Blocks automated junk orders outright |
| **Three open orders per phone number per day** | One person cannot flood you with fake orders |
| **Limited orders per time slot** | Caps how much you can lose in any one hour, and keeps the kitchen sane |
| **The "Accepted" step** | A person approves every order before any cooking starts |

If no-shows ever become a real problem, the honest answer is a deposit —
which means adding online payment. Nothing in this design blocks that later;
it is simply not worth the cost and complexity on day one.

**Other quiet protections built in:**

- Double-tapping "Place order" creates **one** order, not two.
- Order codes look like `250712-K4RQ` — the random ending means nobody can
  guess another customer's order or work out how many orders you take a day.
- The tracking link contains a long random code, so there is nothing to
  guess and nothing to type. The "lost my link" lookup form is deliberately
  slowed down to stop anyone fishing through it.
- Your order data is backed up every night, and we will test restoring it
  once before you go live. An untested backup is not a backup.
- Testing happens on a completely separate copy of the system, so we can
  never touch a real customer order while working.

---

## 8. Privacy and Malaysian law (PDPA)

You collect names and phone numbers, so the shop falls under Malaysia's
**Personal Data Protection Act 2010**, as amended in 2024 and now fully in
force. Here is where you stand, in plain terms.

**The good news — some obligations do not apply to you.** You do not need a
formal Data Protection Officer. That requirement starts at 20,000 customers
on file; a single shop is nowhere near it.

**What does apply, regardless of your size:**

| Obligation | What it means for you in practice |
| --- | --- |
| **Consent** | The unticked box at checkout, plus a privacy notice page. We record the exact moment each customer agreed. Consent you cannot prove does not count. |
| **A notice in two languages** | The Act requires Bahasa Malaysia *and* English. English alone is a compliance gap. Both are planned. |
| **Breach notification** | If customer data is ever exposed, the regulator must be told within **72 hours** and affected customers within **7 days**. |
| **Data stored overseas** | Our hosting sits outside Malaysia. That is allowed, but must be disclosed in your notice — and we will choose the regions deliberately rather than accepting defaults. |
| **Deleting old data** | Orders are kept for accounting and then deleted; cancelled orders sooner. You need to confirm both periods. |

**Two things we need you to arrange before your first real order:**

1. **A Malaysian lawyer reads the privacy notice.** We have written a solid
   draft, but it is a working draft written by developers, not legal advice.
2. **A one-page "what if there is a breach" procedure.** Who gets called
   first, who decides how serious it is, who files the report, how customers
   are told. This cannot be invented inside a 72-hour deadline — it has to
   exist beforehand. We will draft it; you approve it.

---

## 9. What we left out on purpose — and what it would take to add

Nothing below is blocked by a bad decision made now. The system was built
leaving room for each one.

| If you later want… | What is involved |
| --- | --- |
| **Delivery** | The order records already have unused, hidden spaces for an address and a delivery fee. Adding delivery means new screens and new rules, but no risky surgery on your live order history. |
| **Online payment or deposits** | A new piece of work, and the point where it plugs in already exists. |
| **Emailing customers automatically** | The exact spot in the code where an email would be sent is already marked and waiting. |
| **A separate login per staff member** | Every recorded action already has a "who did this" field. Today it says "staff"; later it can say a name. |
| **A second outlet** | The largest of the four. This one would be real work. |

---

## 10. How we build it — the plan

Work happens in five stages. **Each stage ends with something you can see
and try yourself**, not a status report. The two halves of the system (the
customer website and the engine behind it) are built in step with each
other, with the engine running one stage ahead.

```mermaid
flowchart LR
  P0["Stage 0<br/>Foundations"] --> P1["Stage 1<br/>Browse and basket"]
  P1 --> P2["Stage 2<br/>Ordering, tracking,<br/>staff screen"]
  P2 --> P3["Stage 3<br/>Staff tools"]
  P3 --> P4["Stage 4<br/>Polish and go live"]

  style P2 fill:#FFF3EC,stroke:#B4471F,color:#241E1A
  style P4 fill:#E6F6EE,stroke:#2F7D5B,color:#241E1A
```

| Stage | What gets built | You will be able to… |
| --- | --- | --- |
| **0 — Foundations** | The skeleton of both halves, the database, hosting, error alerts | See a working (empty) site at a real web address |
| **1 — Browse and basket** | Menu display, item pages, the basket | Browse your real menu and fill a basket on your own phone |
| **2 — Ordering, tracking, staff screen** ⭐ | Checkout, order tracking, staff login, the order queue, status buttons | **Place a real order and watch it appear on the counter screen** |
| **3 — Staff tools** | Menu editing, photo upload, WhatsApp messages, settings, dashboard | Add a brand-new snack with a photo and order it — all by yourself |
| **4 — Polish and go live** | Printable tickets, spreadsheet export, Bahasa Malaysia notice | Run a full day without ringing us |

**Stage 2 is the big one** and will take noticeably longer than the others.
It contains the checkout, the tracking page and the staff order screen —
roughly half the whole project. Expect the pace to look slower there; that
is normal, not a problem.

---

## 11. What we need from you

Work can start today, but these unblock later stages. The first one is
urgent.

### ⚠️ Needed before Stage 2 — a web address you own

We need one domain name, used for both halves, for example
`shop.yourshop.com` for the website and `api.yourshop.com` for the engine.

**This is not cosmetic.** Without it, the staff login breaks in a specific
and nasty way: it works perfectly on our computers and on some of yours,
then silently fails on an iPhone at the counter. Safari already blocks the
mechanism involved and Chrome is phasing it out. Working around it means
building the login a completely different way — more code, weaker security,
and it must be decided *before* we build it, not after.

A domain costs a few tens of ringgit a year. Please buy one early.

### Before Stage 1 — your menu

- Your categories, in the order you want them shown
- Every item: name, one-line description, price
- A photograph of each item (phone photos are fine, well-lit and square)
- Any options per item: regular or large, original or spicy, add-ons like an
  extra sauce or a cheese dip

### Before Stage 2 — how your shop runs

- Opening hours, and any days you are closed
- How long each pickup slot is, and how many orders you can handle per slot
- Minimum notice — how far ahead must someone order? (This stops an order
  landing five minutes before pickup with nothing in the fryer yet.)
- Daily cutoff time for next-day orders
- Shop address and phone number as you want them shown to customers

### Before Stage 3 — your words

- The WhatsApp message you want sent when an order is **accepted**,
  when it is **ready**, and when it is **cancelled**. We will fill in the
  customer name, order code, total and pickup time automatically — just
  write the wording you would normally type.

### Before going live — the legal bits

- Your registered shop name, and a contact email and phone for privacy
  questions
- How many years you keep order records — **please confirm with your
  accountant**; seven years is the usual Malaysian answer
- A Malaysian lawyer's review of the privacy notice
- Sign-off on the one-page breach procedure
- Decide who gets the staff login (for now there is one shared account)

---

## 12. A few words explained

| Word you will hear | What it actually means |
| --- | --- |
| **Frontend** | The part customers and staff look at and click |
| **Backend** | The engine behind it: stores the orders, enforces the rules |
| **Slot** | A pickup time window customers choose at checkout |
| **Soft delete** | Removing an item from the menu while keeping it in past orders, so old receipts stay correct |
| **Order code** | The short code like `250712-K4RQ` you read out over the phone |
| **Staging** | A private duplicate of the whole system for testing, so real orders are never touched |
| **PDPA** | Malaysia's Personal Data Protection Act 2010 |

---

## Questions?

Anything in here that sounds wrong, or does not match how your shop actually
runs, is worth flagging now. Changing a rule at this stage is a
conversation. Changing it after Stage 2 is rebuilding.
