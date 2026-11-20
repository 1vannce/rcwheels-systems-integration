# RCWheels Business Management System

One central system that connects Requisition, Inventory, Purchasing, and Delivery for RCWheels' main location. These are the words the team, the code, and AI agents should use for it. Source: `docs/PLAN.md` and `docs/BUSINESS_RULES.md`.

## Requests

**Requisition Form (RF)**:
An employee's request for items from stock. Plain "requisition" always means an RF.
_Avoid_: request, item request, order

**Requester**:
The employee or mechanic who needs the items on an RF. Someone else can submit the RF on their behalf, but the requester accepts the items and signs the AR.
_Avoid_: customer, user

**Requisition Approver**:
The manager, department head, or boss who approves or rejects an RF and marks it Fulfilled.
_Avoid_: approver (when the PO approver could be meant)

**Fulfilled**:
An RF whose required quantities are all accepted by the requester or separately cancelled. A supplier receipt alone never fulfills an RF.
_Avoid_: done, completed, delivered

## Inventory

**Item**:
A product or part that RCWheels keeps in stock.
_Avoid_: product, part, SKU

**Usable stock**:
On-hand quantity that is in good condition and can be reserved or dispatched.
_Avoid_: on hand, total stock

**Available stock**:
Usable stock minus active reservations. This is what a new RF or a sale can take.
_Avoid_: free stock, remaining stock

**Reservation**:
Usable stock set aside for one approved RF. It cannot go to another RF or a sale.
_Avoid_: hold, allocation, booking

**In transit**:
Stock that has been dispatched to the requester but not yet accepted or returned.
_Avoid_: on delivery, out

**Held stock**:
Returned items waiting for inspection. They stay here until judged usable or damaged.
_Avoid_: quarantine, pending stock

**Reorder Point**:
The available quantity at or below which the system alerts the Custodian and Inventory Manager to review. It starts a review, not a purchase.
_Avoid_: minimum stock, reorder level

**Stock Adjustment**:
An approved correction to a stock balance after a count or error.
_Avoid_: stock edit, correction

**Sales Deduction**:
A manual stock deduction backed by a sales record. It can only take available stock.
_Avoid_: sale, stock out

## Purchasing

**Purchase Requisition**:
An internal request to buy items when stock cannot cover an approved RF or an item hits its reorder point. Always spell it out.
_Avoid_: PR (clashes with pull request), requisition (used alone), purchase request

**Purchase Order (PO)**:
An order to a supplier for specific items, quantities, and prices. It can be placed only after Accounting approves that exact version.
_Avoid_: order, purchase

**PO Revision**:
A new version of a PO after a change to supplier, item, quantity, or price. It needs approval again.
_Avoid_: PO edit, amendment

**Supplier**:
An outside business that sells items to RCWheels.
_Avoid_: vendor

## Receiving and delivery

**Supplier Receipt**:
The record of goods checked in against a placed PO. Accepted quantities post to usable stock once, here.
_Avoid_: receiving, delivery (used alone)

**Delivery Receipt (DR)**:
The supplier's own paper slip that comes with the goods. It is attached to the supplier receipt as a supporting document.
_Avoid_: AR, supplier receipt

**Supplier Discrepancy Report (SDR)**:
The Custodian's report of a shortage, damage, wrong item, or excess in a supplier delivery.
_Avoid_: supplier complaint, delivery issue

**Dispatch**:
Sending reserved items from stock to the requester. Stock is deducted here, once.
_Avoid_: issue, release, delivery

**Acknowledgement Receipt (AR)**:
The record the requester signs in the system to confirm they received the dispatched items.
_Avoid_: delivery receipt, DR, proof of delivery

**Requester Discrepancy Report (RDR)**:
The requester's report of a problem with dispatched items. It moves the RF to Pending Resolution.
_Avoid_: rejection, complaint

**Pending Resolution**:
The RF status after an RDR, until the approver approves a replacement or cancels the quantity. It is never "Rejected".
_Avoid_: rejected, on hold

**Return**:
Dispatched items sent back by the requester. They go to held stock first.
_Avoid_: refund, return to supplier

## Flow

**Connector**:
A handoff between modules, labeled A to G in `docs/PLAN.md` section 5. For example, Connector A sends an approved RF to the Inventory queue.
_Avoid_: link, hook, off-page connector (that is the flowchart symbol)
