# Purchasing Accounting Implementation Plan

**Status:** Implementation complete locally. DB-backed test execution and migration
application are pending as of 2026-11-19.

**Date:** 2026-11-19.

**Implementation branch:** `feat/purchasing-accounting`.

**Base branch:** `main`.

**Base commit:** `03f9375 feat(purchasing): implement the purchase order review and placement flow`.

**Scope:** Complete the Accounting Associate's purchasing responsibilities: review with
context, a recorded budget reason, open PO follow-up, and Accounting-authorized PO
balance cancellation.

---

## Hard constraints

- [x] Do not touch the GitHub domain.
- [x] Do not push.
- [x] Do not create a pull request.
- [x] Do not create or comment on issues.
- [x] Do not use `gh` or the GitHub API.
- [x] Do not change remotes or repository settings.
- [x] Work locally only.
- [x] Commit locally only when explicitly asked.
- [x] Do not make changes directly on `main`; create `feat/purchasing-accounting` from the
      verified base.
- [x] Keep unrelated formatting and refactoring out of the accounting commits.
- [x] Use Conventional Commits: `type(scope): lowercase imperative description`, no
      trailing period.

**Scope rule:** A step is complete when the code, tests, and local verification are done.
It is not complete by opening a pull request.

---

## Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Accounting scope | Full Accounting Associate role in purchasing |
| 2 | Approval reason | Required for both approve and return |
| 3 | Cancellation record | Three header columns on `purchase_orders`; one cancellation event per PO |
| 4 | Cancellation target | The whole remaining balance of the PO |
| 5 | Cancellation initiator | Accounting authorizes directly; no separate Purchasing request |
| 6 | Inventory value approval | Out of scope; no workflow, table, or rule exists |

---

## Current state

Already built and passing locally:

- [x] Purchasing Staff create a PO draft from a shortage PR.
- [x] Accounting sees pending POs at `/purchasing/accounting-review`.
- [x] Accounting approves or returns the exact current version.
- [x] Self-approval is blocked.
- [x] Every version is stored in `purchase_order_revisions`.
- [x] Approval, return, audit and notification run in one business event.
- [x] Purchasing Staff edit a returned or approved PO through a new version.
- [x] Placement requires the current version to be approved.
- [x] Placing a PO creates the receiving handoff without posting stock.

Known gaps this plan closes:

- [ ] Approval stores `budgetOk = true` but leaves `reviewReason` empty.
- [ ] Accounting has no PO detail screen; it cannot see supplier contact, source PR
      context, earlier versions, or earlier return reasons.
- [ ] Accounting cannot see open POs and outstanding commitments.
- [ ] No PO balance cancellation with Accounting authorization.
- [ ] Purchasing screens are marked "Later" in navigation even when their pages exist.

---

## Business rules covered

| Rule | Requirement | Plan step |
| --- | --- | --- |
| BR-PU-06 | Accounting decides yes or no on the budget and records a reason | 2 |
| BR-PU-08 | A PO cannot be placed until Accounting approves that exact version | Existing; guard re-tested in 5 |
| BR-PU-09 | Every PO version and its review are kept | 1, 3 |
| BR-PU-11 | A PO balance is cancelled only with Accounting authorization; connector G | 5 |
| BR-PU-12 | A user cannot approve a PO they prepared | Existing; re-tested |
| BR-PU-13 | Purchasing follows up open POs; Accounting can see them | 4 |
| BR-AC-02 | Each role sees only its own screens and actions | 3, 4, 5 |
| BR-AC-04 | A role-blocked action is written to the audit log | 2, 5 |
| BR-GN-01 | Each business event is one transaction | 2, 5 |
| BR-GN-02 | History is append-only | 1, 3, 5 |
| BR-GN-03 | Every business event writes an audit entry | 2, 5 |

---

## Step 0 — Baseline and branch

**Title:** Verify the base

- [x] Switch to `main`.
- [x] Confirm `main` is at `03f9375` or a later verified commit.
- [x] Run `npm run lint`.
- [x] Run `npm run test:run`.
- [x] Run `npm run build`.
- [ ] Run the purchasing DB tests with a valid `TEST_DATABASE_URL`.
- [x] Create `feat/purchasing-accounting`.
- [x] Do not push the branch.

**Done when:** the base is verified and the implementation branch exists locally.

---

## Step 1 — Accounting data layer

**Title:** Accounting data layer

**Business rules:** BR-PU-09, BR-PU-11, BR-PU-13.

**Goal:** make cancellation state, accepted quantities, source PR context, and safe money
and snapshot helpers available before building screens.

### Schema

- [x] Add `cancelledBy` to `purchase_orders`:
      `integer("cancelled_by").references(() => users.userId)`.
- [x] Add `cancelledAt`:
      `timestamp("cancelled_at", { withTimezone: true })`.
- [x] Add `cancellationReason`:
      `text("cancellation_reason")`.
- [x] Run `npm run db:generate`.
- [ ] Apply the migration to the test database.
- [x] Confirm the schema test still expects exactly 29 tables.
- [x] Do not add a `purchase_order_cancellations` table.

### Purchase order line data

- [x] Extend `PurchaseOrderLineDto` with `acceptedQty`.
- [x] Extend `PurchaseOrderLineDto` with `outstandingQty`.
- [x] Add an accepted-quantity subquery to `findPurchaseOrderLines`:
      sum `supplier_receipt_lines.accepted_qty` for the PO line.
- [x] Add the same subquery to `findPurchaseOrderLinesFor`.
- [x] Compute
      `outstandingQty = greatest(orderedQty - cancelledQty - acceptedQty, 0)`.
- [x] Keep both values as numeric strings; do not convert to floats.

### Purchase order header data

- [x] Extend `PurchaseOrderDto` with `cancelledBy`, `cancelledByName`, `cancelledAt`, and
      `cancellationReason`.
- [x] Add a `cancelledBy` user alias in `purchase-order.repository.ts`.
- [x] Add a left join for the cancelling user in `findPurchaseOrders`.
- [x] Add the same left join in `findPurchaseOrderById`.
- [x] Include the new columns in `purchaseOrderColumns`.

### Source PR context

- [x] Add `requestReason` to `PurchaseRequisitionSummaryDto`.
- [x] Return `requestReason` from `findPurchaseRequisitionSummary`.
- [x] Keep the existing `requestedByName`, `requestedAt`, and `status` fields.

### Money utility

- [x] Add `src/modules/purchasing/utils/money.util.ts`.
- [x] Parse money strings into integer cents.
- [x] Compute a line total from quantity and unit price with cent-exact arithmetic.
- [x] Round each line total half-up to 2 decimals.
- [x] Sum rounded line totals into a PO total.
- [x] Add a formatter for `en-PH`.
- [x] Add a unit test for parsing, rounding, and summing.
- [x] Do not refactor the existing `formatMoney` helpers in unrelated components.

### Snapshot helpers

- [x] Add a safe snapshot parse helper that returns `null` for malformed JSON instead of
      throwing.
- [x] Add `src/modules/purchasing/utils/purchase-order-snapshot-diff.util.ts`.
- [x] Diff supplier name and ID.
- [x] Diff delivery terms.
- [x] Diff lines keyed by `purchaseRequisitionLineId`.
- [x] Report added lines.
- [x] Report removed lines.
- [x] Report quantity changes.
- [x] Report price changes.
- [x] Add unit tests for identical, changed, added/removed, and invalid-JSON cases.

**Done when:** the data needed by the Accounting screens exists and the utilities are
tested, with no screen changes yet.

**Implementation note (2026-11-19):** Step 1 code, utilities, and unit tests are complete.
The migration `drizzle/0005_amazing_naoko.sql` was generated but not applied because
`TEST_DATABASE_URL` is empty in this environment. The DB-backed repository tests cover the
new columns and quantities but are skipped until a test database is available.

---

## Step 2 — Required budget reason

**Title:** Record a reason for budget decisions

**Business rules:** BR-PU-06, Decision 7, BR-GN-01, BR-GN-03.

- [x] Add a required `reason` field to `ApprovePurchaseOrderDto`
      (3–300 characters, trimmed).
- [x] Mirror the validation already used by `ReturnPurchaseOrderDto`.
- [x] Read `reason` in `approvePurchaseOrderAction` through `textField`.
- [x] Pass the reason to `approvePurchaseOrderService`.
- [x] Store the reason in `purchase_order_revisions.reviewReason`.
- [x] Keep `budgetOk = true` on approval.
- [x] Keep the reviewer and review timestamp on approval.
- [x] Add a “Budget decision note” textarea to the approval form.
- [x] Keep the return reason field unchanged.
- [x] Keep the existing decision forms in one shared component so Step 3 can reuse them.
- [x] Rename the version-history column label to “Budget note / reason”.
- [x] Update every existing `approvePurchaseOrderService` call in tests to pass a reason.
- [x] Add a test that a missing or too-short approval reason is blocked.
- [x] Add a test that the approval reason is stored and visible in the revision row.
- [x] Confirm no migration is needed.

**Done when:** approve and return both record who, when, the yes/no decision, and a
reason; a missing reason is rejected; tests pass.

**Implementation note (2026-11-19):** Step 2 is complete. The approval reason is required
in the DTO and checked again in the service. The DTO tests run without a database; the
service-level reason test is DB-backed and skipped while `TEST_DATABASE_URL` is empty.

---

## Step 3 — Accounting PO review detail

**Title:** Accounting PO detail and version comparison

**Business rules:** BR-PU-08, BR-PU-09, BR-AC-02.

- [x] Add `/purchasing/accounting-review/[purchaseOrderId]` behind the existing
      `purchasing-accounting-review` screen.
- [x] Do not grant Accounting `purchasing-po-editor`.
- [x] Do not reuse `/purchasing/orders/[purchaseOrderId]`.
- [x] Add `getPurchaseOrderReviewContextService(actor, purchaseOrderId)` in a new
      `purchase-order.review-context.service.ts`.
- [x] Allow `accounting_associate` to read the context.
- [x] Allow `system_administrator` to read the context.
- [x] Return `null` for every other role.
- [x] Return the PO header, lines, revisions, and cancellation fields.
- [x] Return supplier contact details through `findSupplierById`.
- [x] Return the source PR requester, request reason, status, and requested date.
- [x] Return accepted and outstanding quantity per line.
- [x] Return a parsed comparison of the current and previous version snapshots.
- [x] Handle malformed snapshots without crashing the page.

### Page content

- [x] Show the PO number and status.
- [x] Show the current version.
- [x] Show the supplier with contact details.
- [x] Show who prepared the PO.
- [x] Show who approved it and when.
- [x] Show when it was ordered.
- [x] Show delivery terms.
- [x] Show the source PR requester, reason, and date.
- [x] Show ordered, cancelled, accepted, and outstanding quantities.
- [x] Show unit price, line total, and PO total using the money utility.
- [x] Show “What changed since version N−1”.
- [x] Show every version’s reviewer, decision, reason, and review time.
- [x] Show the cancellation summary when cancelled or closed.
- [x] Render decision forms only while the PO is `pending_approval`.
- [x] Render no Purchasing edit, place, or discard actions.
- [x] Link every row in `/purchasing/accounting-review` to the detail page.
- [x] Keep the queue usable for quick decisions or make it link-only; do not duplicate
      decision UI without a shared component.

**Done when:** Accounting can review a PO’s context and changes before deciding, and
cannot reach any Purchasing action.

**Implementation note (2026-11-19):** Step 3 is complete. The new route builds, the
context service allows Accounting and the system administrator, and other roles get null.
The snapshot parser now rejects malformed numeric values as well as malformed JSON. The
DB-backed context tests are written but skipped while `TEST_DATABASE_URL` is empty.

---

## Step 4 — Accounting open PO follow-up

**Title:** Accounting open PO follow-up

**Business rules:** BR-PU-13.

- [x] Build the real `/purchasing/open-orders` page behind
      `purchasing-open-po-follow-up`.
- [x] Allow `purchasing_staff`, `accounting_associate`, and `system_administrator`.
- [x] Add `listOpenPurchaseOrdersService(actor)`.
- [x] Include `approved`, `placed`, and `partially_received` POs.
- [x] Exclude `pending_approval`, `for_revision`, `closed`, and `cancelled`.
- [x] Order the list by PO number or approval date, newest first.
- [x] Show the supplier.
- [x] Show the PO number and status.
- [x] Show the approved date and ordered date when present.
- [x] Show ordered, cancelled, accepted, and outstanding quantities.
- [x] Show committed value = `(ordered − cancelled) × unit price`.
- [x] Show received value = `accepted × unit price`.
- [x] Show outstanding value = `outstanding × unit price`.
- [x] Use the cent-exact money utility.
- [x] Add an empty state.
- [x] Add `purchasing-pr-queue` to `builtScreens`.
- [x] Add `purchasing-po-editor` to `builtScreens`.
- [x] Add `purchasing-accounting-review` to `builtScreens`.
- [x] Add `purchasing-open-po-follow-up` to `builtScreens`.
- [x] Leave `purchasing-supplier-list` unbuilt because its page does not exist.
- [x] Add navigation tests for the built flags.

**Done when:** both roles can see open commitments and outstanding quantities, and no
built purchasing screen shows the “Later” badge.

**Implementation note (2026-11-19):** Step 4 is complete. The open PO page and service are
built, the four purchasing screens are marked available, and the navigation test runs
without a database. The DB-backed list-service test is written but skipped while
`TEST_DATABASE_URL` is empty.

---

## Step 5 — Accounting-authorized PO balance cancellation

**Title:** Cancel PO balances with Accounting authorization

**Business rules:** BR-PU-11, Plan rule 6, scenario 7, BR-GN-01, BR-GN-02, BR-GN-03.

### Schema and DTO

- [x] Confirm the three cancellation columns from Step 1 are present:
      `cancelledBy`, `cancelledAt`, and `cancellationReason`.
- [x] Add `CancelPurchaseOrderBalanceDto` with `purchaseOrderId` and a required
      `reason` (3–300 characters).
- [x] Add `cancelPurchaseOrderBalanceAction`.
- [x] Revalidate the accounting review, open orders, purchase orders, and PR queue after
      success.

### Service

- [x] Add `cancelPurchaseOrderBalanceService(actor, dto)`.
- [x] Require `accounting_associate`.
- [x] Run one `runBusinessEvent` transaction.
- [x] Lock the PO header.
- [x] Block a missing PO.
- [x] Allow only `approved`, `placed`, or `partially_received`.
- [x] Block `pending_approval` and `for_revision` with a message pointing to draft
      discard.
- [x] Block `closed` and `cancelled`.
- [x] Block a PO that already has `cancelledAt`.
- [x] Read the PO lines.
- [x] Compute `remaining = orderedQty − cancelledQty − acceptedQty` per line.
- [x] Clamp remaining at zero.
- [x] If every line has zero remaining, block with “nothing left to cancel”.
- [x] Set `cancelledQty = orderedQty − acceptedQty` for each line with remaining.
- [x] Set `cancelledBy` to the actor.
- [x] Set `cancelledAt` to the current time.
- [x] Set `cancellationReason` to the trimmed reason.
- [x] Set status `closed` if any accepted quantity is above zero.
- [x] Set status `cancelled` if no accepted quantity exists.
- [x] Do not set `closed` when nothing was accepted.
- [x] Do not set `cancelled` after a partial receipt; that would drop accepted quantity
      from PR coverage.
- [x] Collect the distinct linked purchase requisition IDs.
- [x] Call `refreshPurchaseRequisitionCoverage` inside the same transaction.
- [x] Do not change requisition status directly.
- [x] Do not create a stock movement.
- [x] Do not post stock.
- [x] Record an audit entry with action `purchase_order.cancel_balance`.
- [x] Include the previous status, per-line cancelled quantities, accepted quantities,
      and reason in the audit details.
- [x] Notify `purchasing_staff` with the PO number and the reopened PR IDs.
- [x] Treat the reopened PR in the PR queue as connector G’s demand review.
- [x] Do not add a separate demand-review table.

### UI

- [x] Add a “Cancel remaining balance” form to the Accounting detail page.
- [x] Show the form only for `approved`, `placed`, and `partially_received`.
- [x] Show the remaining quantity per line before submission.
- [x] Require a reason.
- [x] Add confirmation copy: cancelling does not cancel the requisition and does not
      affect stock.
- [x] Hide the form after a cancellation.
- [x] Show who cancelled, when, and why when cancelled or closed.
- [x] Make the PO read-only after cancellation.

### Guards and tests

- [x] Add a test that a PO with no receipts becomes `cancelled`.
- [x] Add a test that a partially received PO becomes `closed`.
- [x] Add a test that cancelling a partially received PO keeps accepted quantity in PR
      coverage.
- [x] Add a test that the PR reopens when coverage falls short.
- [x] Add a test that a covered PR stays covered when accepted quantity already meets the
      requested quantity.
- [x] Add a test that a second cancellation is blocked.
- [x] Add a test that cancellable quantity excludes accepted quantity.
- [x] Add a test that a cancelled PO cannot be placed.
- [x] Add a test that a closed or cancelled PO is excluded from the receiving handoff
      list.
- [x] Add a test that Purchasing cannot cancel.
- [x] Add a test that Accounting cannot prepare, edit, place, or discard a PO.
- [x] Add a test that the audit entry is written.
- [x] Add a test that Purchasing is notified.
- [x] Add a test that no stock movement is created.

**Done when:** Accounting can cancel a PO’s remaining balance once, with a reason; a
partially received PO becomes Closed and keeps its accepted quantity in PR coverage; an
unreceived PO becomes Cancelled; the PR reopens; Purchasing is notified; stock and
requisitions are untouched.

**Implementation note (2026-11-19):** Step 5 is complete. The cancellation form appears
on the Accounting detail page for eligible POs, and system administrators get the
read-only view. Closed POs now count their accepted quantity when the purchase request
computes its remaining orderable quantity, so a shortfall after cancellation cannot be
ordered twice. The DB-backed cancellation tests are written but skipped while
`TEST_DATABASE_URL` is empty. The migration that adds the cancellation columns is
generated but not applied in this environment.

---

## Step 6 — Tests, docs, and verification

**Title:** Cover and document the accounting flow

### Unit tests

- [x] Approval and return reason validation.
- [x] Money parsing, rounding, and totals.
- [x] Snapshot diff: identical.
- [x] Snapshot diff: supplier change.
- [x] Snapshot diff: delivery-terms change.
- [x] Snapshot diff: quantity change.
- [x] Snapshot diff: price change.
- [x] Snapshot diff: added line.
- [x] Snapshot diff: removed line.
- [x] Snapshot diff: malformed JSON.
- [x] Safe snapshot parse returns `null` instead of throwing.

### DB-backed tests

**All tests below are written. Execution is pending a configured `TEST_DATABASE_URL`.**

- [x] Approval stores the reason and reviewer.
- [x] Missing approval reason is blocked.
- [x] Return still requires a reason.
- [x] Accounting detail returns supplier, source PR, revisions, and quantities.
- [x] Accounting detail returns `null` for other roles except the system administrator.
- [x] Open PO list includes `approved`, `placed`, and `partially_received`.
- [x] Open PO list excludes `pending_approval`, `for_revision`, `closed`, and
      `cancelled`.
- [x] Open PO totals exclude cancelled quantity.
- [x] Open PO totals include accepted quantity correctly.
- [x] Full accounting cancellation lifecycle.
- [x] Accounting role boundaries.
- [x] Purchasing role boundaries.
- [x] Requester and Custodian are blocked.
- [x] Connector G reopens the PR.
- [x] Scenario 7 end-to-end test written.

### Documentation

- [x] Update `docs/BUSINESS_RULES.md` BR-PU-06 to note that the approval reason is
      enforced.
- [x] Update `docs/BUSINESS_RULES.md` BR-PU-11 status to `Built`.
- [x] Update `docs/BUSINESS_RULES.md` BR-PU-13 status to `Built`.
- [x] Update `docs/PHASE_CHECKLIST.md` Phase 5.
- [x] Update `docs/ERD/ERD.md` with a change-log entry for the three cancellation
      columns.
- [x] Update the purchasing section of `docs/NAVIGATION.md`.
- [x] Do not rewrite the historical `docs/PURCHASING_PO_IMPLEMENTATION_PLAN.md`.

### Local verification

- [x] Run `npm run lint`.
- [x] Run `npm run test:run`.
- [x] Run `npm run build`.
- [ ] Run the purchasing DB tests with `TEST_DATABASE_URL`.
- [ ] Verify the Accounting queue → detail → approve/return path locally in a browser.
- [ ] Verify the open PO list in a browser.
- [ ] Verify cancellation → PR reopen → Purchasing notification in a browser.
- [ ] Verify no stock movement or requisition status change from cancellation in a
      browser.
- [x] Do not run GitHub operations.

**Done when:** lint, unit tests, DB tests, and the production build pass locally, and the
documentation reflects the implemented rules.

**Verification note (2026-11-19):** `npm run lint`, `npm run test:run`, and
`npm run build` pass locally. The DB-backed tests are skipped because
`TEST_DATABASE_URL` is empty, and the migration has not been applied to the hosted
project. Browser verification of the accounting flow is therefore still open.

---

## Definition of done for the whole plan

- [x] Accounting can review a PO with supplier, source PR, and version-diff context.
- [x] Accounting must record a reason when approving or returning.
- [x] Accounting can see open POs and outstanding commitments.
- [x] Accounting can cancel a PO’s remaining balance once, with a reason.
- [x] A partially received PO becomes Closed after cancellation.
- [x] An unreceived PO becomes Cancelled after cancellation.
- [x] Accepted quantity still counts toward PR coverage after cancellation.
- [x] The PR reopens and appears in the Purchasing queue.
- [x] Purchasing is notified.
- [x] Cancellation never posts stock or cancels a requisition.
- [x] Role boundaries hold for every new screen and action.
- [ ] Lint, unit tests, DB tests, and the production build pass locally.
- [x] No GitHub operation is required or performed.

The only open item is DB-backed test execution, which requires `TEST_DATABASE_URL` and
the generated migration to be applied.

---

## Deferred and out of scope

- [ ] Do not build a general ledger.
- [ ] Do not add tax handling.
- [ ] Do not add financial statements.
- [ ] Do not add payments or payment scheduling.
- [ ] Do not add sales processing or POS integration.
- [ ] Do not add a budget master or budget table.
- [ ] Do not add invoice matching or three-way matching.
- [ ] Do not add inventory value-change approval; no workflow, table, or rule exists.
- [ ] Do not build the supplier receiving UI, SDR, or commitments.
- [ ] Do not implement receiving-side `partially_received` and `closed` transitions.
- [ ] Do not send email notifications.
- [ ] Do not add a separate accounting module directory.

---

## Suggested local commits

| Step | Suggested commit |
| --- | --- |
| 0 | No commit; branch only |
| 1 | `feat(purchasing): add accounting data for cancellation and review` |
| 2 | `feat(purchasing): record a reason for budget decisions` |
| 3 | `feat(purchasing): add the accounting purchase order review detail` |
| 4 | `feat(purchasing): add the accounting open purchase order list` |
| 5 | `feat(purchasing): cancel purchase order balances with accounting authorization` |
| 6 | `test(purchasing): cover the accounting review and cancellation flow` |

Do not add a “create pull request” task. Local verification is the endpoint.
