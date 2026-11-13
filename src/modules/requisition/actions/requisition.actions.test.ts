import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  dispatches,
  requisitionLines,
  requisitions,
  roles,
  stockReservations,
  users,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import { todayInManila } from "@/modules/inventory";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, onHand } from "@/test/stock-fixtures";

import { approveRequisitionService as approveRequisition } from "../services/requisition.approve.service";
import { prepareAcknowledgementReceiptService as prepareAcknowledgementReceipt } from "../services/requisition.prep-AR.service";
import { reserveRequisitionService as reserveRequisition } from "../services/requisition.reserve.service";
import { submitRequisitionService as submitRequisition } from "../services/requisition.submit.service";
import { dispatchRequisitionAction } from "./action.dispatch-requisition";
import { prepareAcknowledgementReceiptAction } from "./action.prep-requisition-AR";
import { reserveRequisitionAction } from "./action.reserve-requisition";

// Scenario 12 (PLAN.md section 9): the server blocks and records another role
// calling the custodian's actions. Only the Next.js request APIs are faked:
// revalidatePath, connection(), and the cookie-backed Supabase client that
// yields the signed-in auth ID. requireRole still looks the user and role up
// in the real test database, and the services run against it unchanged.

const session = vi.hoisted(() => ({ authUserId: null as string | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/lib/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: session.authUserId ? { claims: { sub: session.authUserId } } : null,
      }),
    },
  }),
}));

describeWithDatabase("requisition actions role blocks (scenario 12)", () => {
  let people: Record<AppRole, AppUser>;
  let mechanic: AppUser;
  let itemId: number;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    await db
      .update(users)
      .set({ approverId: people.requisition_approver.userId })
      .where(eq(users.userId, people.requester.userId));
    people.requester = { ...people.requester, approverId: people.requisition_approver.userId };
    mechanic = await createMechanic();
    itemId = await createItem("ROLE-1", "100");
    session.authUserId = null;
  });

  afterAll(closeDatabase);

  async function createMechanic(): Promise<AppUser> {
    const [requesterRole] = await db
      .select({ roleId: roles.roleId })
      .from(roles)
      .where(eq(roles.roleName, "requester"));
    const [row] = await db
      .insert(users)
      .values({
        authUserId: crypto.randomUUID(),
        email: "mechanic@rcwheels.test",
        fullName: "Test Mechanic",
        roleId: requesterRole.roleId,
        approverId: people.requisition_approver.userId,
        isMechanic: true,
      })
      .returning();

    return {
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: "requester",
      approverId: row.approverId,
    };
  }

  async function signInAs(user: AppUser) {
    const [row] = await db
      .select({ authUserId: users.authUserId })
      .from(users)
      .where(eq(users.userId, user.userId));

    session.authUserId = row.authUserId;
  }

  function form(fields: Record<string, unknown>): FormData {
    const data = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      data.set(name, typeof value === "string" ? value : JSON.stringify(value));
    }

    return data;
  }

  async function approvedRequest() {
    const { requisitionId } = await submitRequisition(people.requester, {
      purpose: "Role block test",
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
      isUrgent: false,
      lines: [{ itemId, requestedQty: "10" }],
    });
    const [line] = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    await approveRequisition(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "10" }],
    });

    return { requisitionId, requisitionLineId: line.requisitionLineId };
  }

  async function reservedRequest() {
    const request = await approvedRequest();

    await reserveRequisition(people.inventory_custodian, {
      requisitionId: request.requisitionId,
      lines: [{ requisitionLineId: request.requisitionLineId, quantity: "10" }],
    });

    return request;
  }

  async function preparedRequest() {
    const request = await reservedRequest();

    await prepareAcknowledgementReceipt(people.inventory_custodian, {
      requisitionId: request.requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId: request.requisitionLineId, sentQty: "10" }],
    });

    return request;
  }

  async function snapshot(requisitionId: number) {
    const [header] = await db
      .select({ status: requisitions.status })
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));

    return {
      status: header.status,
      onHand: await onHand(itemId),
      reservations: (await db.select().from(stockReservations)).length,
      dispatches: (await db.select({ status: dispatches.status }).from(dispatches)).map(
        (row) => row.status,
      ),
    };
  }

  async function blockedEntries(action: string) {
    return db.select().from(auditLog).where(eq(auditLog.action, `blocked:${action}`));
  }

  const blockedRoles = [
    ["requester", () => people.requester],
    ["mechanic", () => mechanic],
    ["requisition approver", () => people.requisition_approver],
  ] as const;

  const actions = [
    {
      name: "reserve",
      audit: "requisition.reserve",
      setUp: approvedRequest,
      call: ({ requisitionId, requisitionLineId }: { requisitionId: number; requisitionLineId: number }) =>
        reserveRequisitionAction(
          null,
          form({
            requisitionId: String(requisitionId),
            lines: [{ requisitionLineId, quantity: "10" }],
          }),
        ),
    },
    {
      name: "prepare AR",
      audit: "requisition.prepare-ar",
      setUp: reservedRequest,
      call: ({ requisitionId, requisitionLineId }: { requisitionId: number; requisitionLineId: number }) =>
        prepareAcknowledgementReceiptAction(
          null,
          form({
            requisitionId: String(requisitionId),
            deliveryPersonnel: "Test Driver",
            lines: [{ requisitionLineId, sentQty: "10" }],
          }),
        ),
    },
    {
      name: "dispatch",
      audit: "requisition.dispatch",
      setUp: preparedRequest,
      call: ({ requisitionId }: { requisitionId: number }) =>
        dispatchRequisitionAction(null, form({ requisitionId: String(requisitionId) })),
    },
  ] as const;

  for (const action of actions) {
    for (const [label, actor] of blockedRoles) {
      it(`blocks the ${action.name} action for a ${label} and records it`, async () => {
        const request = await action.setUp();
        const before = await snapshot(request.requisitionId);
        const user = actor();

        await signInAs(user);
        const result = await action.call(request);

        expect(result.ok).toBe(false);
        expect(await snapshot(request.requisitionId)).toEqual(before);

        const entries = await blockedEntries(action.audit);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          actorUserId: user.userId,
          entityType: "users",
          entityId: user.userId,
        });
        expect(JSON.parse(entries[0].changeDetails ?? "{}")).toMatchObject({
          reason: "role not allowed",
          role: user.role,
        });
      });
    }
  }

  it("lets the inventory custodian reserve, prepare the AR, and dispatch", async () => {
    const { requisitionId, requisitionLineId } = await approvedRequest();

    await signInAs(people.inventory_custodian);

    for (const action of actions) {
      const result = await action.call({ requisitionId, requisitionLineId });

      expect(result).toMatchObject({ ok: true });
    }

    const after = await snapshot(requisitionId);

    expect(after.status).toBe("out_for_delivery");
    expect(after.onHand).toBe("90.000");
    expect(after.dispatches).toEqual(["dispatched"]);

    const blocked = (await db.select().from(auditLog)).filter((row) =>
      row.action.startsWith("blocked:"),
    );

    expect(blocked).toHaveLength(0);
  });
});
