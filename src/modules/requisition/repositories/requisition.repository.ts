import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  items,
  requisitionLines,
  requisitionStatusHistory,
  requisitions,
} from "@/db/schema";

import type { CreateRequisitionInput } from "../schemas/requisition.schema";
import type { MyRequisition } from "../types/requisition.type";

export async function findExistingItemIds(
  tx: Tx,
  itemIds: readonly number[],
): Promise<number[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const rows = await tx
    .select({ itemId: items.itemId })
    .from(items)
    .where(inArray(items.itemId, [...new Set(itemIds)]));

  return rows.map((row) => row.itemId);
}

export async function insertRequisition(
  tx: Tx,
  requisition: Omit<CreateRequisitionInput, "lines"> & { submittedBy: number },
): Promise<number> {
  const [row] = await tx
    .insert(requisitions)
    .values(requisition)
    .returning({ requisitionId: requisitions.requisitionId });

  return row.requisitionId;
}

export async function insertRequisitionLines(
  tx: Tx,
  requisitionId: number,
  lines: CreateRequisitionInput["lines"],
): Promise<void> {
  await tx.insert(requisitionLines).values(
    lines.map((line) => ({
      requisitionId,
      itemId: line.itemId,
      requestedQty: line.quantity,
    })),
  );
}

export async function insertInitialStatusHistory(
  tx: Tx,
  input: { requisitionId: number; changedBy: number },
): Promise<void> {
  await tx.insert(requisitionStatusHistory).values({
    requisitionId: input.requisitionId,
    changedBy: input.changedBy,
    fromStatus: null,
    toStatus: "pending_approval",
  });
}

export async function findMyRequisitions(
  tx: Tx,
  requesterId: number,
): Promise<MyRequisition[]> {
  const rows = await tx
    .select({
      requisitionId: requisitions.requisitionId,
      requesterName: requisitions.requesterName,
      purpose: requisitions.purpose,
      deliveryDate: requisitions.deliveryDate,
      deliveryLocation: requisitions.deliveryLocation,
      isUrgent: requisitions.isUrgent,
      status: requisitions.status,
      submittedAt: requisitions.submittedAt,
      requisitionLineId: requisitionLines.requisitionLineId,
      requestedQty: requisitionLines.requestedQty,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
    })
    .from(requisitions)
    .leftJoin(
      requisitionLines,
      eq(requisitionLines.requisitionId, requisitions.requisitionId),
    )
    .leftJoin(items, eq(items.itemId, requisitionLines.itemId))
    .where(eq(requisitions.submittedBy, requesterId))
    .orderBy(desc(requisitions.submittedAt), desc(requisitions.requisitionId));

  const byId = new Map<number, MyRequisition>();

  for (const row of rows) {
    let requisition = byId.get(row.requisitionId);

    if (!requisition) {
      requisition = {
        requisitionId: row.requisitionId,
        requesterName: row.requesterName,
        purpose: row.purpose,
        deliveryDate: row.deliveryDate,
        deliveryLocation: row.deliveryLocation,
        isUrgent: row.isUrgent,
        status: row.status,
        submittedAt: row.submittedAt,
        lines: [],
      };
      byId.set(row.requisitionId, requisition);
    }

    if (
      row.requisitionLineId !== null &&
      row.requestedQty !== null &&
      row.itemCode !== null &&
      row.itemName !== null &&
      row.unit !== null
    ) {
      requisition.lines.push({
        requisitionLineId: row.requisitionLineId,
        requestedQty: row.requestedQty,
        itemCode: row.itemCode,
        itemName: row.itemName,
        unit: row.unit,
      });
    }
  }

  return [...byId.values()];
}
