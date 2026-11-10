import "server-only";

import type { Tx } from "@/db";
import { BlockedActionError } from "@/modules/core";

import {
  addAcceptedQuantity,
  addToBalance,
  averageCostIn,
  averageCostOut,
  findAdjustmentForPosting,
  findAverageCost,
  findDispatchLine,
  findMovementById,
  findRequisitionLineItem,
  findReservation,
  findReturnLine,
  findSupplierReceiptLine,
  insertMissingBalances,
  insertMovement,
  insertReservation,
  itemExists,
  lockBalance,
  lockBalanceById,
  movementExists,
  setBalanceIncomplete,
  sumActiveReservations,
  sumSupplierReturns,
  updateReservation,
} from "../repositories/stock.repository";
import type { MovementType, StockBalance, StockCondition } from "../types/stock.type";
import {
  addQuantities,
  compareQuantities,
  formatQuantity,
  isQuantity,
  negateQuantity,
  subtractQuantities,
} from "./quantity.service";

// The only code that changes stock balances (PLAN section 7, "Stock events").
//
// Every function here:
// - takes the caller's transaction, so the stock change commits or rolls back
//   with the record, status history, audit entry, and notifications;
// - locks the stock_balances row it touches before reading it;
// - writes one stock_movements row whose event key comes from a unique source
//   reference, so the same event can post only once;
// - throws BlockedActionError when a rule refuses the event.
//
// Reserved and in-transit quantities are not stored on stock_balances. Reserved
// is the sum of active stock_reservations. In transit is sent minus accepted
// minus returned on dispatch_lines.

const ZERO = "0.000";
const ALREADY_POSTED = "This stock event has already been posted.";

function blocked(
  message: string,
  action: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "stock_movements",
    entityId: 0,
    action: `stock.${action}`,
    details,
  });
}

function assertPositiveQuantity(quantity: string, action: string): void {
  if (!isQuantity(quantity) || compareQuantities(quantity, ZERO) <= 0) {
    throw blocked("The quantity must be more than zero, with up to 3 decimal places.", action, {
      quantity,
    });
  }
}

async function lockItemBalance(
  tx: Tx,
  itemId: number,
  condition: StockCondition,
  action: string,
): Promise<StockBalance> {
  await insertMissingBalances(tx, itemId);

  const balance = await lockBalance(tx, itemId, condition);

  if (!balance) {
    throw blocked("The item has no stock balance.", action, { itemId, condition });
  }

  return balance;
}

/** Locks the usable rows of several items in item ID order (rule 10). */
async function lockUsableBalancesInOrder(
  tx: Tx,
  itemIds: number[],
  action: string,
): Promise<void> {
  const ordered = [...new Set(itemIds)].sort((a, b) => a - b);

  for (const itemId of ordered) {
    await lockItemBalance(tx, itemId, "usable", action);
  }
}

/** Writes the ledger row, refusing an event that has already been posted. */
async function postMovement(
  tx: Tx,
  action: string,
  movement: Parameters<typeof insertMovement>[1] & { movementType: MovementType },
): Promise<number> {
  const movementId = await insertMovement(tx, movement);

  if (movementId === null) {
    throw blocked(ALREADY_POSTED, action, {
      eventKey: movement.eventKey,
    });
  }

  return movementId;
}

/**
 * Refuses a repeat before any other rule runs, so a duplicate is always
 * reported as a duplicate. Call it while holding the balance lock.
 */
async function assertNotPosted(tx: Tx, action: string, eventKey: string): Promise<void> {
  if (await movementExists(tx, eventKey)) {
    throw blocked(ALREADY_POSTED, action, { eventKey });
  }
}

async function getAvailable(tx: Tx, usable: StockBalance): Promise<string> {
  const reserved = await sumActiveReservations(tx, usable.stockBalanceId);

  return subtractQuantities(usable.quantityOnHand, reserved);
}

/** Creates an item's three balance rows at zero. */
export async function openItemBalances(tx: Tx, itemId: number): Promise<void> {
  await insertMissingBalances(tx, itemId);
}

/**
 * Accept supplier receipt: usable +q. The quantity is the accepted quantity on
 * the receipt line and the cost is the PO line price, which also updates the
 * item's moving weighted average cost. Posts once per receipt line.
 */
export async function acceptSupplierReceipt(
  tx: Tx,
  input: { supplierReceiptLineId: number },
): Promise<{ movementId: number }> {
  const action = "accept-supplier-receipt";
  const line = await findSupplierReceiptLine(tx, input.supplierReceiptLineId);

  if (!line) {
    throw blocked("The supplier receipt line does not exist.", action, input);
  }

  assertPositiveQuantity(line.acceptedQty, action);

  const usable = await lockItemBalance(tx, line.itemId, "usable", action);
  const movementId = await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "supplier_receipt",
    quantityDelta: line.acceptedQty,
    unitCost: line.unitPrice,
    supplierReceiptLineId: line.supplierReceiptLineId,
    eventKey: `supplier_receipt:${line.supplierReceiptLineId}`,
  });

  await averageCostIn(tx, line.itemId, usable.quantityOnHand, line.acceptedQty, line.unitPrice);
  await addToBalance(tx, usable.stockBalanceId, line.acceptedQty);

  return { movementId };
}

/**
 * Reserve for request: reserved +q, limited to available stock. A balance
 * flagged incomplete cannot be allocated until it is physically verified
 * (rule 9). `sourceRef` identifies this reservation attempt.
 */
export async function reserveStock(
  tx: Tx,
  input: { requisitionLineId: number; quantity: string; sourceRef: string },
): Promise<{ reservationId: number }> {
  const action = "reserve";

  assertPositiveQuantity(input.quantity, action);

  const itemId = await findRequisitionLineItem(tx, input.requisitionLineId);

  if (itemId === null) {
    throw blocked("The requisition line does not exist.", action, input);
  }

  const usable = await lockItemBalance(tx, itemId, "usable", action);

  await assertNotPosted(tx, action, `reserve:${input.sourceRef}`);

  if (usable.isIncomplete) {
    throw blocked(
      "This balance is flagged incomplete and needs a physical count before stock can be reserved.",
      action,
      { ...input, itemId },
    );
  }

  const available = await getAvailable(tx, usable);

  if (compareQuantities(input.quantity, available) > 0) {
    throw blocked(
      `Only ${formatQuantity(available)} available to reserve.`,
      action,
      { ...input, itemId, available },
    );
  }

  await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "reservation",
    quantityDelta: ZERO,
    eventKey: `reserve:${input.sourceRef}`,
  });

  const reservationId = await insertReservation(tx, {
    requisitionLineId: input.requisitionLineId,
    stockBalanceId: usable.stockBalanceId,
    reservedQty: input.quantity,
  });

  return { reservationId };
}

/** Reserves several lines in one event, locking balances in item ID order. */
export async function reserveStockForLines(
  tx: Tx,
  lines: { requisitionLineId: number; quantity: string; sourceRef: string }[],
): Promise<{ reservationId: number }[]> {
  const action = "reserve";
  const itemIds: number[] = [];

  for (const line of lines) {
    const itemId = await findRequisitionLineItem(tx, line.requisitionLineId);

    if (itemId === null) {
      throw blocked("The requisition line does not exist.", action, line);
    }

    itemIds.push(itemId);
  }

  await lockUsableBalancesInOrder(tx, itemIds, action);

  const reservations: { reservationId: number }[] = [];

  for (const line of lines) {
    reservations.push(await reserveStock(tx, line));
  }

  return reservations;
}

/** Release reservation: reserved -q. A reservation can be released once. */
export async function releaseReservation(
  tx: Tx,
  input: { reservationId: number },
): Promise<void> {
  const action = "release-reservation";
  const found = await findReservation(tx, input.reservationId);

  if (!found) {
    throw blocked("The reservation does not exist.", action, input);
  }

  await lockBalanceById(tx, found.stockBalanceId);

  // Read again under the lock: a dispatch may have consumed it meanwhile.
  const reservation = await findReservation(tx, input.reservationId);

  if (!reservation || reservation.status !== "active") {
    throw blocked("Only an active reservation can be released.", action, input);
  }

  await postMovement(tx, action, {
    stockBalanceId: reservation.stockBalanceId,
    movementType: "reservation_release",
    quantityDelta: ZERO,
    eventKey: `release:${reservation.reservationId}`,
  });
  await updateReservation(tx, reservation.reservationId, { status: "released" });
}

/**
 * Dispatch: usable -q, reserved -q, in transit +q. The quantity is the sent
 * quantity on the dispatch line, taken from that line's own reservation, so
 * stock reserved for one request cannot go to another (rule 8). A reservation
 * larger than the sent quantity keeps the rest reserved. Posts once per
 * dispatch line. Stock is deducted here and nowhere else (rule 3).
 */
export async function dispatchStock(
  tx: Tx,
  input: { dispatchLineId: number; reservationId: number },
): Promise<{ movementId: number }> {
  const action = "dispatch";
  const line = await findDispatchLine(tx, input.dispatchLineId);

  if (!line) {
    throw blocked("The dispatch line does not exist.", action, input);
  }

  assertPositiveQuantity(line.sentQty, action);

  const usable = await lockItemBalance(tx, line.itemId, "usable", action);
  const reservation = await findReservation(tx, input.reservationId);

  await assertNotPosted(tx, action, `dispatch:${line.dispatchLineId}`);

  if (
    !reservation ||
    reservation.status !== "active" ||
    reservation.requisitionLineId !== line.requisitionLineId ||
    reservation.stockBalanceId !== usable.stockBalanceId
  ) {
    throw blocked(
      "Dispatch needs an active reservation for the same requisition line.",
      action,
      input,
    );
  }

  if (compareQuantities(line.sentQty, reservation.reservedQty) > 0) {
    throw blocked(
      `Only ${formatQuantity(reservation.reservedQty)} is reserved for this line.`,
      action,
      { ...input, sentQty: line.sentQty, reservedQty: reservation.reservedQty },
    );
  }

  if (compareQuantities(line.sentQty, usable.quantityOnHand) > 0) {
    throw blocked(
      `Only ${formatQuantity(usable.quantityOnHand)} on hand to dispatch.`,
      action,
      { ...input, sentQty: line.sentQty, onHand: usable.quantityOnHand },
    );
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "dispatch",
    quantityDelta: negateQuantity(line.sentQty),
    unitCost: await findAverageCost(tx, line.itemId),
    dispatchLineId: line.dispatchLineId,
    eventKey: `dispatch:${line.dispatchLineId}`,
  });

  await addToBalance(tx, usable.stockBalanceId, negateQuantity(line.sentQty));
  await updateReservation(tx, reservation.reservationId, {
    status: "consumed",
    reservedQty: line.sentQty,
  });

  const stillReserved = subtractQuantities(reservation.reservedQty, line.sentQty);

  if (compareQuantities(stillReserved, ZERO) > 0) {
    await insertReservation(tx, {
      requisitionLineId: reservation.requisitionLineId,
      stockBalanceId: reservation.stockBalanceId,
      reservedQty: stillReserved,
    });
  }

  return { movementId };
}

/** Dispatches several lines in one event, locking balances in item ID order. */
export async function dispatchStockLines(
  tx: Tx,
  lines: { dispatchLineId: number; reservationId: number }[],
): Promise<{ movementId: number }[]> {
  const action = "dispatch";
  const itemIds: number[] = [];

  for (const input of lines) {
    const line = await findDispatchLine(tx, input.dispatchLineId);

    if (!line) {
      throw blocked("The dispatch line does not exist.", action, input);
    }

    itemIds.push(line.itemId);
  }

  await lockUsableBalancesInOrder(tx, itemIds, action);

  const movements: { movementId: number }[] = [];

  for (const input of lines) {
    movements.push(await dispatchStock(tx, input));
  }

  return movements;
}

/**
 * Requester accepts: in transit -q, by adding q to the dispatch line's accepted
 * quantity. Acceptance deducts nothing from stock (rule 3). `sourceRef`
 * identifies the acceptance, for example the signed AR.
 */
export async function acceptDispatchedItems(
  tx: Tx,
  input: { dispatchLineId: number; quantity: string; sourceRef: string },
): Promise<{ movementId: number }> {
  const action = "requester-accept";

  assertPositiveQuantity(input.quantity, action);

  const found = await findDispatchLine(tx, input.dispatchLineId);

  if (!found) {
    throw blocked("The dispatch line does not exist.", action, input);
  }

  const usable = await lockItemBalance(tx, found.itemId, "usable", action);

  await assertNotPosted(tx, action, `acceptance:${input.sourceRef}`);

  // Read again under the lock so two acceptances cannot both pass the check.
  const line = (await findDispatchLine(tx, input.dispatchLineId))!;
  const inTransit = inTransitOf(line);

  if (compareQuantities(input.quantity, inTransit) > 0) {
    throw blocked(`Only ${formatQuantity(inTransit)} is in transit on this line.`, action, {
      ...input,
      inTransit,
    });
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "acceptance",
    quantityDelta: ZERO,
    dispatchLineId: line.dispatchLineId,
    eventKey: `acceptance:${input.sourceRef}`,
  });

  await addAcceptedQuantity(tx, line.dispatchLineId, input.quantity);

  return { movementId };
}

function inTransitOf(line: { sentQty: string; acceptedQty: string; returnedQty: string }) {
  return subtractQuantities(subtractQuantities(line.sentQty, line.acceptedQty), line.returnedQty);
}

/**
 * Item returned: in transit -q, held +q. The quantity is the returned quantity
 * on the return line, whose existence already takes it out of transit. Posts
 * once per return line.
 */
export async function receiveReturnedItems(
  tx: Tx,
  input: { returnLineId: number },
): Promise<{ movementId: number }> {
  const action = "item-returned";
  const returnLine = await findReturnLine(tx, input.returnLineId);

  if (!returnLine) {
    throw blocked("The return line does not exist.", action, input);
  }

  assertPositiveQuantity(returnLine.returnedQty, action);

  const found = (await findDispatchLine(tx, returnLine.dispatchLineId))!;
  const hold = await lockItemBalance(tx, found.itemId, "hold", action);

  await assertNotPosted(tx, action, `return:${returnLine.returnLineId}`);

  const line = (await findDispatchLine(tx, returnLine.dispatchLineId))!;

  // returnedQty already includes this return line.
  if (compareQuantities(inTransitOf(line), ZERO) < 0) {
    throw blocked("More is being returned than is in transit on this line.", action, {
      ...input,
      sentQty: line.sentQty,
      acceptedQty: line.acceptedQty,
      returnedQty: line.returnedQty,
    });
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: hold.stockBalanceId,
    movementType: "return",
    quantityDelta: returnLine.returnedQty,
    returnLineId: returnLine.returnLineId,
    eventKey: `return:${returnLine.returnLineId}`,
  });

  await addToBalance(tx, hold.stockBalanceId, returnLine.returnedQty);

  return { movementId };
}

/**
 * Return inspected: held -q, then usable +q or damaged +q. An uncertain return
 * is not posted and stays held until it is reinspected. Posts once per return
 * line.
 */
export async function inspectReturn(
  tx: Tx,
  input: { returnLineId: number; result: "usable" | "damaged" },
): Promise<{ movementIds: [number, number] }> {
  const action = "return-inspected";
  const returnLine = await findReturnLine(tx, input.returnLineId);

  if (!returnLine) {
    throw blocked("The return line does not exist.", action, input);
  }

  if (!(await movementExists(tx, `return:${returnLine.returnLineId}`))) {
    throw blocked("The return has not been received into held stock yet.", action, input);
  }

  const line = (await findDispatchLine(tx, returnLine.dispatchLineId))!;
  // Same lock order every time (target first, then hold) for one item.
  const target = await lockItemBalance(tx, line.itemId, input.result, action);
  const hold = await lockItemBalance(tx, line.itemId, "hold", action);

  await assertNotPosted(tx, action, `return_inspection:${returnLine.returnLineId}:hold`);

  if (compareQuantities(returnLine.returnedQty, hold.quantityOnHand) > 0) {
    throw blocked(`Only ${formatQuantity(hold.quantityOnHand)} is held for this item.`, action, {
      ...input,
      held: hold.quantityOnHand,
    });
  }

  const outOfHold = await postMovement(tx, action, {
    stockBalanceId: hold.stockBalanceId,
    movementType: "return_inspection",
    quantityDelta: negateQuantity(returnLine.returnedQty),
    returnLineId: returnLine.returnLineId,
    eventKey: `return_inspection:${returnLine.returnLineId}:hold`,
  });
  const intoTarget = await postMovement(tx, action, {
    stockBalanceId: target.stockBalanceId,
    movementType: "return_inspection",
    quantityDelta: returnLine.returnedQty,
    returnLineId: returnLine.returnLineId,
    eventKey: `return_inspection:${returnLine.returnLineId}:${input.result}`,
  });

  await addToBalance(tx, hold.stockBalanceId, negateQuantity(returnLine.returnedQty));
  await addToBalance(tx, target.stockBalanceId, returnLine.returnedQty);

  return { movementIds: [outOfHold, intoTarget] };
}

/**
 * Sales deduction: usable -q, limited to available stock, so it can never take
 * stock reserved for a request (rule 8). `salesRef` is the sales record line,
 * which can be posted once per item. A sale entered after its sale date flags
 * the balance incomplete until a physical count is approved.
 */
export async function deductSales(
  tx: Tx,
  input: {
    itemId: number;
    quantity: string;
    salesRef: string;
    /** Sale date as YYYY-MM-DD. */
    saleDate: string;
    /** Date of entry as YYYY-MM-DD. */
    entryDate: string;
  },
): Promise<{ movementId: number; isLate: boolean }> {
  const action = "sales-deduction";

  assertPositiveQuantity(input.quantity, action);

  if (!(await itemExists(tx, input.itemId))) {
    throw blocked("The item does not exist.", action, input);
  }

  if (input.saleDate > input.entryDate) {
    throw blocked("The sale date cannot be in the future.", action, input);
  }

  const usable = await lockItemBalance(tx, input.itemId, "usable", action);

  await assertNotPosted(tx, action, `sales:${input.salesRef}:${input.itemId}`);

  const available = await getAvailable(tx, usable);

  if (compareQuantities(input.quantity, available) > 0) {
    throw blocked(
      `Only ${formatQuantity(available)} available. Stock reserved for requests cannot be sold.`,
      action,
      { ...input, available },
    );
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "sales_deduction",
    quantityDelta: negateQuantity(input.quantity),
    unitCost: await findAverageCost(tx, input.itemId),
    eventKey: `sales:${input.salesRef}:${input.itemId}`,
  });

  await addToBalance(tx, usable.stockBalanceId, negateQuantity(input.quantity));

  const isLate = input.saleDate < input.entryDate;

  if (isLate) {
    await setBalanceIncomplete(tx, usable.stockBalanceId, true);
  }

  return { movementId, isLate };
}

/**
 * Sales reversal: usable +q, linked to the deduction it reverses. The original
 * row is never edited, and it can be reversed only once.
 */
export async function reverseSalesDeduction(
  tx: Tx,
  input: { movementId: number },
): Promise<{ movementId: number }> {
  const action = "sales-reversal";
  const original = await findMovementById(tx, input.movementId);

  if (!original || original.movementType !== "sales_deduction") {
    throw blocked("Only a sales deduction can be reversed.", action, input);
  }

  const balance = (await lockBalanceById(tx, original.stockBalanceId))!;
  const quantity = negateQuantity(original.quantityDelta);
  const movementId = await insertMovement(tx, {
    stockBalanceId: balance.stockBalanceId,
    movementType: "sales_reversal",
    quantityDelta: quantity,
    unitCost: original.unitCost,
    reversesMovementId: original.movementId,
    eventKey: `sales_reversal:${original.movementId}`,
  });

  if (movementId === null) {
    throw blocked("This sales deduction has already been reversed.", action, input);
  }

  await addToBalance(tx, balance.stockBalanceId, quantity);

  return { movementId };
}

/**
 * Approved adjustment: the balance moves by counted minus recorded. Only an
 * adjustment already marked approved can post, once. An approved count is the
 * physical verification that clears the incomplete flag.
 */
export async function applyApprovedAdjustment(
  tx: Tx,
  input: { adjustmentId: number },
): Promise<{ movementId: number; quantityDelta: string }> {
  const action = "adjustment";
  const adjustment = await findAdjustmentForPosting(tx, input.adjustmentId);

  if (!adjustment || adjustment.status !== "approved") {
    throw blocked("Only an approved adjustment can change stock.", action, input);
  }

  const balance = (await lockBalanceById(tx, adjustment.stockBalanceId))!;

  await assertNotPosted(tx, action, `adjustment:${adjustment.adjustmentId}`);

  const quantityDelta = subtractQuantities(adjustment.countedQty, adjustment.recordedQty);
  const newQuantity = addQuantities(balance.quantityOnHand, quantityDelta);
  const reserved =
    balance.condition === "usable"
      ? await sumActiveReservations(tx, balance.stockBalanceId)
      : ZERO;

  if (compareQuantities(newQuantity, reserved) < 0) {
    throw blocked(
      `The adjustment would leave ${formatQuantity(newQuantity)} on hand, below the ${formatQuantity(reserved)} reserved.`,
      action,
      { ...input, quantityDelta, onHand: balance.quantityOnHand, reserved },
    );
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: balance.stockBalanceId,
    movementType: "adjustment",
    quantityDelta,
    adjustmentId: adjustment.adjustmentId,
    eventKey: `adjustment:${adjustment.adjustmentId}`,
  });

  await addToBalance(tx, balance.stockBalanceId, quantityDelta);
  await setBalanceIncomplete(tx, balance.stockBalanceId, false);

  return { movementId, quantityDelta };
}

/**
 * Return of posted stock to supplier: usable -q, limited to available stock
 * and to what that receipt line posted. The receipt cost is taken back out of
 * the average cost (value reversal). `sourceRef` identifies the return.
 */
export async function returnToSupplier(
  tx: Tx,
  input: { supplierReceiptLineId: number; quantity: string; sourceRef: string },
): Promise<{ movementId: number }> {
  const action = "return-to-supplier";

  assertPositiveQuantity(input.quantity, action);

  const line = await findSupplierReceiptLine(tx, input.supplierReceiptLineId);

  if (!line || !(await movementExists(tx, `supplier_receipt:${input.supplierReceiptLineId}`))) {
    throw blocked("That receipt line has not posted stock.", action, input);
  }

  const usable = await lockItemBalance(tx, line.itemId, "usable", action);

  await assertNotPosted(tx, action, `supplier_return:${input.sourceRef}`);

  const alreadyReturned = await sumSupplierReturns(tx, line.supplierReceiptLineId);
  const returnable = subtractQuantities(line.acceptedQty, alreadyReturned);

  if (compareQuantities(input.quantity, returnable) > 0) {
    throw blocked(
      `Only ${formatQuantity(returnable)} from this receipt line can still be returned.`,
      action,
      { ...input, returnable },
    );
  }

  const available = await getAvailable(tx, usable);

  if (compareQuantities(input.quantity, available) > 0) {
    throw blocked(`Only ${formatQuantity(available)} available to return.`, action, {
      ...input,
      available,
    });
  }

  const movementId = await postMovement(tx, action, {
    stockBalanceId: usable.stockBalanceId,
    movementType: "supplier_return",
    quantityDelta: negateQuantity(input.quantity),
    unitCost: line.unitPrice,
    supplierReceiptLineId: line.supplierReceiptLineId,
    eventKey: `supplier_return:${input.sourceRef}`,
  });

  await averageCostOut(tx, line.itemId, usable.quantityOnHand, input.quantity, line.unitPrice);
  await addToBalance(tx, usable.stockBalanceId, negateQuantity(input.quantity));

  return { movementId };
}
