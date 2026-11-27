# Phase delivery checklist

This checklist is based on `docs/PLAN.md` section 8. Check items only when
the implementation and its phase exit criterion are verified.

## Phase 0 - Prepare

- [x] Assign phase owners
- [x] Agree on the code structure and git workflow
- [x] Confirm the repository, Supabase project, and Vercel project
- [x] Verify the empty app runs locally and on Vercel

## Phase 1 - Foundation

- [x] Complete schema and migrations
- [x] Complete login and role handling
- [x] Complete the app layout and role-based screens
- [x] Add audit log, notifications, and document attachments
- [x] Add fictional seed data
- [x] Verify each seeded role can log in and see only its own screens

## Phase 2 - Inventory core

- [x] Implement items and stock balances
- [x] Implement stock events as domain functions
- [x] Implement approved adjustments and sales deductions
- [x] Add the incomplete-balance flag and physical-verification guard
- [x] Pass unit tests for every stock event, including duplicate and simultaneous posting

## Phase 3 - Requisition and issue

- [x] Implement RF creation, validation, and urgency
- [x] Implement approval, rejection, and resubmission
- [x] Implement stock checks and reservations
- [x] Implement Connector A
- [x] Implement partial issue and AR preparation
- [x] Implement dispatch
- [x] Verify an approved in-stock request reaches dispatch with stock deducted once

Issues:

- [x] #30 - [Dispatch issued stock through Connector A](https://github.com/1vannce/rcwheels-systems-integration/issues/30)
- [x] #31 - [Prepare partial issues and acknowledgement receipts](https://github.com/1vannce/rcwheels-systems-integration/issues/31)

## Phase 4 - Internal delivery

- [x] Implement Connector C and internal delivery handoff
- [x] Implement delivery inspection and signed AR
- [x] Implement partial acceptance and RDR
- [x] Implement returns and inspection results
- [x] Implement replacement or cancellation and Connector F
- [ ] Verify scenarios 1-3 pass (pass in `internal-delivery.service.test.ts` against a local test database; not yet run on the deployed site)

## Phase 5 - Purchasing

- [x] Implement Connector B and uncovered-shortfall calculation
- [x] Implement shortage PR creation
- [ ] Implement supplier create/edit and evaluation
- [x] Implement PO creation and Accounting review
- [x] Implement the PO revision loop and placement
- [x] Implement Connector E
- [x] Verify a shortage produces one approved PO with no duplicate demand
- [x] Implement the Accounting review detail and required budget reason
- [x] Implement Accounting open PO follow-up
- [x] Implement Accounting-authorized PO balance cancellation and connector G

Open in Phase 5: supplier create/edit and evaluation are not built; the PO
screens use the seeded suppliers. DB-backed verification of the accounting flow
waits for a configured `TEST_DATABASE_URL`.

## Phase 6 - Supplier receiving

- [ ] Implement inspection against PO balances
- [ ] Implement partial acceptance and single stock posting
- [ ] Implement Connector D and SDR
- [ ] Implement follow-up deliveries and cancellation
- [ ] Implement Connector G
- [ ] Verify scenarios 4-7 pass

## Phase 7 - Visibility

- [x] Implement reorder alerts (2026-11-27, `feat/reorder-alert`: `checkReorder` runs after stock events that lower available stock and alerts the Custodian and Inventory Manager once per crossing, with open PO and PR coverage and no PR created; `reorder.service.test.ts` passes against local PostgreSQL 18, full suite 318 passed vs 308 on main)
- [ ] Implement the dashboard
- [ ] Implement the linked-record timeline for a requisition
- [ ] Verify scenario 9 and end-to-end traceability

## Phase 8 - Finish

- [ ] Run all end-to-end scenarios on the deployed site
- [ ] Set up opening balances
- [ ] Fix discovered bugs
- [ ] Prepare the demo script
- [ ] Write the user guide
- [ ] Verify all section 9 scenarios pass on the deployed site

## Tracking notes

- Progress updated 2026-11-11: foundation implementation and inventory-core implementation are present on `main`; phase exit criteria still need verification.
- Progress updated 2026-11-13: #7, #8, #9, #32, #33, and #34 are closed. The Phase 3 exit path (approve, reserve, prepare AR, dispatch, stock deducted once, second dispatch refused) passes in `requisition.service.test.ts` against a local PostgreSQL 18 test database. Partial issue now lets the reserved remainder be prepared and dispatched later. Connector A and dispatch stay open until #30 is compared with the merged code.
- Progress updated 2026-11-18 (Phase 5, branch `feat/purchasing-shortage-pr`): the Custodian can mark a fully out-of-stock request as Awaiting Stock, raise a shortage PR for the uncovered quantity, and Purchasing Staff have a PR queue at `/purchasing/requisitions`. Allocated outstanding PO quantity and open PRs are subtracted so the same demand is not requested twice. Still open: supplier management, PO creation and Accounting review, reorder PRs, and marking a PR covered when its PO is created.
- Progress updated 2026-11-18 (Phase 5, branch `feat/purchasing-purchase-orders`): Purchasing Staff can prepare a PO from a shortage PR, Accounting can approve or return the exact submitted version, a revision creates a new version and a fresh review, and an approved current version can be placed. Placing a PO records the order date, notifies Delivery Operations, and exposes it through the Supplier Receiving handoff without posting stock. A PR is marked covered only when committed PO quantity reaches every line; unapproved drafts reserve quantity but do not cover, and discarding a draft releases it. The full lifecycle and role boundaries pass in `purchase-order.lifecycle.test.ts` and `purchase-order.roles.test.ts` against local PostgreSQL 18. Still open: supplier create/edit and evaluation, reorder PRs, PO balance cancellation, and the receiving screen.
- Progress updated 2026-11-13 (Phase 3 close-out, branch `test/phase3-role-blocks`): a manual run of the local app with every seeded account confirmed each role's menu and that every other screen opened by URL ends at `/forbidden` with a `blocked:open-screen:*` audit row (Phase 1 item). Scenario 12 for reserve, prepare AR, and dispatch is covered by `requisition.actions.test.ts` (requester, mechanic, and approver blocked and audited; custodian passes). The manual run also covered scenario 1 (stock deducted once at dispatch), the partial issue and remainder (two dispatches, each deducting only its sent quantity), a double-clicked and a stale-tab dispatch (one deduction), and the screen states. #30 was compared with the merged code: dispatch and Connector A (an approved request appears in the issue queue and notifies the Custodian) are in place. Fixed on this branch: a prepared but unreleased AR was shown as dispatched and in transit. The header status while a partial remainder waits for its next AR is proposed in `docs/PLAN.md` section 3, decision 11. Not yet run on the deployed site.
- Progress updated 2026-11-17 (Phase 4, branch `feat/delivery-internal-acceptance`): the delivery module now covers the Internal Delivery queue (connector C), requester acceptance with AR signing, partial acceptance and RDRs, returns into held stock, return inspection (usable, damaged, uncertain), and the approver's replacement or cancellation with connector F. A new proposed status, Delivered, marks a request whose approved quantities are all accepted or cancelled until the approver marks it Fulfilled (decision 5); migration `0006_requisition_delivered_status.sql` must be applied to the hosted database. Scenarios 1 to 3 passed in `internal-delivery.service.test.ts` against a local PostgreSQL 18 test database when written; after the restore and the review fixes, the full suite (308 tests in 42 files) was re-run against a fresh local PostgreSQL 18 database with lint and the build clean. Delivered has its own column and tab on the requester and approver lists. Known limit carried from Phase 3: a dispatch line draws on one reservation, so a line reserved in two passes is sent as two deliveries.
- Progress updated 2026-11-19 (Phase 5 accounting, branch `feat/purchasing-accounting`): Accounting can review a PO with supplier, source PR, line quantities, version comparison and version history; both approve and return now require a budget reason. Accounting and Purchasing Staff have an open PO follow-up with committed, received and outstanding value. Accounting can cancel a PO's remaining balance with a reason; a partially received PO becomes Closed so accepted quantity still counts in PR coverage, an unreceived PO becomes Cancelled, and the reopened PR is connector G's demand review. Closed POs now count accepted quantity when a PR computes its remaining orderable quantity, preventing duplicate demand. Lint, unit tests and the production build pass. The DB-backed accounting tests are written but were not run because `TEST_DATABASE_URL` is empty; the hosted-project click-through and the migration application are still pending.
- Progress updated 2026-11-24 (Phase 3 close-out, branch `docs/phase-3-close-out`): #30 and #31 are both closed on GitHub (2026-11-14), so their boxes are now ticked. On `main` at PR #71, `npm run lint` is clean, `npm run test:run` passes 302 tests in 41 files with none skipped against a throwaway local PostgreSQL 18 database (`TEST_DATABASE_URL` set for the run only), and `npm run build` succeeds. This is the first run of the DB-backed tests, including the Phase 5 accounting ones that were written but not run on 2026-11-19. The header status while a partial remainder waits for its next AR is proposed as Out for Delivery (`docs/PLAN.md` section 3, decision 11). Still not run on the deployed site, and the Phase 5 migrations are still not applied on the hosted Supabase project.
- Keep this checklist synchronized with issue and pull request status.
- Do not mark a phase complete until its PLAN.md exit criterion is verified.
- Closed issues are intentionally omitted from the unfinished-work lists.
