import "server-only";

import {
  BlockedActionError,
  notifyUsers,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { listItemsWithStock, todayInManila } from "@/modules/inventory";

import { db } from "@/db";

import type { CreateRequisitionInput } from "../schemas/requisition.schema";
import {
  findExistingItemIds,
  findMyRequisitions,
  insertInitialStatusHistory,
  insertRequisition,
  insertRequisitionLines,
} from "../repositories/requisition.repository";
import type { RequisitionItemOption } from "../types/requisition.type";

export async function getRequisitionFormData(): Promise<{
  items: RequisitionItemOption[];
  minimumDeliveryDate: string;
}> {
  const items = await listItemsWithStock();

  return {
    items: items.map(({ itemId, itemCode, itemName, specification, unit }) => ({
      itemId,
      itemCode,
      itemName,
      specification,
      unit,
    })),
    minimumDeliveryDate: todayInManila(),
  };
}

export async function listMyRequisitions(actor: AppUser) {
  return findMyRequisitions(db, actor.userId);
}

export async function createRequisition(
  actor: AppUser,
  input: CreateRequisitionInput,
): Promise<{ requisitionId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "requester") {
      throw new BlockedActionError("Only requesters can submit a requisition.", {
        entityType: "requisitions",
        entityId: 0,
        action: "requisition.create",
      });
    }

    if (actor.approverId === null) {
      throw new BlockedActionError("Your account has no assigned approver yet.", {
        entityType: "requisitions",
        entityId: 0,
        action: "requisition.create",
      });
    }

    if (input.deliveryDate < todayInManila()) {
      throw new BlockedActionError("Delivery date cannot be in the past.", {
        entityType: "requisitions",
        entityId: 0,
        action: "requisition.create",
        details: { deliveryDate: input.deliveryDate },
      });
    }

    const requestedItemIds = [...new Set(input.lines.map((line) => line.itemId))];
    const existingItemIds = await findExistingItemIds(tx, requestedItemIds);
    const missingItemIds = requestedItemIds.filter(
      (itemId) => !existingItemIds.includes(itemId),
    );

    if (missingItemIds.length > 0) {
      throw new BlockedActionError("One or more selected items do not exist.", {
        entityType: "requisitions",
        entityId: 0,
        action: "requisition.create",
        details: { missingItemIds },
      });
    }

    const requisitionId = await insertRequisition(tx, {
      submittedBy: actor.userId,
      requesterName: input.requesterName,
      purpose: input.purpose,
      deliveryDate: input.deliveryDate,
      deliveryLocation: input.deliveryLocation,
      isUrgent: input.isUrgent,
    });

    await insertRequisitionLines(tx, requisitionId, input.lines);
    await insertInitialStatusHistory(tx, {
      requisitionId,
      changedBy: actor.userId,
    });
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: requisitionId,
      action: "requisition.create",
      details: {
        requesterName: input.requesterName,
        purpose: input.purpose,
        deliveryDate: input.deliveryDate,
        deliveryLocation: input.deliveryLocation,
        isUrgent: input.isUrgent,
        lines: input.lines,
      },
    });
    await notifyUsers(tx, [actor.approverId], {
      type: "requisition.submitted",
      message: `RF-${requisitionId} submitted by ${actor.fullName} is awaiting your review.`,
      requisitionId,
    });

    return { requisitionId };
  });
}
