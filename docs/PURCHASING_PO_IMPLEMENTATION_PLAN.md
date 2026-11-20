# Purchasing PO Implementation Plan

**Status:** Complete locally on 2026-11-18.

**Implementation branch:** `feat/purchasing-purchase-orders`

**Base branch:** `feat/purchasing-shortage-pr`

**Base commit:** `997fee6 feat(purchasing): raise shortage purchase requests for awaiting-stock`

**Current checkout when this plan was written:** `main`

---

## Hard constraints

These apply to every step:

- **Do not touch the GitHub domain.**
- **Do not push.**
- **Do not create a pull request.**
- **Do not create or comment on issues.**
- **Do not use `gh` or the GitHub API.**
- **Do not change remotes or repository settings.**
- Work locally only.
- Commit locally only when explicitly asked.
- Do not make changes directly on `main`.
- Do not include unrelated formatting or refactoring changes in the purchasing commits.
- The base branch currently contains a formatting-only change in
  `src/modules/inventory/services/stock-concurrency.service.test.ts`. Do not add
  more unrelated changes to it. Handle that file separately if the team wants it
  removed.

**Scope rule:** a step is complete when the code, tests, and local verification
are done. It is **not** complete by opening a pull request.

---

## Starting point

The shortage-PR bridge exists only on `feat/purchasing-shortage-pr`:

- Custodian can mark an out-of-stock request as Awaiting Stock.
- Custodian can raise a shortage PR for the uncovered quantity.
- Purchasing Staff see open PRs at `/purchasing/requisitions`.
- PRs are not yet converted into POs.
- No PO service, action, component, or page exists.
- PO tables and enums exist in the schema but have no application code.
- Suppliers are seeded with fictional records.
- `/purchasing/orders` and `/purchasing/accounting-review` are still placeholders.

**Before Step 1:** switch to the base branch and create the implementation branch:

```bash
git switch feat/purchasing-shortage-pr
git switch -c feat/purchasing-purchase-orders
```

Do not push this branch.

---

## Step titles and suggested local commit messages

| Step | Title | Suggested local commit message |
| --- | --- | --- |
| 1 | Supplier read API | `feat(purchasing): list seeded suppliers for purchase orders` |
| 2 | Purchase order draft data layer | `feat(purchasing): add purchase order draft data layer` |
| 3 | Create PO from an open PR | `feat(purchasing): create purchase order drafts from purchase requests` |
| 4 | Purchasing PO list and editor | `feat(purchasing): add purchase order list and editor` |
| 5 | Accounting review and return | `feat(purchasing): add accounting review and return flow` |
| 6 | Revision loop and reapproval guard | `feat(purchasing): version purchase orders before reapproval` |
| 7 | Place approved PO and connector E | `feat(purchasing): place approved purchase orders` |
| 8 | PR coverage and duplicate-demand guard | `feat(purchasing): mark covered purchase requests` |
| 9 | Tests, docs, and verification | `test(purchasing): cover the purchase order lifecycle` |

---

## Step 0 — Verify the PR bridge before starting

**Title:** Verify the base branch

**Tasks:**

- [x] Switch to `feat/purchasing-shortage-pr`.
- [x] Run `npm run lint`.
- [x] Run `npm run test:run`.
- [x] Run `npm run build`.
- [ ] Run the purchasing DB tests with a valid `TEST_DATABASE_URL`.
- [ ] Manually verify:
  - partial stock reserve → PR form,
  - zero stock → Awaiting Stock → PR form,
  - purchasing queue,
  - custodian cannot open the purchasing queue.
- [ ] Create `feat/purchasing-purchase-orders` from the verified base.

**Done when:** the PR bridge is verified and the new local branch exists.

---

## Step 1 — Supplier read API

**Title:** Supplier read API

**Status:** Implemented locally on 2026-11-18. The DB-backed supplier test is
written but was skipped because `TEST_DATABASE_URL` is empty in this environment.

**Business rules:** `BR-PU-04` requires Purchasing Staff to maintain suppliers.
Start with a read-only list of the seeded suppliers; supplier CRUD comes later.

**Tasks:**

- [x] Add a `SupplierDto` type.
- [x] Add `findSuppliers(tx)` in a purchasing repository.
- [x] Add `listSuppliersService()`.
- [x] Export the service and type through `src/modules/purchasing/index.ts`.
- [x] Add a unit or DB-backed test for the supplier list.

**Files likely touched:**

- `src/modules/purchasing/types/purchasing.dto.ts`
- `src/modules/purchasing/repositories/supplier.repository.ts`
- `src/modules/purchasing/services/supplier.service.ts`
- `src/modules/purchasing/index.ts`
- a new purchasing test file

**Done when:** the PO form can load the seeded suppliers without touching GitHub.

---

## Step 2 — Purchase order draft data layer

**Title:** Purchase order draft data layer

**Status:** Implemented locally on 2026-11-18. DTO and snapshot unit tests pass.
The repository test file is written but was skipped because `TEST_DATABASE_URL`
is empty in this environment.

**Business rules:** `BR-PU-04`, `BR-PU-05`, `BR-PU-09`.

**Tasks:**

- [x] Add PO types:
  - `PurchaseOrderStatus`,
  - `PurchaseOrderLineDto`,
  - `PurchaseOrderRevisionDto`,
  - `PurchaseOrderDto`.
- [x] Add `CreatePurchaseOrderDto`:
  - supplier ID,
  - delivery terms,
  - at least one line,
  - each line has a purchase-requisition line ID, quantity, and unit price.
- [x] Add repository functions:
  - find suppliers,
  - find open PR lines with remaining quantity,
  - lock PR lines in ascending ID order,
  - insert PO header,
  - insert PO lines,
  - insert version 1 revision snapshot,
  - find/list POs.
- [x] Add a deterministic JSON snapshot helper:
  - supplier,
  - lines,
  - quantities,
  - prices,
  - delivery terms.
- [x] Ensure every repository function takes the caller’s `tx`.
- [x] Add DTO and snapshot unit tests.
- [x] Add a DB-backed repository test file (skipped locally without a test DB).

**Database notes:**

- No migration is expected.
- `purchase_orders`, `purchase_order_lines`, and `purchase_order_revisions`
  already exist.
- `purchase_order_lines.purchase_requisition_line_id` is the link to the PR.
- `purchase_order_revisions.snapshot` is `text`; store JSON.

**Done when:** the data layer can create a PO header, lines, and version 1
snapshot in one transaction.

---

## Step 3 — Create PO from an open PR

**Title:** Create PO from an open PR

**Status:** Implemented locally on 2026-11-18. Service tests are written but
were skipped because `TEST_DATABASE_URL` is empty in this environment.

**Business rules:** `BR-PU-01`, `BR-PU-02`, `BR-PU-04`, `BR-PU-05`.

**Tasks:**

- [x] Add `createPurchaseOrderService(actor, dto)`.
- [x] Require `purchasing_staff`.
- [x] Run one `runBusinessEvent` transaction.
- [x] Validate:
  - the PR exists and is `open`,
  - the supplier exists,
  - every selected line belongs to the PR,
  - quantity is above zero,
  - unit price is above zero,
  - quantity does not exceed the PR line’s remaining coverage.
- [x] Lock PR lines in ascending ID order before calculating coverage.
- [x] Insert the PO as `pending_approval`.
- [x] Insert PO lines linked to the PR lines.
- [x] Insert revision version 1 with `budgetOk = null`.
- [x] Audit the creation.
- [x] Notify `accounting_associate`.
- [x] Do not change stock balances.

**Coverage rule for this step:**

- Count active PO lines as allocated while preventing duplicate drafts.
- A cancelled PO line does not allocate demand.
- The PO cannot be placed yet.

**Done when:** a Purchasing Staff user can create a pending PO from a PR and
Accounting is notified.

---

## Step 4 — Purchasing PO list and editor

**Title:** Purchasing PO list and editor

**Status:** Implemented locally on 2026-11-18. Context/list DB tests are written
but were skipped because `TEST_DATABASE_URL` is empty in this environment.

**Tasks:**

- [x] Build `/purchasing/orders` behind `purchasing-po-editor`.
- [x] Show open POs, status, supplier, source PR, lines, and total value.
- [x] Add a “Prepare PO” link from `/purchasing/requisitions`.
- [x] Prefill PR lines and remaining quantities.
- [x] Let Purchasing Staff choose a supplier and set prices and delivery terms.
- [x] Submit through one server action.
- [x] Revalidate the PR queue and PO list.
- [x] Do not add Accounting actions to this screen.

**Done when:** Purchasing Staff can complete the PR → PO draft path locally.

---

## Step 5 — Accounting review and return

**Title:** Accounting review and return

**Status:** Implemented locally on 2026-11-18. Service/list DB tests are written
but were skipped because `TEST_DATABASE_URL` is empty in this environment.

**Business rules:** `BR-PU-06`, `BR-PU-07`, `BR-PU-12`.

**Tasks:**

- [x] Build `/purchasing/accounting-review` behind
  `purchasing-accounting-review`.
- [x] List POs in `pending_approval`.
- [x] Add `approvePurchaseOrderService`:
  - Accounting Associate only,
  - block if the actor prepared the PO,
  - set status `approved`,
  - set `approvedBy` and `approvedAt`,
  - record `budgetOk = true`, reviewer, and review time,
  - audit and notify Purchasing Staff.
- [x] Add `returnPurchaseOrderService`:
  - Accounting Associate only,
  - require a reason,
  - set status `for_revision`,
  - record `budgetOk = false`, reviewer, review time, and reason,
  - audit and notify the preparer.
- [x] Do not allow placement from this step.

**Done when:** Accounting can approve or return a submitted PO with a recorded
decision and notification.

---

## Step 6 — Revision loop and reapproval guard

**Title:** Revision loop and reapproval guard

**Status:** Implemented locally on 2026-11-18. Update-service DB tests are written
but were skipped because `TEST_DATABASE_URL` is empty in this environment.

**Business rules:** `BR-PU-07`, `BR-PU-08`, `BR-PU-09`.

**Tasks:**

- [x] Allow Purchasing Staff to edit a PO in `for_revision`.
- [x] Allow editing an approved PO only by creating a new version.
- [x] On every material change:
  - increment `currentVersion`,
  - insert a new revision snapshot,
  - reset status to `pending_approval`,
  - clear approval fields.
- [x] Preserve all earlier revisions and snapshots.
- [x] Add a placement guard:
  - status must be `approved`,
  - the approved revision must be the current version.
- [x] Add tests for:
  - return → edit → reapprove,
  - approved → edit → reapproval required,
  - old revision remains unchanged.

**Done when:** a changed PO can never be placed using an earlier approval.

---

## Step 7 — Place approved PO and connector E

**Title:** Place approved PO and connector E

**Status:** Implemented locally on 2026-11-18. Placement DB tests are written but
were skipped because `TEST_DATABASE_URL` is empty in this environment.

**Business rules:** `BR-PU-08`, `BR-PU-10`.

**Tasks:**

- [x] Add `placePurchaseOrderService(actor, dto)`.
- [x] Require `purchasing_staff`.
- [x] Require status `approved` and the current approved version.
- [x] Set status `placed` and `orderedAt`.
- [x] Audit the placement.
- [x] Notify `delivery_operations`.
- [x] Create the receiving queue handoff (connector E).
- [x] Do not post stock; stock posts only on accepted supplier receipts.

**Done when:** an approved PO can be placed and appears in the receiving handoff
without changing stock.

---

## Step 8 — PR coverage and duplicate-demand guard

**Title:** PR coverage and duplicate-demand guard

**Status:** Implemented locally on 2026-11-18. The coverage tests and the full
suite were run against a temporary local PostgreSQL 18 test database: 213 tests
passed. `TEST_DATABASE_URL` is still empty in the committed environment.

**Business rules:** `BR-PU-01`, `BR-PU-02`.

**Coverage rule:** approved, placed, partially received, and closed PO lines
commit demand. `pending_approval` and `for_revision` lines only reserve quantity
so another draft cannot claim it; they never mark a PR covered. Cancelled POs
and cancelled PO quantities are excluded.

**Tasks:**

- [x] Compute coverage per PR line from active PO lines.
- [x] A PR line is fully covered when committed PO quantity reaches its requested
  quantity.
- [x] Mark the PR `covered` only when every line is fully covered.
- [x] Keep the PR `open` while coverage is partial or only a draft exists.
- [x] Prevent two PO drafts from claiming the same remaining PR quantity.
- [x] Add a “discard draft” action that releases uncommitted allocation.
- [x] Keep cancelled PO lines out of coverage.
- [x] Add tests for:
  - one PR line covered by one PO,
  - two POs covering one PR partially,
  - duplicate draft prevention,
  - discard draft releases quantity,
  - PR queue no longer lists a fully covered PR.

**Done when:** the PR bridge cannot produce duplicate demand.

---

## Step 9 — Tests, docs, and local verification

**Title:** Tests, docs, and local verification

**Status:** Completed locally on 2026-11-18. The full suite, including the new
lifecycle and role tests, passes against a temporary local PostgreSQL 18 test
database. No hosted project, GitHub, commit, or push was touched.

**Tasks:**

- [x] Add DB-backed tests for the full PO lifecycle:
  - create draft,
  - Accounting return,
  - edit and reapprove,
  - place,
  - PR coverage.
- [x] Add role tests:
  - Purchasing Staff can create/edit/place,
  - Accounting can approve/return,
  - Accounting cannot prepare a PO,
  - Purchasing Staff cannot approve a PO,
  - requester and custodian are blocked.
- [x] Update `docs/BUSINESS_RULES.md` statuses for implemented rules.
- [x] Update `docs/PHASE_CHECKLIST.md`.
- [x] Run:
  - `npm run lint`
  - `npm run test:run`
  - `npm run build`
  - purchasing DB tests with `TEST_DATABASE_URL`
- [x] Verify the complete PR → PO → approved → placed path locally through the
  DB-backed lifecycle test. A browser click-through needs the hosted Supabase
  project, so it was not run.

**Do not add a “create pull request” task.** Local verification is the endpoint.

---

## Deferred to later work

Do not include these in the PO implementation steps above:

- Supplier create/edit screens and supplier evaluation.
- Supplier receiving queue and receipt inspection.
- Accepted receipt posting to stock.
- SDRs, rejected goods, disputed excess, commitments.
- Connector D: recheck waiting requests after receipt.
- Connector G: demand review after PO cancellation.
- PO `partially_received` and `closed` transitions.
- Reorder alerts and reorder PRs.
- Low-stock review page.
- Dashboard counts.
- Request timeline.
- Any GitHub issue, push, or pull request.

---

## Definition of done for the whole plan

- Purchasing Staff can turn an open shortage PR into a pending PO.
- Accounting can approve or return that exact PO version.
- A returned or changed PO goes back through review before placement.
- An approved current version can be placed.
- Placing a PO creates a receiving handoff but does not change stock.
- A fully covered PR is marked covered.
- Duplicate demand cannot be created by two PO drafts.
- Lint, unit tests, DB tests, and production build pass locally.
- No GitHub operation is required or performed.
