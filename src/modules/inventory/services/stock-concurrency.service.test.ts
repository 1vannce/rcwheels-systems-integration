import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db, type Tx } from "@/db";
import { dispatchLines, stockAdjustments, stockBalances } from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
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
  returnToSupplier,
  reverseSalesDeduction,
} from "./stock.service";

// Two transactions posting the same stock event at the same time. The balance
// lock and the unique event key must let exactly one through, so stock is never
// counted or deducted twice (PLAN section 7, rule 3 and rule 10).

const ALREADY_POSTED = "This stock event has already been posted.";

/**
 * Runs one stock event in two transactions at the same time and asserts that
 * exactly one posts while the other is refused with `message`.
 */
async function expectOnlyOnePosts<T>(
  event: (tx: Tx) => Promise<T>,
  message: string = ALREADY_POSTED,
): Promise<void> {
  const results = await Promise.allSettled([db.transaction(event), db.transaction(event)]);
  const posted = results.filter((result) => result.status === "fulfilled");
  const refused = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  expect(posted).toHaveLength(1);
  expect(refused).toHaveLength(1);
  expect(refused[0].reason.message).toBe(message);
}

describeWithDatabase("stock posting concurrency", () => {
  let users: Record<AppRole, AppUser>;
  let custodian: number;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
    custodian = users.inventory_custodian.userId;
  });

  afterAll(closeDatabase);

  /** Reserves and dispatches `quantity` of an item with 10 on hand. */
  async function dispatched(quantity: string) {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, quantity);
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity,
      sourceRef: "rf-concurrency",
    });
    const dispatchLineId = await createDispatchLine(custodian, line, quantity);

    await dispatchStock(db, { dispatchLineId, reservationId });

    return { itemId, line, dispatchLineId, reservationId };
  }

  it("accept supplier receipt: a receipt line posts once under concurrency", async () => {
    const itemId = await createItem("TST-1");
    const lineId = await createSupplierReceiptLine(custodian, itemId, "10", "100.00");

    await expectOnlyOnePosts((tx) => acceptSupplierReceipt(tx, { supplierReceiptLineId: lineId }));

    expect(await onHand(itemId)).toBe("10.000");
    expect(await averageCost(itemId)).toBe("100.0000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "supplier_receipt"),
    ).toHaveLength(1);
  });

  it("reserve: the same source reference posts once under concurrency", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "4");
    const input = {
      requisitionLineId: line.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-concurrency",
    };

    await expectOnlyOnePosts((tx) => reserveStock(tx, input));

    expect(await reservations()).toHaveLength(1);
    expect(
      (await movements()).filter((movement) => movement.movementType === "reservation"),
    ).toHaveLength(1);
    expect((await getItemStockDetail(itemId))!.item).toMatchObject({
      usable: "10.000",
      reserved: "4.000",
      available: "6.000",
    });
  });

  it("dispatch: a dispatch line deducts stock once under concurrency", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "4");
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-concurrency",
    });
    const dispatchLineId = await createDispatchLine(custodian, line, "4");

    await expectOnlyOnePosts((tx) => dispatchStock(tx, { dispatchLineId, reservationId }));

    expect(await onHand(itemId)).toBe("6.000");
    expect((await reservations())[0].status).toBe("consumed");
    expect(
      (await movements()).filter((movement) => movement.movementType === "dispatch"),
    ).toHaveLength(1);
    expect((await getItemStockDetail(itemId))!.item.inTransit).toBe("4.000");
  });

  it("requester accepts: one source reference adds the accepted quantity once", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");

    await expectOnlyOnePosts((tx) =>
      acceptDispatchedItems(tx, {
        dispatchLineId,
        quantity: "4",
        sourceRef: "ar-concurrency",
      }),
    );

    const [line] = await db.select().from(dispatchLines);

    expect(line.acceptedQty).toBe("4.000");
    expect((await getItemStockDetail(itemId))!.item.inTransit).toBe("0.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "acceptance"),
    ).toHaveLength(1);
  });

  it("item returned: a return line enters held stock once under concurrency", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");
    const returnLineId = await createReturnLine(custodian, dispatchLineId, "4");

    await expectOnlyOnePosts((tx) => receiveReturnedItems(tx, { returnLineId }));

    expect(await onHand(itemId, "hold")).toBe("4.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "return"),
    ).toHaveLength(1);
  });

  it("return inspected: a return leaves held stock once under concurrency", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");
    const returnLineId = await createReturnLine(custodian, dispatchLineId, "4");

    await receiveReturnedItems(db, { returnLineId });
    await expectOnlyOnePosts((tx) => inspectReturn(tx, { returnLineId, result: "usable" }));

    expect(await onHand(itemId, "usable")).toBe("10.000");
    expect(await onHand(itemId, "hold")).toBe("0.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "return_inspection"),
    ).toHaveLength(2);
  });

  it("approved adjustment: the counted difference applies once under concurrency", async () => {
    const itemId = await createItem("TST-1", "10");
    const [balance] = await db
      .update(stockBalances)
      .set({ isIncomplete: true })
      .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, "usable")))
      .returning();
    const [adjustment] = await db
      .insert(stockAdjustments)
      .values({
        stockBalanceId: balance.stockBalanceId,
        countedBy: custodian,
        recordedQty: "10",
        countedQty: "7.5",
        reason: "Physical count",
        status: "approved",
      })
      .returning();
    const input = { adjustmentId: adjustment.adjustmentId };

    await expectOnlyOnePosts((tx) => applyApprovedAdjustment(tx, input));

    expect(await onHand(itemId)).toBe("7.500");
    expect(await isIncomplete(itemId)).toBe(false);
    expect(
      (await movements()).filter((movement) => movement.movementType === "adjustment"),
    ).toHaveLength(1);
  });

  it("return to supplier: one source reference takes stock out once", async () => {
    const itemId = await createItem("TST-1");
    const lineId = await createSupplierReceiptLine(custodian, itemId, "10", "100.00");

    await acceptSupplierReceipt(db, { supplierReceiptLineId: lineId });
    await expectOnlyOnePosts((tx) =>
      returnToSupplier(tx, {
        supplierReceiptLineId: lineId,
        quantity: "1",
        sourceRef: "rts-concurrency",
      }),
    );

    expect(await onHand(itemId)).toBe("9.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "supplier_return"),
    ).toHaveLength(1);
  });

  it("release reservation: a reservation is released once under concurrency", async () => {
    const itemId = await createItem("TST-1", "10");
    const line = await createRequisitionLine(custodian, itemId, "4");
    const { reservationId } = await reserveStock(db, {
      requisitionLineId: line.requisitionLineId,
      quantity: "4",
      sourceRef: "rf-concurrency",
    });

    await expectOnlyOnePosts(
      (tx) => releaseReservation(tx, { reservationId }),
      "Only an active reservation can be released.",
    );

    expect(await onHand(itemId)).toBe("10.000");
    expect((await reservations())[0].status).toBe("released");
    expect(
      (await movements()).filter((movement) => movement.movementType === "reservation_release"),
    ).toHaveLength(1);
  });

  it("sales reversal: a deduction is reversed once under concurrency", async () => {
    const itemId = await createItem("TST-1", "10");
    const { movementId } = await deductSales(db, {
      itemId,
      quantity: "3",
      salesRef: "SI-CONCURRENCY",
      saleDate: "2026-11-10",
      entryDate: "2026-11-10",
    });

    await expectOnlyOnePosts(
      (tx) => reverseSalesDeduction(tx, { movementId }),
      "This sales deduction has already been reversed.",
    );

    expect(await onHand(itemId)).toBe("10.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "sales_reversal"),
    ).toHaveLength(1);
  });

  it("sales deduction: two different sales lines post without a lost update", async () => {
    const itemId = await createItem("TST-1", "10");
    const sales = [
      {
        itemId,
        quantity: "4",
        salesRef: "SI-CONCURRENCY-A",
        saleDate: "2026-11-10",
        entryDate: "2026-11-10",
      },
      {
        itemId,
        quantity: "5",
        salesRef: "SI-CONCURRENCY-B",
        saleDate: "2026-11-10",
        entryDate: "2026-11-10",
      },
    ];

    await Promise.all(
      sales.map((sale) => db.transaction((tx) => deductSales(tx, sale))),
    );

    expect(await onHand(itemId)).toBe("1.000");
    expect(
      (await movements()).filter((movement) => movement.movementType === "sales_deduction"),
    ).toHaveLength(2);
  });

  it("requester accepts: two ARs cannot accept more than what is in transit", async () => {
    const { itemId, dispatchLineId } = await dispatched("4");

    const results = await Promise.allSettled([
      db.transaction((tx) =>
        acceptDispatchedItems(tx, {
          dispatchLineId,
          quantity: "3",
          sourceRef: "ar-concurrency-a",
        }),
      ),
      db.transaction((tx) =>
        acceptDispatchedItems(tx, {
          dispatchLineId,
          quantity: "3",
          sourceRef: "ar-concurrency-b",
        }),
      ),
    ]);
    const posted = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(posted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason.message).toBe("Only 1 is in transit on this line.");

    const [line] = await db.select().from(dispatchLines);

    expect(line.acceptedQty).toBe("3.000");
    expect((await getItemStockDetail(itemId))!.item.inTransit).toBe("1.000");
  });
});
