import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { stockBalances, stockReservations } from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, createRequisitionLine } from "@/test/stock-fixtures";

import { calculateItemAvailability, listItemsWithStock } from "./item.service";

describe("item service availability", () => {
  it("subtracts only active reservations from on-hand stock", () => {
    expect(
      calculateItemAvailability("10", [
        { reservedQty: "2.5", status: "active" },
        { reservedQty: "1", status: "released" },
        { reservedQty: "0.5", status: "consumed" },
      ]),
    ).toEqual({ reserved: "2.500", available: "7.500" });
  });
});

describeWithDatabase("item service stock figures", () => {
  let requesterId: number;

  beforeEach(async () => {
    await resetDatabase();
    const users = await createUsersForEveryRole();
    requesterId = users.requester.userId;
  });

  afterAll(closeDatabase);

  it("lists on-hand, active reserved, and available quantities", async () => {
    const itemId = await createItem("TIRE-LIST-TEST", "10");
    const line = await createRequisitionLine(requesterId, itemId, "6");
    const [usableBalance] = await db
      .select({ stockBalanceId: stockBalances.stockBalanceId })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.itemId, itemId),
          eq(stockBalances.condition, "usable"),
        ),
      );

    await db.insert(stockReservations).values([
      {
        requisitionLineId: line.requisitionLineId,
        stockBalanceId: usableBalance.stockBalanceId,
        reservedQty: "2.5",
        status: "active",
      },
      {
        requisitionLineId: line.requisitionLineId,
        stockBalanceId: usableBalance.stockBalanceId,
        reservedQty: "1",
        status: "released",
      },
      {
        requisitionLineId: line.requisitionLineId,
        stockBalanceId: usableBalance.stockBalanceId,
        reservedQty: "0.5",
        status: "consumed",
      },
    ]);

    const item = (await listItemsWithStock()).find((candidate) => candidate.itemId === itemId);

    expect(item).toMatchObject({
      usable: "10.000",
      reserved: "2.500",
      available: "7.500",
    });
  });
});
