import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { auditLog, dispatchLines, stockAdjustments, stockBalances } from "@/db/schema";
import { runBusinessEvent, type AppRole, type AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import {
  averageCost,
  createDispatchLine,
  createItem,
  createRequisitionLine,
  createReturnLine,
  createSupplierReceiptLine,
  isIncomplete,
  movements,
  onHand,
  reservations,
} from "@/test/stock-fixtures";

import { getItemStockDetail } from "./item.service";
import {
  acceptDispatchedItems,
  acceptSupplierReceipt,
  applyApprovedAdjustment,
  deductSales,
  dispatchStock,
  inspectReturn,
  receiveReturnedItems,
  releaseReservation,
  reserveStock,
  reserveStockForLines,
  returnToSupplier,
  reverseSalesDeduction,
} from "./stock.service";

const ALREADY_POSTED = "This stock event has already been posted.";

describeWithDatabase("stock service", () => {
  let users: Record<AppRole, AppUser>;
  let custodian: number;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
    custodian = users.inventory_custodian.userId;
  });

  afterAll(closeDatabase);

  /** The six stock figures of one item, as the screens show them. */
  async function figures(itemId: number) {
    const { item } = (await getItemStockDetail(itemId))!;

    return {
      usable: item.usable,
      reserved: item.reserved,
      available: item.available,
      inTransit: item.inTransit,
      held: item.held,
      damaged: item.damaged,
    };
  }

  /** Reserves and dispatches `quantity` of an item with 10 on hand. */
  async function dispatched(quantity: string) {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, quantity);
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity,
      sourceRef: "rf-1",
    });
    const dispatchLineId = await createDispatchLine(custodian, line, quantity);

    await dispatchStock(db, { dispatchLineId, reservationId });

    return { itemId, line, dispatchLineId, reservationId };
  }

  it("accept supplier receipt: usable +q and moving weighted average cost", async () => {
    const itemId = await createItem("TST-1");
    const first = await createSupplierReceiptLine(custodian, itemId, "10", "100.00");

    await acceptSupplierReceipt(db, { supplierReceiptLineId: first });

    expect(await onHand(itemId)).toBe("10.000");
    expect(await averageCost(itemId)).toBe("100.0000");

    const second = await createSupplierReceiptLine(custodian, itemId, "30", "120.00");

    await acceptSupplierReceipt(db, { supplierReceiptLineId: second });

    // (10 x 100 + 30 x 120) / 40
    expect(await onHand(itemId)).toBe("40.000");
    expect(await averageCost(itemId)).toBe("115.0000");

    const [movement] = await movements();

    expect(movement).toMatchObject({
      movementType: "supplier_receipt",
      quantityDelta: "10.000",
      unitCost: "100.0000",
      supplierReceiptLineId: first,
      eventKey: `supplier_receipt:${first}`,
    });
  });

  it("accept supplier receipt: the same receipt line posts only once", async () => {
    const itemId = await createItem("TST-1");
    const lineId = await createSupplierReceiptLine(custodian, itemId, "10", "100.00");

    await acceptSupplierReceipt(db, { supplierReceiptLineId: lineId });

    await expect(
      db.transaction((tx) => acceptSupplierReceipt(tx, { supplierReceiptLineId: lineId })),
    ).rejects.toThrow(ALREADY_POSTED);
    expect(await onHand(itemId)).toBe("10.000");
    expect(await movements()).toHaveLength(1);
  });

  it("reserve: reserved +q, on hand unchanged, available reduced", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "4");

    await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-1",
    });

    expect(await figures(itemId)).toEqual({
      usable: "10.000",
      reserved: "4.000",
      available: "6.000",
      inTransit: "0.000",
      held: "0.000",
      damaged: "0.000",
    });
    expect((await movements())[0]).toMatchObject({
      movementType: "reservation",
      quantityDelta: "0.000",
      eventKey: "reserve:rf-1",
    });
  });

  it("reserve: refuses more than available and a repeated source reference", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "8");
    const input = { requisitionLineId: line.requisitionLineId, quantity: "8", sourceRef: "rf-1" };

    await reserveStock(db, input);

    await expect(
      db.transaction((tx) => reserveStock(tx, { ...input, quantity: "1" })),
    ).rejects.toThrow(ALREADY_POSTED);
    await expect(
      db.transaction((tx) => reserveStock(tx, { ...input, quantity: "3", sourceRef: "rf-2" })),
    ).rejects.toThrow("Only 2 available to reserve.");
    expect(await reservations()).toHaveLength(1);
  });

  it("reserve: refuses a balance flagged incomplete (rule 9)", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "1");

    await db
      .update(stockBalances)
      .set({ isIncomplete: true })
      .where(eq(stockBalances.itemId, itemId));

    await expect(
      reserveStock(db, {
        requisitionLineId: line.requisitionLineId,
        quantity: "1",
        sourceRef: "rf-1",
      }),
    ).rejects.toThrow("flagged incomplete");
  });

  it("reserve: two requests for the last unit at the same time, only one succeeds", async () => {
    const itemId = await createItem("TST-1", "1");
    const first = await createRequisitionLine(custodian, itemId, "1");
    const second = await createRequisitionLine(users.requester.userId, itemId, "1");

    const results = await Promise.allSettled(
      [first, second].map((line, index) =>
        db.transaction((tx) =>
          reserveStock(tx, {
            requisitionLineId: line.requisitionLineId,
            quantity: "1",
            sourceRef: `rf-${index}`,
          }),
        ),
      ),
    );

    const refused = results.filter((result) => result.status === "rejected");

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(refused).toHaveLength(1);
    // The loser is told what is left.
    expect((refused[0] as PromiseRejectedResult).reason.message).toBe(
      "Only 0 available to reserve.",
    );
    expect(await reservations()).toHaveLength(1);
    expect((await figures(itemId)).available).toBe("0.000");
  });

  it("reserve: several items lock in item ID order, so opposite orders do not deadlock", async () => {
    const itemA = await createItem("TST-A", "100");
    const itemB = await createItem("TST-B", "100");
    const first = {
      a: await createRequisitionLine(custodian, itemA, "20"),
      b: await createRequisitionLine(custodian, itemB, "20"),
    };
    const second = {
      a: await createRequisitionLine(users.requester.userId, itemA, "20"),
      b: await createRequisitionLine(users.requester.userId, itemB, "20"),
    };
    const line = (requisitionLineId: number, sourceRef: string) => ({
      requisitionLineId,
      quantity: "1",
      sourceRef,
    });

    // One request lists A then B, the other B then A. Without ordered locking
    // PostgreSQL would abort one of them with a deadlock error.
    for (let round = 0; round < 10; round++) {
      await Promise.all([
        db.transaction((tx) =>
          reserveStockForLines(tx, [
            line(first.a.requisitionLineId, `r${round}-1a`),
            line(first.b.requisitionLineId, `r${round}-1b`),
          ]),
        ),
        db.transaction((tx) =>
          reserveStockForLines(tx, [
            line(second.b.requisitionLineId, `r${round}-2b`),
            line(second.a.requisitionLineId, `r${round}-2a`),
          ]),
        ),
      ]);
    }

    expect(await reservations()).toHaveLength(40);
    expect((await figures(itemA)).available).toBe("80.000");
    expect((await figures(itemB)).available).toBe("80.000");
  });

  it("release reservation: reserved -q, once", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "4");
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-1",
    });

    await releaseReservation(db, { reservationId });

    expect(await figures(itemId)).toMatchObject({
      usable: "10.000",
      reserved: "0.000",
      available: "10.000",
    });
    expect((await reservations())[0].status).toBe("released");
    await expect(
      db.transaction((tx) => releaseReservation(tx, { reservationId })),
    ).rejects.toThrow("Only an active reservation can be released.");
  });

  it("dispatch: usable -q, reserved -q, in transit +q, once per dispatch line", async () => {
    const { itemId, dispatchLineId, reservationId } = await dispatched("4");

    expect(await figures(itemId)).toEqual({
      usable: "6.000",
      reserved: "0.000",
      available: "6.000",
      inTransit: "4.000",
      held: "0.000",
      damaged: "0.000",
    });
    expect((await reservations())[0].status).toBe("consumed");

    await expect(
      db.transaction((tx) => dispatchStock(tx, { dispatchLineId, reservationId })),
    ).rejects.toThrow();
    expect(await onHand(itemId)).toBe("6.000");
    expect((await movements()).filter((m) => m.movementType === "dispatch")).toHaveLength(1);
  });

  it("dispatch: a partial issue keeps the rest reserved", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "5");
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "5",
      sourceRef: "rf-1",
    });
    const dispatchLineId = await createDispatchLine(custodian, line, "2");

    await dispatchStock(db, { dispatchLineId, reservationId });

    expect(await figures(itemId)).toMatchObject({
      usable: "8.000",
      reserved: "3.000",
      available: "5.000",
      inTransit: "2.000",
    });
  });

  it("dispatch: refuses stock reserved for another request (rule 8)", async () => {
    const itemId = await createItem("TST-1", "10");
    const reservedLine = await createRequisitionLine(custodian, itemId, "4");
    const otherLine = await createRequisitionLine(users.requester.userId, itemId, "4");
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: reservedLine.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-1",
    });
    const dispatchLineId = await createDispatchLine(custodian, otherLine, "4");

    await expect(
      db.transaction((tx) => dispatchStock(tx, { dispatchLineId, reservationId })),
    ).rejects.toThrow("Dispatch needs an active reservation for the same requisition line.");
    expect(await onHand(itemId)).toBe("10.000");
  });

  it("requester accepts: in transit -q and nothing deducted", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");

    await acceptDispatchedItems(db, { dispatchLineId, quantity: "3", sourceRef: "ar-1" });

    expect(await figures(itemId)).toMatchObject({ usable: "6.000", inTransit: "1.000" });

    await expect(
      db.transaction((tx) =>
        acceptDispatchedItems(tx, { dispatchLineId, quantity: "1", sourceRef: "ar-1" }),
      ),
    ).rejects.toThrow(ALREADY_POSTED);
    await expect(
      db.transaction((tx) =>
        acceptDispatchedItems(tx, { dispatchLineId, quantity: "2", sourceRef: "ar-2" }),
      ),
    ).rejects.toThrow("Only 1 is in transit on this line.");

    const [line] = await db.select().from(dispatchLines);

    expect(line.acceptedQty).toBe("3.000");
  });

  it("item returned: in transit -q, held +q, once per return line", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");
    const returnLineId = await createReturnLine(custodian, dispatchLineId, "4");

    await receiveReturnedItems(db, { returnLineId });

    expect(await figures(itemId)).toMatchObject({
      usable: "6.000",
      inTransit: "0.000",
      held: "4.000",
    });
    await expect(
      db.transaction((tx) => receiveReturnedItems(tx, { returnLineId })),
    ).rejects.toThrow(ALREADY_POSTED);
    expect(await onHand(itemId, "hold")).toBe("4.000");
  });

  it("return inspected usable: held -q, usable +q", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");
    const returnLineId = await createReturnLine(custodian, dispatchLineId, "4");

    await receiveReturnedItems(db, { returnLineId });
    await inspectReturn(db, { returnLineId, result: "usable" });

    expect(await figures(itemId)).toMatchObject({
      usable: "10.000",
      held: "0.000",
      damaged: "0.000",
    });
    await expect(
      db.transaction((tx) => inspectReturn(tx, { returnLineId, result: "damaged" })),
    ).rejects.toThrow();
    expect(await onHand(itemId, "damaged")).toBe("0.000");
  });

  it("return inspected damaged: held -q, damaged +q", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");
    const returnLineId = await createReturnLine(custodian, dispatchLineId, "4");

    await expect(
      db.transaction((tx) => inspectReturn(tx, { returnLineId, result: "damaged" })),
    ).rejects.toThrow("The return has not been received into held stock yet.");

    await receiveReturnedItems(db, { returnLineId });
    await inspectReturn(db, { returnLineId, result: "damaged" });

    expect(await figures(itemId)).toMatchObject({
      usable: "6.000",
      held: "0.000",
      damaged: "4.000",
    });
  });

  it("sales deduction: usable -q, limited to available, once per sales line", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "7");

    await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "7",
      sourceRef: "rf-1",
    });

    const sale = {
      itemId,
      quantity: "2",
      salesRef: "SI-1001",
      saleDate: "2026-11-10",
      entryDate: "2026-11-10",
    };
    const { isLate } = await deductSales(db, sale);

    expect(isLate).toBe(false);
    expect(await onHand(itemId)).toBe("8.000");
    expect(await isIncomplete(itemId)).toBe(false);

    // Same sales line again.
    await expect(db.transaction((tx) => deductSales(tx, sale))).rejects.toThrow(ALREADY_POSTED);
    // 8 on hand, 7 reserved: only 1 may be sold.
    await expect(
      db.transaction((tx) => deductSales(tx, { ...sale, salesRef: "SI-1002" })),
    ).rejects.toThrow("Only 1 available.");
    expect(await onHand(itemId)).toBe("8.000");
  });

  it("sales deduction: a late entry flags the balance incomplete", async () => {
    const itemId = await createItem("TST-1", "10");

    const { isLate } = await deductSales(db, {
      itemId,
      quantity: "1",
      salesRef: "SI-1001",
      saleDate: "2026-11-08",
      entryDate: "2026-11-10",
    });

    expect(isLate).toBe(true);
    expect(await isIncomplete(itemId)).toBe(true);
  });

  it("sales reversal: usable +q, linked to the original, once", async () => {
    const itemId = await createItem("TST-1", "10");
    const { movementId } = await deductSales(db, {
      itemId,
      quantity: "3",
      salesRef: "SI-1001",
      saleDate: "2026-11-10",
      entryDate: "2026-11-10",
    });

    const reversal = await reverseSalesDeduction(db, { movementId });

    expect(await onHand(itemId)).toBe("10.000");

    const all = await movements();

    // The original row is untouched; the reversal points at it.
    expect(all[0]).toMatchObject({ movementId, quantityDelta: "-3.000", reversesMovementId: null });
    expect(all[1]).toMatchObject({
      movementId: reversal.movementId,
      movementType: "sales_reversal",
      quantityDelta: "3.000",
      reversesMovementId: movementId,
    });

    await expect(
      db.transaction((tx) => reverseSalesDeduction(tx, { movementId })),
    ).rejects.toThrow("This sales deduction has already been reversed.");
    await expect(
      db.transaction((tx) => reverseSalesDeduction(tx, { movementId: reversal.movementId })),
    ).rejects.toThrow("Only a sales deduction can be reversed.");
    expect(await onHand(itemId)).toBe("10.000");
  });

  it("approved adjustment: applies the counted difference once and clears the flag", async () => {
    const itemId = await createItem("TST-1", "10");
    const [balance] = await db
      .update(stockBalances)
      .set({ isIncomplete: true })
      .where(eq(stockBalances.itemId, itemId))
      .returning();
    const [adjustment] = await db
      .insert(stockAdjustments)
      .values({
        stockBalanceId: balance.stockBalanceId,
        countedBy: custodian,
        recordedQty: "10",
        countedQty: "7.5",
        reason: "Physical count",
      })
      .returning();
    const input = { adjustmentId: adjustment.adjustmentId };

    await expect(db.transaction((tx) => applyApprovedAdjustment(tx, input))).rejects.toThrow(
      "Only an approved adjustment can change stock.",
    );

    await db.update(stockAdjustments).set({ status: "approved" });
    await applyApprovedAdjustment(db, input);

    expect(await onHand(itemId)).toBe("7.500");
    expect(await isIncomplete(itemId)).toBe(false);
    await expect(db.transaction((tx) => applyApprovedAdjustment(tx, input))).rejects.toThrow(
      ALREADY_POSTED,
    );
    expect(await onHand(itemId)).toBe("7.500");
  });

  it("return to supplier: usable -q with the receipt cost taken out of the average", async () => {
    const itemId = await createItem("TST-1");
    const first = await createSupplierReceiptLine(custodian, itemId, "10", "100.00");
    const second = await createSupplierReceiptLine(custodian, itemId, "30", "120.00");

    await acceptSupplierReceipt(db, { supplierReceiptLineId: first });
    await acceptSupplierReceipt(db, { supplierReceiptLineId: second });
    await returnToSupplier(db, { supplierReceiptLineId: second, quantity: "30", sourceRef: "rts-1" });

    // Back to the first receipt alone.
    expect(await onHand(itemId)).toBe("10.000");
    expect(await averageCost(itemId)).toBe("100.0000");

    await expect(
      db.transaction((tx) =>
        returnToSupplier(tx, { supplierReceiptLineId: first, quantity: "1", sourceRef: "rts-1" }),
      ),
    ).rejects.toThrow(ALREADY_POSTED);
    await expect(
      db.transaction((tx) =>
        returnToSupplier(tx, { supplierReceiptLineId: second, quantity: "1", sourceRef: "rts-2" }),
      ),
    ).rejects.toThrow("Only 0 from this receipt line can still be returned.");
  });

  it("rollback: a refused event leaves no partial rows, only the blocked audit entry", async () => {
    const itemId = await createItem("TST-1", "10");
    const sale = {
      itemId,
      quantity: "4",
      salesRef: "SI-1001",
      saleDate: "2026-11-01",
      entryDate: "2026-11-10",
    };

    await expect(
      runBusinessEvent(custodian, async (tx) => {
        // The first deduction succeeds inside the transaction and flags the balance...
        await deductSales(tx, sale);
        // ...then the second is refused, so everything must roll back.
        await deductSales(tx, { ...sale, salesRef: "SI-1002", quantity: "7" });
      }),
    ).rejects.toThrow("Only 6 available.");

    expect(await onHand(itemId)).toBe("10.000");
    expect(await isIncomplete(itemId)).toBe(false);
    expect(await movements()).toHaveLength(0);

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: custodian,
      action: "blocked:stock.sales-deduction",
    });

    // The refused reference was never used up, so it can still be posted.
    await deductSales(db, sale);
    expect(await onHand(itemId)).toBe("6.000");
  });
});
