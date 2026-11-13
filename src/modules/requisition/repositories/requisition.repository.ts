import "server-only";

import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  acknowledgementReceipts,
  dispatches,
  dispatchLines,
  items,
  requisitionLines,
  requisitions,
  requisitionStatusHistory,
  returnLines,
  stockBalances,
  stockReservations,
  users,
} from "@/db/schema";

import type {
  RequisitionDto,
  RequisitionLineDto,
  RequisitionListItemDto,
  RequisitionStatus,
  RequisitionStatusEntryDto,
} from "../types/requisition.dto";

// Drizzle queries for requisitions only. This file holds no business rules and
// calls no other module; every function takes the caller's transaction so it
// commits or rolls back with the rest of the business event.

// Named write shapes keep the insert signatures short and make the values a
// service must resolve explicit. They are server-side only: the browser never
// supplies `submittedBy`, `status`, or the other server-owned fields.

/** A requisition header ready to insert, after the service resolves its owner. */
export type NewRequisition = {
  submittedBy: number;
  requestedForUserId: number | null;
  requesterName: string;
  isUrgent: boolean;
  purpose: string;
  deliveryDate: string;
  deliveryLocation: string;
  status: RequisitionStatus;
};

/** One requested line ready to insert. */
export type NewRequisitionLine = {
  itemId: number;
  requestedQty: string;
};

/** One append-only status change ready to insert. */
export type NewStatusHistory = {
  requisitionId: number;
  changedBy: number;
  fromStatus: RequisitionStatus | null;
  toStatus: RequisitionStatus;
  reason?: string | null;
};

/** The fields a decision reads while it holds the header row lock. */
export type LockedRequisition = {
  requisitionId: number;
  submittedBy: number;
  /** The submitter's assigned approver, checked before a decision. */
  approverId: number | null;
  status: RequisitionStatus;
};

/**
 * Quantity reserved for one line by active reservations. Reservations are the
 * stored source of truth for reserved stock; the line never holds a copy.
 */
const reservedQty = sql<string>`coalesce((
  select sum(${stockReservations.reservedQty})
  from ${stockReservations}
  where ${stockReservations.requisitionLineId} = ${requisitionLines.requisitionLineId}
    and ${stockReservations.status} = 'active'
), 0)::numeric(14, 3)`;

/** Quantity already sent to the requester on this line's dispatch lines. */
const dispatchedQty = sql<string>`coalesce((
  select sum(${dispatchLines.sentQty})
  from ${dispatchLines}
  where ${dispatchLines.requisitionLineId} = ${requisitionLines.requisitionLineId}
), 0)::numeric(14, 3)`;

/** Quantity the requester has accepted from this line's dispatches. */
const acceptedQty = sql<string>`coalesce((
  select sum(${dispatchLines.acceptedQty})
  from ${dispatchLines}
  where ${dispatchLines.requisitionLineId} = ${requisitionLines.requisitionLineId}
), 0)::numeric(14, 3)`;

/** Quantity returned from this line's dispatches. */
const returnedQty = sql<string>`coalesce((
  select sum(${returnLines.returnedQty})
  from ${returnLines}
  inner join ${dispatchLines}
    on ${dispatchLines.dispatchLineId} = ${returnLines.dispatchLineId}
  where ${dispatchLines.requisitionLineId} = ${requisitionLines.requisitionLineId}
), 0)::numeric(14, 3)`;

/** The item's usable on hand minus every active reservation, for this item. */
const availableStock = sql<string>`(
  coalesce((
    select ${stockBalances.quantityOnHand}
    from ${stockBalances}
    where ${stockBalances.itemId} = ${requisitionLines.itemId}
      and ${stockBalances.condition} = 'usable'
  ), 0)
  - coalesce((
    select sum(${stockReservations.reservedQty})
    from ${stockReservations}
    inner join ${stockBalances}
      on ${stockBalances.stockBalanceId} = ${stockReservations.stockBalanceId}
    where ${stockBalances.itemId} = ${requisitionLines.itemId}
      and ${stockReservations.status} = 'active'
  ), 0)
)::numeric(14, 3)`;

/** approved - cancelled - accepted - returned, the quantity still owed. */
const outstandingQty = sql<string>`(
  ${requisitionLines.approvedQty}
  - ${requisitionLines.cancelledQty}
  - ${acceptedQty}
  - ${returnedQty}
)::numeric(14, 3)`;

/**
 * approved - cancelled - in transit. In transit is dispatched - accepted -
 * returned, so this is the quantity still waiting to be sent (PLAN section 7).
 */
const unissuedQty = sql<string>`(
  ${requisitionLines.approvedQty}
  - ${requisitionLines.cancelledQty}
  - ${dispatchedQty}
  + ${returnedQty}
)::numeric(14, 3)`;

/**
 * The unissued quantity not yet reserved: approved - cancelled - dispatched +
 * returned - reserved, never below zero. This is what a custodian may still
 * reserve, and it drops to zero once the line is fully dispatched.
 */
const reservableQty = sql<string>`greatest(
  ${requisitionLines.approvedQty}
  - ${requisitionLines.cancelledQty}
  - ${dispatchedQty}
  + ${returnedQty}
  - ${reservedQty},
  0
)::numeric(14, 3)`;

/** The line columns shared by detail and queue reads. */
const lineColumns = {
  requisitionLineId: requisitionLines.requisitionLineId,
  requisitionId: requisitionLines.requisitionId,
  itemId: requisitionLines.itemId,
  itemCode: items.itemCode,
  itemName: items.itemName,
  unit: items.unit,
  requestedQty: requisitionLines.requestedQty,
  approvedQty: requisitionLines.approvedQty,
  cancelledQty: requisitionLines.cancelledQty,
  reservedQty,
  dispatchedQty,
  acceptedQty,
  returnedQty,
  outstandingQty,
  unissuedQty,
  reservableQty,
  availableStock,
};

/** The header columns shared by detail and list reads. */
const requisitionColumns = {
  requisitionId: requisitions.requisitionId,
  submittedBy: requisitions.submittedBy,
  requestedForUserId: requisitions.requestedForUserId,
  submittedByName: users.fullName,
  approverId: users.approverId,
  requesterName: requisitions.requesterName,
  submittedAt: requisitions.submittedAt,
  isUrgent: requisitions.isUrgent,
  purpose: requisitions.purpose,
  deliveryDate: requisitions.deliveryDate,
  deliveryLocation: requisitions.deliveryLocation,
  status: requisitions.status,
};

/** Filters a requisition list by submitter/recipient, assigned approver, or statuses. */
export type RequisitionFilter = {
  /** Requests submitted by or filed for this user. */
  submitterOrRequesterUserId?: number;
  /** Only requests this user submitted. */
  submittedBy?: number;
  /** Only requests whose submitter has this user as their approver. */
  approverId?: number;
  statuses?: readonly RequisitionStatus[];
};

/** Lists active mechanic accounts that may receive a requisition. */
export async function findActiveMechanics(
  tx: Tx,
): Promise<{ userId: number; fullName: string }[]> {
  return tx
    .select({ userId: users.userId, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.isMechanic, true), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
}

/** Finds one currently valid mechanic recipient. */
export async function findActiveMechanicById(
  tx: Tx,
  userId: number,
): Promise<{ userId: number; fullName: string } | null> {
  const [row] = await tx
    .select({ userId: users.userId, fullName: users.fullName })
    .from(users)
    .where(
      and(
        eq(users.userId, userId),
        eq(users.isMechanic, true),
        eq(users.isActive, true),
      ),
    );

  return row ?? null;
}

/** Inserts a request header and returns its new ID. */
export async function insertRequisition(
  tx: Tx,
  requisition: NewRequisition,
): Promise<number> {
  const [row] = await tx
    .insert(requisitions)
    .values(requisition)
    .returning({ requisitionId: requisitions.requisitionId });

  return row.requisitionId;
}

/** Inserts the requested lines and returns their generated IDs. */
export async function insertRequisitionLines(
  tx: Tx,
  requisitionId: number,
  lines: readonly NewRequisitionLine[],
): Promise<{ requisitionLineId: number; itemId: number }[]> {
  if (lines.length === 0) {
    return [];
  }

  return tx
    .insert(requisitionLines)
    .values(
      lines.map((line) => ({
        requisitionId,
        itemId: line.itemId,
        requestedQty: line.requestedQty,
      })),
    )
    .returning({
      requisitionLineId: requisitionLines.requisitionLineId,
      itemId: requisitionLines.itemId,
    });
}

/**
 * Returns which of the given item IDs exist. The service checks this before
 * inserting, so a stale form shows a clear message instead of a foreign-key
 * error from the database.
 */
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

/**
 * Appends one status change. The history is append-only: earlier decisions are
 * never edited or deleted (PLAN design rules).
 */
export async function insertRequisitionStatusHistory(
  tx: Tx,
  entry: NewStatusHistory,
): Promise<void> {
  await tx.insert(requisitionStatusHistory).values({
    requisitionId: entry.requisitionId,
    changedBy: entry.changedBy,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    reason: entry.reason ?? null,
  });
}

/** Reads one request header with its submitter's name, or null when missing. */
export async function findRequisitionById(
  tx: Tx,
  requisitionId: number,
): Promise<RequisitionDto | null> {
  const [row] = await tx
    .select(requisitionColumns)
    .from(requisitions)
    .innerJoin(users, eq(users.userId, requisitions.submittedBy))
    .where(eq(requisitions.requisitionId, requisitionId));

  return row ?? null;
}

/**
 * Reads a request header and holds a row lock until the transaction ends, so
 * two decisions or corrections cannot both pass their status checks.
 */
export async function lockRequisition(
  tx: Tx,
  requisitionId: number,
): Promise<LockedRequisition | null> {
  const [row] = await tx
    .select({
      requisitionId: requisitions.requisitionId,
      submittedBy: requisitions.submittedBy,
      approverId: users.approverId,
      status: requisitions.status,
    })
    .from(requisitions)
    .innerJoin(users, eq(users.userId, requisitions.submittedBy))
    .where(eq(requisitions.requisitionId, requisitionId))
    .for("update");

  return row ?? null;
}

/** Moves a request to a new header status. The caller audits the change. */
export async function updateRequisitionStatus(
  tx: Tx,
  requisitionId: number,
  status: RequisitionStatus,
): Promise<void> {
  await tx
    .update(requisitions)
    .set({ status })
    .where(eq(requisitions.requisitionId, requisitionId));
}

/**
 * Stores the quantity an approver authorized for one line. The caller locks
 * the header and verifies approved <= requested before calling this, so the
 * approved figure always stays within what was asked for (BR-RQ-05).
 */
export async function updateRequisitionLineApprovedQty(
  tx: Tx,
  requisitionLineId: number,
  approvedQty: string,
): Promise<void> {
  await tx
    .update(requisitionLines)
    .set({ approvedQty })
    .where(eq(requisitionLines.requisitionLineId, requisitionLineId));
}

/**
 * Updates the header fields a resubmit may correct. Status changes go through
 * `updateRequisitionStatus` so every transition is recorded in history.
 */
export async function updateRequisitionHeader(
  tx: Tx,
  requisitionId: number,
  changes: {
    requestedForUserId: number | null;
    requesterName: string;
    isUrgent: boolean;
    purpose: string;
    deliveryDate: string;
    deliveryLocation: string;
  },
): Promise<void> {
  await tx
    .update(requisitions)
    .set(changes)
    .where(eq(requisitions.requisitionId, requisitionId));
}

/**
 * Removes a request's lines. Only safe on a rejected request, which has never
 * been approved and therefore has no reservation, dispatch, or purchase line
 * referring to these rows. Callers replace the lines in the same transaction.
 */
export async function deleteRequisitionLines(tx: Tx, requisitionId: number): Promise<void> {
  await tx.delete(requisitionLines).where(eq(requisitionLines.requisitionId, requisitionId));
}

// Dispatch and acknowledgement receipt (AR) preparation.

/** Inserts a dispatch (or its prepared draft) and returns the new ID. */
export async function insertDispatch(
  tx: Tx,
  dispatch: {
    requisitionId: number;
    dispatchedBy: number;
    deliveryPersonnel: string;
    status: string;
  },
): Promise<number> {
  const [row] = await tx
    .insert(dispatches)
    .values(dispatch)
    .returning({ dispatchId: dispatches.dispatchId });

  return row.dispatchId;
}

/** Inserts the lines of a dispatch and returns their generated IDs. */
export async function insertDispatchLines(
  tx: Tx,
  dispatchId: number,
  lines: readonly { requisitionLineId: number; sentQty: string }[],
): Promise<{ dispatchLineId: number; requisitionLineId: number }[]> {
  if (lines.length === 0) {
    return [];
  }

  return tx
    .insert(dispatchLines)
    .values(
      lines.map((line) => ({
        dispatchId,
        requisitionLineId: line.requisitionLineId,
        sentQty: line.sentQty,
      })),
    )
    .returning({
      dispatchLineId: dispatchLines.dispatchLineId,
      requisitionLineId: dispatchLines.requisitionLineId,
    });
}

/** Inserts the prepared acceptance receipt for a dispatch. */
export async function insertAcknowledgementReceipt(
  tx: Tx,
  receipt: { dispatchId: number; preparedBy: number },
): Promise<number> {
  const [row] = await tx
    .insert(acknowledgementReceipts)
    .values(receipt)
    .returning({
      acknowledgementReceiptId: acknowledgementReceipts.acknowledgementReceiptId,
    });

  return row.acknowledgementReceiptId;
}

/** The dispatch already created for a request, optionally matching a status (newest first). */
export async function findDispatchByRequisition(
  tx: Tx,
  requisitionId: number,
  status?: string,
): Promise<{ dispatchId: number; status: string } | null> {
  const conditions = [eq(dispatches.requisitionId, requisitionId)];
  if (status) {
    conditions.push(eq(dispatches.status, status));
  }
  const [row] = await tx
    .select({ dispatchId: dispatches.dispatchId, status: dispatches.status })
    .from(dispatches)
    .where(and(...conditions))
    .orderBy(desc(dispatches.dispatchId));

  return row ?? null;
}

/** The lines of one dispatch, in creation order. */
export async function findDispatchLines(
  tx: Tx,
  dispatchId: number,
): Promise<{ dispatchLineId: number; requisitionLineId: number; sentQty: string }[]> {
  return tx
    .select({
      dispatchLineId: dispatchLines.dispatchLineId,
      requisitionLineId: dispatchLines.requisitionLineId,
      sentQty: dispatchLines.sentQty,
    })
    .from(dispatchLines)
    .where(eq(dispatchLines.dispatchId, dispatchId))
    .orderBy(asc(dispatchLines.dispatchLineId));
}

/**
 * The active reservation for one line with the largest quantity, so a dispatch
 * can consume it. A line with several split reservations is refused by the
 * service when none is large enough.
 */
export async function findActiveReservationForLine(
  tx: Tx,
  requisitionLineId: number,
): Promise<{ reservationId: number; reservedQty: string } | null> {
  const [row] = await tx
    .select({
      reservationId: stockReservations.reservationId,
      reservedQty: stockReservations.reservedQty,
    })
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.requisitionLineId, requisitionLineId),
        eq(stockReservations.status, "active"),
      ),
    )
    .orderBy(desc(stockReservations.reservedQty))
    .limit(1);

  return row ?? null;
}

/** Moves a dispatch from prepared to dispatched (or another text status). */
export async function updateDispatchStatus(
  tx: Tx,
  dispatchId: number,
  status: string,
): Promise<void> {
  await tx.update(dispatches).set({ status }).where(eq(dispatches.dispatchId, dispatchId));
}

/**
 * Approved requests that have reserved stock and no dispatch yet: the work
 * waiting on the AR preparation screen.
 */
export async function findRequisitionsReadyForAr(
  tx: Tx,
  limit: number,
): Promise<RequisitionListItemDto[]> {
  return tx
    .select({
      ...requisitionColumns,
      lineCount: sql<number>`(
        select count(*)::int
        from ${requisitionLines}
        where ${requisitionLines.requisitionId} = ${requisitions.requisitionId}
      )`,
    })
    .from(requisitions)
    .innerJoin(users, eq(users.userId, requisitions.submittedBy))
    .where(
      and(
        inArray(requisitions.status, ["approved", "awaiting_stock"]),
        sql`exists (
          select 1
          from ${stockReservations}
          inner join ${requisitionLines}
            on ${requisitionLines.requisitionLineId} = ${stockReservations.requisitionLineId}
          where ${requisitionLines.requisitionId} = ${requisitions.requisitionId}
            and ${stockReservations.status} = 'active'
        )`,
        sql`not exists (
          select 1 from ${dispatches}
          where ${dispatches.requisitionId} = ${requisitions.requisitionId}
            and ${dispatches.status} = 'prepared'
        )`,
      ),
    )
    .orderBy(desc(requisitions.isUrgent), desc(requisitions.submittedAt))
    .limit(limit);
}

/** Every line of one request, in submission order, with derived quantities. */
export async function findRequisitionLines(
  tx: Tx,
  requisitionId: number,
): Promise<RequisitionLineDto[]> {
  return tx
    .select(lineColumns)
    .from(requisitionLines)
    .innerJoin(items, eq(items.itemId, requisitionLines.itemId))
    .where(eq(requisitionLines.requisitionId, requisitionId))
    .orderBy(asc(requisitionLines.requisitionLineId));
}

/**
 * Lines for several requests in one query, so a queue screen does not run one
 * read per request.
 */
export async function findRequisitionLinesFor(
  tx: Tx,
  requisitionIds: readonly number[],
): Promise<RequisitionLineDto[]> {
  if (requisitionIds.length === 0) {
    return [];
  }

  return tx
    .select(lineColumns)
    .from(requisitionLines)
    .innerJoin(items, eq(items.itemId, requisitionLines.itemId))
    .where(inArray(requisitionLines.requisitionId, [...requisitionIds]))
    .orderBy(asc(requisitionLines.requisitionLineId));
}

/** The append-only history of one request, oldest first. */
export async function findRequisitionHistory(
  tx: Tx,
  requisitionId: number,
): Promise<RequisitionStatusEntryDto[]> {
  return tx
    .select({
      historyId: requisitionStatusHistory.historyId,
      requisitionId: requisitionStatusHistory.requisitionId,
      changedBy: requisitionStatusHistory.changedBy,
      changedByName: users.fullName,
      fromStatus: requisitionStatusHistory.fromStatus,
      toStatus: requisitionStatusHistory.toStatus,
      reason: requisitionStatusHistory.reason,
      changedAt: requisitionStatusHistory.changedAt,
    })
    .from(requisitionStatusHistory)
    .innerJoin(users, eq(users.userId, requisitionStatusHistory.changedBy))
    .where(eq(requisitionStatusHistory.requisitionId, requisitionId))
    .orderBy(asc(requisitionStatusHistory.historyId));
}

/**
 * Lists requests matching a filter, urgent first and then newest first. The
 * line count is read in the same query, so list screens need no second call.
 */
export async function findRequisitions(
  tx: Tx,
  filter: RequisitionFilter,
  limit: number,
): Promise<RequisitionListItemDto[]> {
  const conditions: SQL[] = [];

  if (filter.submitterOrRequesterUserId !== undefined) {
    const owner = or(
      eq(requisitions.submittedBy, filter.submitterOrRequesterUserId),
      eq(requisitions.requestedForUserId, filter.submitterOrRequesterUserId),
    );

    if (owner) {
      conditions.push(owner);
    }
  }

  if (filter.submittedBy !== undefined) {
    conditions.push(eq(requisitions.submittedBy, filter.submittedBy));
  }

  if (filter.approverId !== undefined) {
    conditions.push(eq(users.approverId, filter.approverId));
  }

  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(requisitions.status, [...filter.statuses]));
  }

  return tx
    .select({
      ...requisitionColumns,
      lineCount: sql<number>`(
        select count(*)::int
        from ${requisitionLines}
        where ${requisitionLines.requisitionId} = ${requisitions.requisitionId}
      )`,
    })
    .from(requisitions)
    .innerJoin(users, eq(users.userId, requisitions.submittedBy))
    .where(and(...conditions))
    .orderBy(desc(requisitions.isUrgent), desc(requisitions.submittedAt))
    .limit(limit);
}
