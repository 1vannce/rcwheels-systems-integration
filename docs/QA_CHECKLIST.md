# QA checklist

Manual QA checklist for the RCWheels Business Management System prototype. Use it
with [PLAN.md](PLAN.md) section 9 (end-to-end scenarios), [BUSINESS_RULES.md](BUSINESS_RULES.md)
(rule IDs), and [PHASE_CHECKLIST.md](PHASE_CHECKLIST.md) (what is built).

The prototype uses **fictional data only**. Never put real client records,
supplier documents, or personal information into the database.

**Baseline:** `main` at `7da4ded` (2026-11-27). Update this line when the
checklist is revised for a later commit.

## How to use this checklist

- `[ ]` not run, `[x]` passed, `[!]` failed. Link every failure to an issue.
- Tick an item only when the **expected result** is observed, not when the screen
  merely loads.
- Run a full pass on the deployed site before the demo. Local results are not a
  substitute.
- For a repeatable pass, start from a fresh database. `npm run db:seed` is
  idempotent, so it does not remove earlier test transactions. Use the local
  test database or a disposable Supabase project; do not reset the shared hosted
  project while teammates are using it.
- Report bugs with the template in section 14. Include the rule or scenario ID
  the failure violates.
- "N/A" is acceptable only for a check listed as not built in section 12. Do not
  silently skip a check.

### Severity

| Level | Meaning |
| --- | --- |
| S1 | Blocks the demo, loses or corrupts data, or exposes another user's data |
| S2 | A business rule or main workflow is broken, but a workaround exists |
| S3 | Cosmetics, wording, or a minor usability issue |

### Test run record

| Field | Value |
| --- | --- |
| Tester | |
| Date | |
| Commit / branch | |
| Environment | local / Vercel preview / production |
| Database | hosted Supabase / local PostgreSQL 18 |
| Browser and version | |
| Result summary | passed / failed / blocked |

---

## 1. Pre-flight

### 1.1 Environment and build

- [ ] **QA-ENV-01** — `npm ci` completes from a clean checkout on Node.js 20 or
      later.
- [ ] **QA-ENV-02** — `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, and
      `TEST_DATABASE_URL`. `.env` has the same `DATABASE_URL` for Drizzle and
      the seed. No `.env*` file other than `.env.example` is staged for commit.
- [ ] **QA-ENV-03** — `DATABASE_URL` uses the Supabase transaction pooler on
      port `6543`, and the app connects with `prepare: false`.
- [ ] **QA-ENV-04** — `npm run db:migrate` applies every migration in `drizzle/`
      without an error, and the tables in `src/db/schema/` exist in the target
      database.
- [ ] **QA-ENV-05** — `npm run db:seed` completes and reports 8 roles, 11 users,
      6 items, and 3 suppliers. Run it a second time: no quantity, user, item, or
      supplier is duplicated.
- [ ] **QA-ENV-06** — `npm run test:run` passes with `TEST_DATABASE_URL` set and
      reports **zero unexpected skips**. Without `TEST_DATABASE_URL` the
      database-backed tests skip by design, so that run is not sufficient for QA.
- [ ] **QA-ENV-07** — `npm run lint` is clean.
- [ ] **QA-ENV-08** — `npm run build` succeeds.
- [ ] **QA-ENV-09** — `npm run dev` serves the app at `http://localhost:3000`,
      and `GET /api/health` returns `{"ok":true}`.
- [ ] **QA-ENV-10** — CI is green on the commit under test (`.github/workflows/ci.yml`).

### 1.2 Test accounts

All seeded accounts use the value of `SEED_USER_PASSWORD` at the moment the seed
ran. Re-running the seed now resets existing Supabase Auth passwords to the
current value.

| Account | Role |
| --- | --- |
| `requester@rcwheels.test` | requester, assigned to `approver@` |
| `mechanic1@rcwheels.test` | requester (mechanic), assigned to `depthead@` |
| `mechanic2@rcwheels.test` | requester (mechanic), assigned to `depthead@` |
| `approver@rcwheels.test` | requisition approver |
| `depthead@rcwheels.test` | requisition approver |
| `custodian@rcwheels.test` | inventory custodian |
| `invmanager@rcwheels.test` | inventory manager |
| `purchasing@rcwheels.test` | purchasing staff |
| `accounting@rcwheels.test` | accounting associate |
| `delivery@rcwheels.test` | delivery operations |
| `admin@rcwheels.test` | system administrator |

- [ ] **QA-ENV-11** — Every account above signs in successfully.
- [ ] **QA-ENV-12** — Each account's name in the user menu matches the seed table.

### 1.3 Seeded stock

Available stock = usable on hand − active reservations. The seed creates one
approved sample request for `TIRE-1757013` with **2 units reserved**, so that
item has 6 available, not 8.

| Item code | Opening usable | Reorder point | QA note |
| --- | --- | --- | --- |
| `TIRE-1757013` | 8 | 8 | 2 reserved by the seeded sample; available 6 |
| `TIRE-1956515` | 14 | 8 | Good for a fully in-stock request |
| `RIM-15ALLOY` | 6 | 4 | Good for a partial-reservation request |
| `VALVE-TR413` | 120 | 50 | High stock; use for repeated tests |
| `WEIGHT-10G` | 250 | 100 | High stock; use for adjustments |
| `LUG-M12` | 96 | 40 | High stock; use for sales deductions |

- [ ] **QA-ENV-13** — The item list shows these quantities and reorder points.
- [ ] **QA-ENV-14** — The seeded sample request and its 2-unit reservation are
      visible, and `TIRE-1757013` shows 6 available.
- [ ] **QA-ENV-15** — The stock detail for each seeded item shows an
      `opening_balance` movement and no duplicate opening movement after running
      the seed twice.

---

## 2. Smoke and session

- [ ] **QA-SMOKE-01** — `/login` loads with email and password fields, labels,
      and no console error.
- [ ] **QA-SMOKE-02** — An invalid email or password shows a readable error and
      does not create a session.
- [ ] **QA-SMOKE-03** — A valid seeded account lands on `/dashboard` and the
      user menu shows the correct name and role.
- [ ] **QA-SMOKE-04** — Sign out clears the session and returns to `/login`.
      A refresh after Back returns to `/login`; the signed-out session cannot
      load protected data again.
- [ ] **QA-SMOKE-05** — Opening `/dashboard` while signed out redirects to
      `/login`; after signing in, the app opens the dashboard.
- [ ] **QA-SMOKE-06** — An unknown URL returns the Next.js not-found page, not a
      stack trace or a blank screen.
- [ ] **QA-SMOKE-07** — A known but unbuilt menu route (for example
      `/timeline` or `/inventory/low-stock`) shows "This screen isn't built yet"
      after the role check, not a 404.
- [ ] **QA-SMOKE-08** — A signed-in Supabase account with no active app user is
      sent to `/no-access` and can sign out. (Optional: create a throwaway Auth
      user without a `users` row.)
- [ ] **QA-SMOKE-09** — Browser console and the Next.js server log show no
      hydration, unhandled rejection, or React warning during the smoke pass.

---

## 3. Role-based access

### 3.1 Expected menus

Every role also sees the shared **Dashboard**, **Notifications**, and **Request
timeline** entries. Request timeline is still a placeholder. All other expected
entries are listed below; entries marked "(placeholder)" are visible but open
the later-phase screen.

| Account | Expected menus besides Shared |
| --- | --- |
| `requester@` | Requisition: New requisition, My requests. Delivery: Acceptance and AR signing, Requester discrepancies. |
| `approver@`, `depthead@` | Requisition: Approval queue, Rejected reviews, All requisitions, Completed request. Delivery: Requester discrepancies. |
| `custodian@` | Requisition: All requisitions. Inventory: Items, Issue queue, AR preparation, Dispatch, Adjustments, Sales deductions, Low-stock review (placeholder). Delivery: Receiving queue, Supplier discrepancies (placeholder), Return inspection. |
| `invmanager@` | Requisition: All requisitions. Inventory: Items, Adjustments, Low-stock review (placeholder). |
| `purchasing@` | Purchasing: Suppliers (placeholder), Purchase Requisition queue (shown as "PR queue"), Purchase orders, Open PO follow-up. |
| `accounting@` | Purchasing: Accounting review, Open PO follow-up. |
| `delivery@` | Delivery: Receiving queue, Internal delivery queue, Acceptance and AR signing, Return inspection. |
| `admin@` | Every screen above, including every placeholder. |

- [ ] **QA-ACL-01** — Each seeded account sees exactly the menus in the table,
      with no items from another role.
- [ ] **QA-ACL-02** — Unbuilt screens are labelled "Later phase" on the dashboard
      and open the placeholder page.
- [ ] **QA-ACL-03** — For every role, open three screens it must not have by
      typing the URL (for example a requester opens `/inventory/items`,
      `/requisitions/approvals`, and `/purchasing/accounting-review`). Each ends
      at `/forbidden` and shows no record data.
- [ ] **QA-ACL-04** — The refused screen attempts create `audit_log` rows whose
      action is `blocked:open-screen:<screen>` with the right actor and role.
      Use the query in section 4.4.
- [ ] **QA-ACL-05** — Replaying a server action from the wrong role is refused on
      the server, not only hidden in the UI. Expect a form error and a
      `blocked:<action>` audit row. (Use two sessions or a saved request.)
- [ ] **QA-ACL-06** — `admin@` can open every screen but cannot perform a role
      action it does not own (for example dispatch or Accounting approval); the
      service must refuse even though the screen opens.
- [ ] **QA-ACL-07** — A requester sees only their own requests. Another
      requester's request returns "not found" when opened by ID.
- [ ] **QA-ACL-08** — An approver sees only requests assigned to them. Another
      approver's queue item is not visible, and a direct detail/decision attempt
      is refused.
- [ ] **QA-ACL-09** — A user with an inactive `users` row cannot sign in, or is
      refused by `requireUser`, while their history remains. (Requires a manual
      `is_active = false` update until account administration is built.)

---

## 4. Cross-cutting behavior

### 4.1 Forms and validation

- [ ] **QA-UX-01** — Every required field is marked and enforced on the server;
      clearing a required field shows a readable message and creates no record.
- [ ] **QA-UX-02** — Quantities accept up to 3 decimals and reject 4 decimals,
      zero, negative, and non-numeric input.
- [ ] **QA-UX-03** — Unit prices accept up to 2 decimals and reject zero,
      negative, and non-numeric input.
- [ ] **QA-UX-04** — A form with an error keeps the user's input instead of
      resetting the whole form.
- [ ] **QA-UX-05** — Submit buttons show a pending/disabled state during the
      request and cannot be double-submitted.
- [ ] **QA-UX-06** — A double-click or stale-tab submit does not post a stock
      event twice. If two records are created where one business event was
      intended, report it as S1 or S2.
- [ ] **QA-UX-07** — Error messages name the problem and the next action, not a
      raw database or Zod object.
- [ ] **QA-UX-08** — A missing or invalid record ID shows a not-found message,
      not a server error.
- [ ] **QA-UX-09** — Dates use the Asia/Manila business day. A sale dated
      tomorrow is refused; today's sale is accepted.
- [ ] **QA-UX-10** — Free-text fields are escaped when redisplayed. Entering
      `<script>alert(1)</script>` or an `onerror` payload in a purpose, reason,
      or note must render as text, never execute.

### 4.2 States and layout

- [ ] **QA-UX-11** — Every queue has a sensible empty state when no work is
      waiting, and it does not show table headers with no rows as an error.
- [ ] **QA-UX-12** — Loading states appear on slow requests and do not flash
      content that then disappears.
- [ ] **QA-UX-13** — Tables remain usable at 1280 px, 768 px, and 375 px widths;
      navigation collapses without hiding the current user or sign-out.
- [ ] **QA-UX-14** — The main workflows can be completed with the keyboard:
      focus is visible, tab order follows the form, and dialogs close with
      Escape.
- [ ] **QA-UX-15** — Status badges use the same words as
      [GLOSSARY.md](../GLOSSARY.md): Approved, Awaiting Stock, For Delivery, Out
      for Delivery, Delivered, Pending Resolution, Fulfilled, Cancelled.

### 4.3 Transactions, audit, and notifications

- [ ] **QA-DATA-01** — A business action that fails partway leaves no partial
      record: no stock movement without its status history, audit row, or
      notification.
- [ ] **QA-DATA-02** — Every successful business event writes an `audit_log` row
      with actor, entity, action, and details.
- [ ] **QA-DATA-03** — Status history is append-only. There is no UI or action
      that edits or deletes an earlier row.
- [ ] **QA-DATA-04** — A blocked action writes a `blocked:` audit row even though
      the business transaction rolled back.
- [ ] **QA-DATA-05** — The intended recipient receives each in-system
      notification; unrelated users do not.
- [ ] **QA-DATA-06** — The unread badge counts only the signed-in user's unread
      notifications and updates after marking one or all as read.
- [ ] **QA-DATA-07** — A notification link opens the record it describes. A link
      to a record the user may not see is refused, not leaked.
- [ ] **QA-DATA-08** — Without a UI action, no notification is sent by email.
      In-system only, as scoped.

### 4.4 Database evidence queries

Run these against the environment under test when a check needs database
evidence. Use the read-only SQL editor or `psql` with the environment's
`DATABASE_URL`.

```sql
-- Recent audit entries, including blocked attempts
select a.action, a.entity_type, a.entity_id, u.email, a.occurred_at
from audit_log a
left join users u on u.user_id = a.actor_user_id
order by a.occurred_at desc
limit 20;

-- Balances per item and condition
select i.item_code, b.condition, b.quantity_on_hand, b.is_incomplete
from stock_balances b
join items i on i.item_id = b.item_id
order by i.item_code, b.condition;

-- Active reservations
select i.item_code, sum(r.reserved_qty) as reserved
from stock_reservations r
join stock_balances b on b.stock_balance_id = r.stock_balance_id
join items i on i.item_id = b.item_id
where r.status = 'active'
group by i.item_code
order by i.item_code;

-- Stock movement ledger for one item
select m.movement_type, m.quantity_delta, m.event_key, m.posted_at
from stock_movements m
join stock_balances b on b.stock_balance_id = m.stock_balance_id
join items i on i.item_id = b.item_id
where i.item_code = 'TIRE-1757013'
order by m.posted_at, m.movement_id;
```

---

## 5. Requisition

Test with `requester@`, `approver@`, and `custodian@`. The seeded sample request
already occupies 2 units of `TIRE-1757013`; use `TIRE-1956515` for a clean
in-stock request.

### 5.1 Create a Requisition Form (RF)

- [ ] **QA-RQ-01** — `/requisitions/new` shows item, requested quantity, purpose,
      delivery date, delivery location, urgency, and an optional "requested for"
      mechanic selector.
- [ ] **QA-RQ-02** — Submitting with no lines, an item with quantity zero, a
      duplicate item, a purpose shorter than 3 characters, a missing date, or a
      missing location is refused with a field message and creates no request.
- [ ] **QA-RQ-03** — A quantity with 3 decimals is accepted; 4 decimals are
      refused.
- [ ] **QA-RQ-04** — A valid in-stock request is saved as **Pending Approval**,
      appears in My requests, and appends its first status-history row.
- [ ] **QA-RQ-05** — The assigned approver (`approver@`) receives an in-system
      notification and sees the request in Approval queue. An unassigned
      approver (`depthead@`) does not.
- [ ] **QA-RQ-06** — Marking a request urgent moves it to the top of the
      approver's queue but does not skip approval.
- [ ] **QA-RQ-07** — Submitting on behalf of `mechanic1@` records both the
      submitter and the requester; the mechanic is the requester who later signs
      the AR.
- [ ] **QA-RQ-08** — Double-clicking Submit creates one request, or shows a clear
      duplicate warning. Two identical requests is a bug.

### 5.2 Approval, rejection, and resubmission

- [ ] **QA-RQ-09** — The approver can approve the full requested quantity or a
      smaller quantity per line. Approved quantity is stored separately from
      requested quantity.
- [ ] **QA-RQ-10** — Approving more than the requested quantity is refused.
- [ ] **QA-RQ-11** — Approval changes the status to **Approved**, adds it to the
      Inventory issue queue (Connector A), notifies the Custodian, and creates no
      Purchase Requisition or Purchase Order by itself.
- [ ] **QA-RQ-12** — The requester cannot decide the request. A different
      approver cannot decide it. Both attempts are refused and audited.
- [ ] **QA-RQ-13** — Rejecting without a reason is refused. Rejecting with a
      reason changes the status to **Rejected**, notifies the requester, and
      removes it from the pending approval queue.
- [ ] **QA-RQ-14** — The rejected request can be corrected and resubmitted. The
      earlier rejection stays in the status history and approval runs again.
- [ ] **QA-RQ-15** — The request detail shows header, lines, requested/approved/
      reserved/dispatched/accepted/returned/cancelled/outstanding quantities,
      and every status change with who, when, from, to, and reason.
- [ ] **QA-RQ-16** — No screen offers an edit or delete for a previous status
      row, dispatch, or accepted quantity.

---

## 6. Inventory and stock

Use `custodian@` for operational actions and `invmanager@` for approvals and
reorder points.

### 6.1 Items and balances

- [ ] **QA-INV-01** — The item list shows every seeded item with its code, name,
      unit, usable quantity, active reservations, available quantity, in-transit
      quantity, held and damaged quantity, reorder point, and stock-check badge.
      The item's stock detail also shows its specification, average cost, and
      reorder point.
- [ ] **QA-INV-02** — Available quantity equals usable on hand minus active
      reservations for every item, including the 2-unit seeded reservation on
      `TIRE-1757013`.
- [ ] **QA-INV-03** — Creating an item with an existing code, an invalid code, or
      a missing field is refused. The code is stored uppercased.
- [ ] **QA-INV-04** — A new item opens usable, damaged, and hold balance rows at
      zero.
- [ ] **QA-INV-05** — The Inventory Manager can change a reorder point. The
      Custodian cannot. The change is audited with the old and new value.
- [ ] **QA-INV-06** — A reorder point of zero and a 3-decimal value are accepted;
      negative and non-numeric values are refused.
- [ ] **QA-INV-07** — The stock detail shows every movement for the item, with
      type, quantity delta, event key, and timestamp. History cannot be edited or
      deleted.

### 6.2 Reservation and issue queue

- [ ] **QA-INV-08** — An approved RF appears in the Inventory issue queue with
      each line's requested quantity and current available stock. The request
      detail shows the approved quantity.
- [ ] **QA-INV-09** — Reserving the full available quantity succeeds and adds an
      active reservation for each line. The header stays Approved when every
      line is fully reserved.
- [ ] **QA-INV-10** — Reserving more than available is refused. Reserved stock
      remains visible as reserved and is not offered to another request.
- [ ] **QA-INV-11** — A partial reservation moves the request to **Awaiting
      Stock** with the remainder unreserved; the reserved part can still be
      prepared and dispatched later.
- [ ] **QA-INV-12** — Marking Awaiting Stock is allowed only when nothing can be
      reserved. It moves the request to **Awaiting Stock** and notifies the
      relevant roles.
- [ ] **QA-INV-13** — With two sessions, both try to reserve the last available
      unit at the same time. Exactly one succeeds; the other sees the remaining
      availability or a "not enough stock" message. No negative available
      quantity results.
- [ ] **QA-INV-14** — A balance flagged `is_incomplete` cannot be reserved until
      a count is approved. Use the late-sale path in section 6.5 to set the flag.

### 6.3 AR preparation and dispatch

- [ ] **QA-INV-15** — AR preparation lists only requests with reserved
      quantities. The Custodian can name the delivery person and choose sent
      quantities up to each line's reservation.
- [ ] **QA-INV-16** — Preparing an AR does **not** deduct stock and does **not**
      put the quantity in transit yet. The request becomes **For Delivery** and
      moves to the dispatch queue.
- [ ] **QA-INV-17** — Sending more than the reserved quantity or more than usable
      stock is refused.
- [ ] **QA-INV-18** — Dispatch deducts usable stock once, consumes the
      reservation, and adds the sent quantity to in transit. The status becomes
      **Out for Delivery**.
- [ ] **QA-INV-19** — A double-clicked dispatch, a refreshed stale tab, or a
      repeated action deducts stock only once and is refused the second time.
- [ ] **QA-INV-20** — Dispatching a line twice is refused. A partial dispatch
      deducts only the sent quantity; the remainder stays reserved.
- [ ] **QA-INV-21** — The dispatch appears in the Internal Delivery queue
      (Connector C) and the requester is notified.

### 6.4 Adjustments

- [ ] **QA-INV-22** — The Custodian records a count with item, condition, counted
      quantity, and reason. The recorded system quantity is captured at count
      time.
- [ ] **QA-INV-23** — A second pending count for the same balance is refused.
- [ ] **QA-INV-24** — The Inventory Manager sees the pending count and can
      approve or reject it. The Custodian cannot approve their own count.
- [ ] **QA-INV-25** — Approval moves the balance by counted − recorded, posts
      once, and clears the incomplete flag. The stock movement and audit row
      exist.
- [ ] **QA-INV-26** — Rejection requires a reason, changes no stock, and notifies
      the person who counted.
- [ ] **QA-INV-27** — An approval that would leave usable stock below the active
      reservations is refused.

### 6.5 Sales deductions

- [ ] **QA-INV-28** — A valid sale records item, quantity, sales reference, and
      sale date, and deducts usable stock.
- [ ] **QA-INV-29** — Re-posting the same sales reference and item is refused as
      already posted.
- [ ] **QA-INV-30** — A sale above available stock is refused; reserved stock
      cannot be sold.
- [ ] **QA-INV-31** — A future sale date is refused. A sale dated today is
      accepted.
- [ ] **QA-INV-32** — A sale entered after its sale date posts, flags the balance
      **incomplete**, and notifies the Inventory Manager and Custodians.
- [ ] **QA-INV-33** — An approved count clears the incomplete flag and notifies
      the person who counted.
- [ ] **QA-INV-34** — A wrong deduction can be reversed once with a reason. The
      reversal is linked to the original, adds the stock back at the original
      cost, and leaves the original row unchanged.
- [ ] **QA-INV-35** — A second reversal of the same deduction is refused.

### 6.6 Stock rules to confirm at the end of the pass

- [ ] **QA-INV-36** — No path leaves usable, damaged, held, or reserved quantity
      negative.
- [ ] **QA-INV-37** — Reserved stock is never dispatched to another request or
      sold.
- [ ] **QA-INV-38** — Acceptance of delivered items changes no stock balance.
- [ ] **QA-INV-39** — Only `inventory/services/stock.service.ts` writes balances;
      a code review of the diff under test confirms no other module updates
      `quantity_on_hand` directly.

---

## 7. Internal delivery

Use `requester@` (or a mechanic account), `custodian@`, and `approver@`/
`depthead@`.

### 7.1 Acceptance and AR signing

- [ ] **QA-DL-01** — The Internal Delivery queue shows dispatched requests only.
      A prepared but unreleased AR is not shown as in transit.
- [ ] **QA-DL-02** — The requester opens a delivery and sees each dispatched line
      with sent quantity and the quantity still in transit.
- [ ] **QA-DL-03** — The requester can accept part of a line, reject part, or
      split the two. Accepted + rejected cannot exceed the line's in-transit
      quantity.
- [ ] **QA-DL-04** — A rejected quantity requires a problem description of at
      least 3 characters.
- [ ] **QA-DL-05** — Signing the AR stores the signed-in requester and the
      timestamp. No drawn signature is requested.
- [ ] **QA-DL-06** — Signing deducts no stock; the accepted quantity only reduces
      in transit. Each acceptance posts once.
- [ ] **QA-DL-07** — When every approved quantity is accepted or cancelled, the
      request becomes **Delivered**, not automatically Fulfilled.
- [ ] **QA-DL-08** — The requisition approver marks the Delivered request
      **Fulfilled** from their queue. Wrong roles cannot do it.
- [ ] **QA-DL-09** — A requester cannot accept another requester's delivery. The
      direct link is refused.

### 7.2 RDR, returns, and replacements

- [ ] **QA-DL-10** — Rejecting any quantity creates a Requester Discrepancy
      Report and moves the request to **Pending Resolution**, never to
      **Rejected**.
- [ ] **QA-DL-11** — The RDR appears to the requester and the requisition
      approver with the problem and affected quantity.
- [ ] **QA-DL-12** — The requester returns the rejected items. The return cannot
      exceed the in-transit quantity, and each return line posts once.
- [ ] **QA-DL-13** — Returned items enter **Held** stock; in transit decreases.
- [ ] **QA-DL-14** — The Custodian inspects each returned line as usable, damaged,
      or uncertain. Usable moves to usable stock, damaged moves to damaged stock,
      uncertain stays held.
- [ ] **QA-DL-15** — Inspecting the same return line twice is refused, and the
      balance changes once.
- [ ] **QA-DL-16** — The approver resolves the RDR by replacement or
      cancellation with a note.
- [ ] **QA-DL-17** — A replacement creates a new need in the Inventory queue
      (Connector F). A cancellation reduces the required quantity.
- [ ] **QA-DL-18** — The request becomes Fulfilled only when all quantities are
      accepted or cancelled. It stays open while a remainder or replacement need
      exists.
- [ ] **QA-DL-19** — Cancelling a delivery quantity does not cancel a linked
      Purchase Order.

### 7.3 Partial issue and partial acceptance

- [ ] **QA-DL-20** — Dispatch part of an approved request. While that quantity is
      in transit, the header is **Out for Delivery**.
- [ ] **QA-DL-21** — After the requester accepts the dispatched part, nothing is
      in transit, and the unreserved remainder returns to the Inventory queue as
      **Approved** (or stays **Awaiting Stock** if part of it was already short,
      per decision 11). It can be reserved and dispatched later.
- [ ] **QA-DL-22** — Two separate dispatches each deduct only their own sent
      quantity. The total deduction matches the total sent.

---

## 8. Purchasing

Use `custodian@` for the shortage, `purchasing@` for the Purchase Order, and
`accounting@` for review.

### 8.1 Shortage and Purchase Requisition

- [ ] **QA-PU-01** — Approve an RF for more than available stock. The Custodian
      can reserve only the available part; the request then moves to Awaiting
      Stock. If nothing can be reserved, the whole request can be marked Awaiting
      Stock.
- [ ] **QA-PU-02** — A Purchase Requisition can be created only when the
      uncovered shortfall is above zero. The shortfall subtracts accepted, in
      transit, reserved, and allocated outstanding Purchase Order quantity.
- [ ] **QA-PU-03** — Creating a second Purchase Requisition for the same
      remaining demand is refused or shows zero orderable quantity.
- [ ] **QA-PU-04** — The Purchase Requisition appears in the Purchasing queue
      (Connector B), is **Open**, and links to the source RF line.
- [ ] **QA-PU-05** — The request stays **Awaiting Stock**; a Purchase
      Requisition does not authorize spending and does not fulfill the RF.

### 8.2 Purchase Order creation and Accounting review

- [ ] **QA-PU-06** — Purchasing Staff prepare a Purchase Order from an open
      Purchase Requisition with supplier, lines, quantities, unit prices, and
      optional delivery terms.
- [ ] **QA-PU-07** — Saving without a supplier, with no lines, with quantity
      zero, or with price zero is refused. Duplicate Purchase Requisition lines
      are refused.
- [ ] **QA-PU-08** — A saved draft is **Pending Approval**. It does not mark the
      Purchase Requisition covered until committed quantity covers every line.
- [ ] **QA-PU-09** — Discarding an unapproved draft releases its quantity and
      makes it available to a new Purchase Order.
- [ ] **QA-PU-10** — Accounting sees the supplier, source Purchase Requisition,
      lines, totals, version comparison, and version history.
- [ ] **QA-PU-11** — Approval without a budget reason is refused. Approval with
      a reason records the reason and makes the exact current version
      **Approved**.
- [ ] **QA-PU-12** — Returning without a reason is refused. Returning with a
      reason makes the Purchase Order **For Revision** and notifies Purchasing
      Staff.
- [ ] **QA-PU-13** — Only `accounting@` can approve or return. Purchasing Staff,
      the Custodian, and the admin are refused and audited.
- [ ] **QA-PU-14** — A user cannot approve a Purchase Order they prepared.

### 8.3 Revision and placement

- [ ] **QA-PU-15** — After a return, changing supplier, item, quantity, or price
      creates a new version. The earlier version and its review stay in history.
- [ ] **QA-PU-16** — A revised Purchase Order returns to **Pending Approval** and
      cannot be placed until Accounting approves the new version.
- [ ] **QA-PU-17** — Placing an unapproved or stale-version Purchase Order is
      refused with a clear message.
- [ ] **QA-PU-18** — Placing an approved current version records the order date,
      sets **Placed**, notifies Delivery Operations (Connector E), and posts no
      stock.
- [ ] **QA-PU-19** — Placing twice is refused; the second attempt does not
      duplicate the order or notification.
- [ ] **QA-PU-20** — Totals use 2-decimal money arithmetic. Check a line of
      3 × 0.10 and a mixture of prices; displayed and stored totals agree.

### 8.4 Open Purchase Orders and balance cancellation

- [ ] **QA-PU-21** — The open Purchase Order follow-up shows committed,
      received, and outstanding value for each open Purchase Order.
- [ ] **QA-PU-22** — Purchasing Staff and Accounting can open it; other roles
      cannot.
- [ ] **QA-PU-23** — Accounting cancels the remaining balance only with a reason.
      An unreceived Purchase Order becomes **Cancelled**. If a partially
      received Purchase Order exists from a manual fixture, cancelling it makes
      it **Closed** (receive part of it first, section 9.2).
- [ ] **QA-PU-24** — Cancelling a balance creates connector G demand review in
      Purchasing and does not cancel the RF.
- [ ] **QA-PU-25** — The RF stays **Awaiting Stock** until it is covered or
      separately cancelled. A closed Purchase Order still counts accepted
      quantity in coverage; no duplicate demand appears.
- [ ] **QA-PU-26** — Purchasing Staff cannot cancel a Purchase Order balance
      without Accounting authorization.

---

## 9. Supplier receiving

Use a **Placed** Purchase Order from section 8. Receiving and inspection belong to
the Inventory Custodian. The Supplier Discrepancy Report (SDR) screen is not
built yet.

### 9.1 Receiving queue

- [ ] **QA-SR-01** — `custodian@` and `delivery@` open `/delivery/receiving`. It
      lists only Placed and Partially Received Purchase Orders, with supplier,
      status, placed date, and the outstanding of ordered quantity per line.
- [ ] **QA-SR-02** — Only the Custodian sees the **Receive** link. Delivery
      Operations can view the queue and nothing more.
- [ ] **QA-SR-03** — Placing a Purchase Order adds it to the queue, notifies
      Delivery Operations, and posts no stock. The Custodian also gets one
      notification that opens `/delivery/receiving/<id>`.
- [ ] **QA-SR-04** — With nothing to receive, the queue shows its empty message.

### 9.2 Receive page (Inventory Custodian only)

- [ ] **QA-SR-05** — `/delivery/receiving/<id>` opens for the Custodian. Every
      other role, including `delivery@` and `admin@`, ends at `/forbidden`.
- [ ] **QA-SR-06** — **Record delivery** stays disabled until the entries are
      valid: accepted plus rejected equals delivered, delivered is not above the
      outstanding quantity, and a rejected quantity has a note. The delivery
      receipt number is required; the invoice number is optional. A line left
      blank is not recorded.
- [ ] **QA-SR-07** — Accepting 6 of 10 posts 6 to usable stock once, leaves 4
      outstanding, and makes the Purchase Order **Partially Received**. The next
      delivery is checked against the 4.
- [ ] **QA-SR-08** — Accepting the rest makes the Purchase Order **Closed**. It
      leaves the queue and the page says it is not open for receiving.
- [ ] **QA-SR-09** — Rejected quantity never enters stock and stays outstanding.
      A delivery with everything rejected leaves the status unchanged.
- [ ] **QA-SR-10** — A double click on **Record delivery** records one receipt
      and one stock movement per accepted line.
- [ ] **QA-SR-11** — A refused delivery shows the reason and keeps what was
      typed.
- [ ] **QA-SR-12** — An accepted delivery notifies the Custodian about each RF in
      **Awaiting Stock** that can now reserve a received item (connector D). The
      RF does not change and no second stock movement is posted.

### 9.3 Supplier Discrepancy Report flow

No screen exists, so only the effects of receiving can be checked by hand. Use
`supplier-discrepancy.service.test.ts` (with `TEST_DATABASE_URL`) for agreeing,
resolving, and recording a report by hand.

- [ ] **QA-SR-13** — `/delivery/sdr` shows "This screen isn't built yet" to the
      Custodian.
- [ ] **QA-SR-14** — A delivery with rejected or short quantity opens a report for
      each affected line and notifies Purchasing Staff. A line that already has
      an unresolved report gets no second shortage report.
- [ ] **QA-SR-15** — The automated tests pass: reports move only Open → Agreed
      (Purchasing Staff) → Resolved, and wrong roles are blocked.
- [ ] **QA-SR-16** — The automated tests pass: a follow-up delivery resolves an
      agreed replacement, and a cancel commitment asks Accounting to cancel the
      remaining balance (connector G). Agreeing alone changes no PO quantity.

### 9.4 Reorder alert

- [ ] **QA-SR-17** — A stock event that takes an item's available quantity from
      above its reorder point to at or below it notifies the Custodian and the
      Inventory Manager. Raising the reorder point past the available quantity
      does the same.
- [ ] **QA-SR-18** — The message gives the item, available quantity, reorder
      point, and any open Purchase Order or Purchase Requisition coverage, or
      says there is none. No Purchase Requisition is created (scenario 9).
- [ ] **QA-SR-19** — Further deductions below the point send no new alert. After
      stock rises above the point, the next crossing alerts again.
- [ ] **QA-SR-20** — A reorder point of zero never alerts.

**Not built yet** (do not run): attaching delivery receipts, invoices, or photos
to a receipt or report.

---

## 10. Shared screens

- [ ] **QA-SH-01** — The dashboard greets the user by name, shows the unread
      notification count or "no unread notifications", and groups the role's
      screens.
- [ ] **QA-SH-02** — Unbuilt entries show "Later phase" and the dashboard itself
      shows no fabricated counts. Dashboard count cards are not built yet.
- [ ] **QA-SH-03** — The notifications page lists newest first, distinguishes
      unread, and offers mark-one and mark-all-read actions.
- [ ] **QA-SH-04** — Marking a notification read decrements the sidebar badge and
      survives a refresh.
- [ ] **QA-SH-05** — A notification for a requisition opens the correct request
      detail. A notification for a Purchase Order opens the correct order.
- [ ] **QA-SH-06** — The request timeline route is still a placeholder; no
      end-to-end timeline is expected yet.
- [ ] **QA-SH-07** — Document attachment upload controls are not exposed in the
      UI yet. The service and its tests exist, but no screen offers an upload.
- [ ] **QA-SH-08** — The user menu shows the signed-in name and role, and sign out
      works from every page.

---

## 11. End-to-end scenarios (PLAN section 9)

Run these in order on the deployed site for the final pass. Local test coverage
is listed for information; it does not replace a manual run.

| # | Scenario | Current coverage | QA status |
| --- | --- | --- | --- |
| 1 | In stock, fully accepted | Requisition and internal-delivery DB tests; manually run locally | Ready |
| 2 | Partial issue, then partial acceptance | Requisition and internal-delivery DB tests | Ready |
| 3 | Rejected items; return usable, damaged, uncertain | Internal-delivery DB tests | Ready |
| 4 | Shortage on an approved RF | Supplier discrepancy DB test (shortage to reservation) | Ready |
| 5 | Purchase Order of 10, 6 accepted | Supplier receiving and discrepancy DB tests | Ready |
| 6 | Accounting returns a Purchase Order; revision reapproved | Purchase Order lifecycle tests | Ready |
| 7 | Purchase Order balance cancelled while RF still needs items | Cancellation and discrepancy DB tests | Ready |
| 8 | Two users reserve the last unit at the same time | Stock-concurrency DB test | Ready |
| 9 | Stock at reorder point with a Purchase Order open | Reorder DB test; the low-stock review screen is not built | Ready (alert only) |
| 10 | Same sales source line posted twice; late entry | Inventory DB tests | Ready |
| 11 | Rejected RF corrected and resubmitted | Requisition DB tests | Ready |
| 12 | User opens or calls another role's action | Authorization DB tests; manually run locally | Ready |

Checks:

- [ ] **QA-E2E-01** — Scenario 1 passes end to end: submit → approve → reserve →
      AR preparation → dispatch (stock deducted once) → requester accepts and
      signs → Delivered → approver marks Fulfilled.
- [ ] **QA-E2E-02** — Scenario 2 passes: partial reserve → partial dispatch →
      partial acceptance → remainder returns to the Inventory queue and can be
      issued later.
- [ ] **QA-E2E-03** — Scenario 3 passes: reject → RDR → return → inspect usable,
      damaged, and uncertain → replacement or cancellation → correct Held,
      usable, and damaged balances → Fulfilled when complete.
- [ ] **QA-E2E-04** — Scenario 4 passes: an approved and placed Purchase Order
      for the uncovered quantity only, with no duplicate demand → the Custodian
      receives it → stock posts once → the waiting RF can be reserved.
- [ ] **QA-E2E-05** — Scenario 5 passes: order 10, accept 6, 4 stay
      outstanding, and the next delivery is checked against the 4.
- [ ] **QA-E2E-06** — Scenario 6 passes: Accounting returns with a reason →
      Purchasing revises → Accounting approves the new version → placement is
      allowed only then.
- [ ] **QA-E2E-07** — Scenario 7 passes: partial receipt → Accounting cancels
      the balance → Purchase Order **Closed**, RF still open, demand review in
      Purchasing, no duplicate demand.
- [ ] **QA-E2E-08** — Scenario 8 passes with two sessions; one reservation wins
      and the other is refused cleanly.
- [ ] **QA-E2E-09** — Scenario 9 passes: the alert names the open Purchase
      Order and no new Purchase Requisition is created.
- [ ] **QA-E2E-10** — Scenario 10 passes: duplicate sale refused; late sale flags
      incomplete; approved count clears it.
- [ ] **QA-E2E-11** — Scenario 11 passes: rejection history and a fresh approval
      both remain visible.
- [ ] **QA-E2E-12** — Scenario 12 passes: wrong-role screen and action attempts
      are blocked and audited.

---

## 12. Known gaps — do not report as new bugs

These are known, documented limits at the baseline commit. If any of them is
built, move its checks into the relevant section and update the baseline.

| Gap | Where documented |
| --- | --- |
| Supplier Discrepancy Report screen (services and tests only) and supplier returns screen | PLAN phase 6; PHASE_CHECKLIST |
| Supplier create/edit and supplier evaluation | PHASE_CHECKLIST phase 5 |
| Low-stock review screen (reorder alerts are built) | PLAN phase 7; PHASE_CHECKLIST |
| Request timeline and dashboard count cards | PLAN phase 7; NAVIGATION |
| Document attachment upload UI (service and tests only) | Core module |
| System administrator account and role management screen | BUSINESS_RULES BR-AC-08 |
| Separate Inventory Manager "For Delivery" gate; the Custodian currently prepares the AR and sets For Delivery | REQUISITION_MODULE, known deviations |
| Running scenarios on the deployed site; Phase 5 migrations on hosted Supabase | PHASE_CHECKLIST 2026-11-24 note |

---

## 13. Deployment and demo readiness

Run this section on the exact URL that will be demonstrated.

- [ ] **QA-DEP-01** — The Vercel deployment for the tested commit is ready and
      serves the login page over HTTPS.
- [ ] **QA-DEP-02** — Vercel has the Supabase URL, publishable key, and pooler
      `DATABASE_URL`. No secret key or password is exposed to the browser.
- [ ] **QA-DEP-03** — Every migration in `drizzle/` is applied to the hosted
      Supabase database, including the Phase 5 and delivery migrations.
- [ ] **QA-DEP-04** — The `documents` storage bucket exists and is private; if
      the bucket was recreated, verify it is not public.
- [ ] **QA-DEP-05** — Supabase Auth redirect URLs include the deployed domain,
      and every seeded account can sign in there.
- [ ] **QA-DEP-06** — `/api/health` returns `{"ok":true}` on the deployed site.
- [ ] **QA-DEP-07** — Row Level Security is enabled on every table. The
      publishable key cannot read application rows directly through the Supabase
      REST endpoint.
- [ ] **QA-DEP-08** — The Supabase project is not paused and the free-tier limits
      have headroom for the demo.
- [ ] **QA-DEP-09** — Every scenario marked **Ready** in section 11 runs on the
      deployed site.
- [ ] **QA-DEP-10** — The browser cache is cleared or a private window is used;
      the demo works from a fresh session.
- [ ] **QA-DEP-11** — A recorded backup demo exists, and the local app can run
      against the hosted project if only the Vercel deployment is unavailable.
- [ ] **QA-DEP-12** — The demo script and user guide cite the prototype
      assumptions from PLAN section 3 and BUSINESS_RULES section 10.

---

## 14. Bug report template and sign-off

### Bug report

```md
## Bug: <short title>

- ID:
- Severity: S1 / S2 / S3
- Environment and commit:
- Account and role:
- Rule / scenario:
- Preconditions:
- Steps to reproduce:
  1.
  2.
- Expected:
- Actual:
- Evidence: screenshot / log / audit row / request ID
- Suspected area:
```

### Sign-off

| Item | Value |
| --- | --- |
| Checklist version / commit | |
| Date and tester | |
| Passed | |
| Failed (S1 / S2 / S3) | |
| Blocked / not testable | |
| Open S1 or S2 bugs | |
| Ready for demo? | yes / no |
| Notes | |
