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
- [ ] Verify each seeded role can log in and see only its own screens

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
- [ ] Implement Connector A
- [x] Implement partial issue and AR preparation
- [ ] Implement dispatch
- [x] Verify an approved in-stock request reaches dispatch with stock deducted once

Unfinished issues:

- [ ] #30 - [Dispatch issued stock through Connector A](https://github.com/1vannce/rcwheels-systems-integration/issues/30)
- [ ] #31 - [Prepare partial issues and acknowledgement receipts](https://github.com/1vannce/rcwheels-systems-integration/issues/31)

## Phase 4 - Internal delivery

- [ ] Implement Connector C and internal delivery handoff
- [ ] Implement delivery inspection and signed AR
- [ ] Implement partial acceptance and RDR
- [ ] Implement returns and inspection results
- [ ] Implement replacement or cancellation and Connector F
- [ ] Verify scenarios 1-3 pass

## Phase 5 - Purchasing

- [ ] Implement Connector B and uncovered-shortfall calculation
- [ ] Implement suppliers and PR creation
- [ ] Implement PO creation and Accounting review
- [ ] Implement the PO revision loop and placement
- [ ] Implement Connector E
- [ ] Verify a shortage produces one approved PO with no duplicate demand

## Phase 6 - Supplier receiving

- [ ] Implement inspection against PO balances
- [ ] Implement partial acceptance and single stock posting
- [ ] Implement Connector D and SDR
- [ ] Implement follow-up deliveries and cancellation
- [ ] Implement Connector G
- [ ] Verify scenarios 4-7 pass

## Phase 7 - Visibility

- [ ] Implement reorder alerts
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
- Keep this checklist synchronized with issue and pull request status.
- Do not mark a phase complete until its PLAN.md exit criterion is verified.
- Closed issues are intentionally omitted from the unfinished-work lists.
