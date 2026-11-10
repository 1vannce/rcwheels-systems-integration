import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { auditLog, notifications, stockAdjustments } from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, isIncomplete, movements, onHand } from "@/test/stock-fixtures";

import {
  approveAdjustment,
  rejectAdjustment,
  requestAdjustment,
} from "./adjustment.service";
import {
  createItem as createItemThroughService,
  listItemsWithStock,
  updateReorderPoint,
} from "./item.service";
import { recordSalesDeduction, reverseSalesDeduction } from "./sales-deduction.service";

// The business events built on the stock service: each one commits its record,
// stock movement, audit entry, and notifications together.
describeWithDatabase("inventory business events", () => {
  let users: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function auditActions() {
    return (await db.select().from(auditLog).orderBy(auditLog.auditId)).map(
      (entry) => entry.action,
    );
  }

  it("creates an item with zero balances and refuses a duplicate code", async () => {
    const input = {
      itemCode: "TIRE-TEST",
      itemName: "Test tire",
      specification: "Test",
      unit: "pc",
      reorderPoint: "5",
    };
    const { itemId } = await createItemThroughService(users.inventory_manager, input);

    await updateReorderPoint(users.inventory_manager, { itemId, reorderPoint: "8" });

    const [item] = await listItemsWithStock();

    expect(item).toMatchObject({
      itemCode: "TIRE-TEST",
      reorderPoint: "8.000",
      usable: "0.000",
      available: "0.000",
    });

    await expect(createItemThroughService(users.inventory_manager, input)).rejects.toThrow(
      "Item code TIRE-TEST is already in use.",
    );
    expect(await auditActions()).toEqual([
      "item.create",
      "item.update-reorder-point",
      "blocked:item.create",
    ]);
  });

  it("changes stock only when a manager approves the count", async () => {
    const itemId = await createItem("TST-1", "10");
    const { adjustmentId } = await requestAdjustment(users.inventory_custodian, {
      itemId,
      condition: "usable",
      countedQty: "8",
      reason: "Two units missing on the shelf",
    });

    expect(await onHand(itemId)).toBe("10.000");

    await approveAdjustment(users.inventory_manager, { adjustmentId });

    expect(await onHand(itemId)).toBe("8.000");

    const [adjustment] = await db.select().from(stockAdjustments);

    expect(adjustment).toMatchObject({
      status: "approved",
      approvedBy: users.inventory_manager.userId,
      recordedQty: "10.000",
      countedQty: "8.000",
    });
    expect((await movements())[0]).toMatchObject({
      movementType: "adjustment",
      quantityDelta: "-2.000",
      adjustmentId,
    });
    expect(await auditActions()).toEqual(["adjustment.request", "adjustment.approve"]);

    const recipients = (await db.select().from(notifications)).map(
      (notification) => notification.recipientUserId,
    );

    // The manager is asked to approve; the custodian is told the outcome.
    expect(recipients).toEqual([
      users.inventory_manager.userId,
      users.inventory_custodian.userId,
    ]);

    await expect(
      approveAdjustment(users.inventory_manager, { adjustmentId }),
    ).rejects.toThrow("Only a pending adjustment can be approved.");
    expect(await onHand(itemId)).toBe("8.000");
  });

  it("does not let the person who counted approve their own count (rule 11)", async () => {
    const itemId = await createItem("TST-1", "10");
    const manager = users.inventory_manager;
    const { adjustmentId } = await requestAdjustment(manager, {
      itemId,
      condition: "usable",
      countedQty: "12",
      reason: "Found two more",
    });

    await expect(approveAdjustment(manager, { adjustmentId })).rejects.toThrow(
      "You cannot approve your own stock count.",
    );

    expect(await onHand(itemId)).toBe("10.000");
    expect(await movements()).toHaveLength(0);
    expect((await db.select().from(stockAdjustments))[0].status).toBe("pending");
    expect(await auditActions()).toEqual(["adjustment.request", "blocked:adjustment.approve"]);
  });

  it("leaves stock alone when a count is rejected, and allows a new count after", async () => {
    const itemId = await createItem("TST-1", "10");
    const count = {
      itemId,
      condition: "usable" as const,
      countedQty: "3",
      reason: "Recount needed",
    };
    const { adjustmentId } = await requestAdjustment(users.inventory_custodian, count);

    await expect(requestAdjustment(users.inventory_custodian, count)).rejects.toThrow(
      "A count for this balance is already waiting for approval.",
    );

    await rejectAdjustment(users.inventory_manager, { adjustmentId, reason: "Count again" });

    expect(await onHand(itemId)).toBe("10.000");
    expect(await movements()).toHaveLength(0);
    await requestAdjustment(users.inventory_custodian, count);
  });

  it("refuses the same sales line twice and a sale over available stock", async () => {
    const itemId = await createItem("TST-1", "5");
    const custodian = users.inventory_custodian;
    const today = new Date("2026-11-10T02:00:00Z");
    const sale = { itemId, quantity: "2", salesRef: "SI-2001", saleDate: "2026-11-10" };

    await recordSalesDeduction(custodian, sale, today);

    await expect(recordSalesDeduction(custodian, sale, today)).rejects.toThrow(
      "This stock event has already been posted.",
    );
    await expect(
      recordSalesDeduction(custodian, { ...sale, salesRef: "SI-2002", quantity: "4" }, today),
    ).rejects.toThrow("Only 3 available.");

    expect(await onHand(itemId)).toBe("3.000");
    expect(await movements()).toHaveLength(1);
    expect(await auditActions()).toEqual([
      "sales-deduction.record",
      "blocked:stock.sales-deduction",
      "blocked:stock.sales-deduction",
    ]);
  });

  it("flags a late sales entry until an approved count verifies the balance", async () => {
    const itemId = await createItem("TST-1", "5");
    const custodian = users.inventory_custodian;

    const { isLate } = await recordSalesDeduction(
      custodian,
      { itemId, quantity: "1", salesRef: "SI-2001", saleDate: "2026-11-07" },
      new Date("2026-11-10T02:00:00Z"),
    );

    expect(isLate).toBe(true);
    expect(await isIncomplete(itemId)).toBe(true);

    const [alert] = await db.select().from(notifications);

    expect(alert).toMatchObject({
      recipientUserId: users.inventory_manager.userId,
      notificationType: "stock.incomplete",
    });

    const { adjustmentId } = await requestAdjustment(custodian, {
      itemId,
      condition: "usable",
      countedQty: "4",
      reason: "Physical verification after late sales entry",
    });

    await approveAdjustment(users.inventory_manager, { adjustmentId });

    expect(await isIncomplete(itemId)).toBe(false);
    expect(await onHand(itemId)).toBe("4.000");
  });

  it("reverses a sales deduction with a linked movement and an audit entry", async () => {
    const itemId = await createItem("TST-1", "5");
    const custodian = users.inventory_custodian;
    const { movementId } = await recordSalesDeduction(
      custodian,
      { itemId, quantity: "2", salesRef: "SI-2001", saleDate: "2026-11-10" },
      new Date("2026-11-10T02:00:00Z"),
    );

    const reversal = await reverseSalesDeduction(custodian, {
      movementId,
      reason: "Wrong item encoded",
    });

    expect(await onHand(itemId)).toBe("5.000");
    expect((await movements())[1]).toMatchObject({
      movementId: reversal.movementId,
      reversesMovementId: movementId,
    });
    expect(await auditActions()).toEqual(["sales-deduction.record", "sales-deduction.reverse"]);
  });
});
