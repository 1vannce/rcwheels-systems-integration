# Phase delivery checklist

This checklist is based on `docs/PLAN.md` section 8. Check items only when
the implementation and its phase exit criterion are verified.

## Phase 0 - Prepare

- [ ] Assign phase owners
- [ ] Agree on the code structure and git workflow
- [ ] Confirm the repository, Supabase project, and Vercel project
- [ ] Verify the empty app runs locally and on Vercel

## Phase 1 - Foundation

- [ ] Complete schema and migrations
- [ ] Complete login and role handling
- [ ] Complete the app layout and role-based screens
- [ ] Add audit log, notifications, and document attachments
- [ ] Add fictional seed data
- [ ] Verify each seeded role can log in and see only its own screens

Unfinished issues:

- [ ] #7 - [Add seed script with fictional data](https://github.com/1vannce/rcwheels-systems-integration/issues/7)
- [ ] #8 - [Login page and role-based redirect](https://github.com/1vannce/rcwheels-systems-integration/issues/8)
- [ ] #9 - [Audit log and notification services](https://github.com/1vannce/rcwheels-systems-integration/issues/9)
- [ ] #13 - [Layout shell and role-based navigation](https://github.com/1vannce/rcwheels-systems-integration/issues/13)

## Phase 2 - Inventory core

- [ ] Implement items and stock balances
- [ ] Implement stock events as domain functions
- [ ] Implement approved adjustments and sales deductions
- [ ] Add the incomplete-balance flag and physical-verification guard
- [ ] Pass unit tests for every stock event, including duplicate and simultaneous posting

Unfinished issues:

- [ ] #11 - [Item list screen](https://github.com/1vannce/rcwheels-systems-integration/issues/11)
- [ ] #12 - [Stock service skeleton with sales deduction event](https://github.com/1vannce/rcwheels-systems-integration/issues/12)

## Phase 3 - Requisition and issue

- [ ] Implement RF creation, validation, and urgency
- [ ] Implement approval, rejection, and resubmission
- [ ] Implement stock checks and reservations
- [ ] Implement Connector A
- [ ] Implement partial issue and AR preparation
- [ ] Implement dispatch
- [ ] Verify an approved in-stock request reaches dispatch with stock deducted once

Unfinished issues:

- [ ] #30 - [Dispatch issued stock through Connector A](https://github.com/1vannce/rcwheels-systems-integration/issues/30)
- [ ] #31 - [Prepare partial issues and acknowledgement receipts](https://github.com/1vannce/rcwheels-systems-integration/issues/31)
- [ ] #32 - [Create and validate requisition requests](https://github.com/1vannce/rcwheels-systems-integration/issues/32)
- [ ] #33 - [Approval, rejection, and resubmission workflow](https://github.com/1vannce/rcwheels-systems-integration/issues/33)
- [ ] #34 - [Stock check and reservation for approved requests](https://github.com/1vannce/rcwheels-systems-integration/issues/34)

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

- Keep this checklist synchronized with issue and pull request status.
- Do not mark a phase complete until its PLAN.md exit criterion is verified.
- Closed issues are intentionally omitted from the unfinished-work lists.
