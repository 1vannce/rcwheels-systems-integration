import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tx } from "@/db";

import { BlockedActionError } from "../types/error.type";

// Unit tests: the database and repository are mocked, so this file never
// opens a connection. Transaction rollback is simulated by letting the
// callback throw, exactly as postgres.js would.
const database = vi.hoisted(() => {
  const transaction = vi.fn();

  return {
    transaction,
    db: { transaction },
  };
});

const auditRepository = vi.hoisted(() => ({
  insertAuditEntry: vi.fn(),
}));

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("../repositories/audit.repository", () => auditRepository);

import { recordAudit, recordBlockedAction, runBusinessEvent } from "./audit.service";

const tx = {} as Tx;

beforeEach(() => {
  vi.clearAllMocks();

  database.transaction.mockImplementation(
    async (callback: (transaction: Tx) => Promise<unknown>) => callback(tx),
  );
});

describe("recordAudit", () => {
  it("forwards the entry and serializes object details", async () => {
    await recordAudit(tx, {
      actorUserId: 3,
      entityType: "items",
      entityId: 7,
      action: "item.create",
      details: { itemCode: "TST-001" },
    });

    expect(auditRepository.insertAuditEntry).toHaveBeenCalledTimes(1);
    expect(auditRepository.insertAuditEntry).toHaveBeenCalledWith(tx, {
      actorUserId: 3,
      entityType: "items",
      entityId: 7,
      action: "item.create",
      changeDetails: JSON.stringify({ itemCode: "TST-001" }),
    });
  });

  it("passes string details through and stores missing details as null", async () => {
    await recordAudit(tx, {
      actorUserId: 3,
      entityType: "items",
      entityId: 7,
      action: "item.update",
      details: "reorder point changed",
    });

    expect(auditRepository.insertAuditEntry).toHaveBeenLastCalledWith(tx, {
      actorUserId: 3,
      entityType: "items",
      entityId: 7,
      action: "item.update",
      changeDetails: "reorder point changed",
    });

    await recordAudit(tx, {
      actorUserId: null,
      entityType: "users",
      entityId: 0,
      action: "login",
    });

    expect(auditRepository.insertAuditEntry).toHaveBeenLastCalledWith(tx, {
      actorUserId: null,
      entityType: "users",
      entityId: 0,
      action: "login",
      changeDetails: null,
    });
  });
});

describe("runBusinessEvent", () => {
  it("runs the event in one transaction and returns its value", async () => {
    const result = await runBusinessEvent(5, async () => "committed");

    expect(result).toBe("committed");
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it("writes the blocked entry outside the transaction and rethrows", async () => {
    await expect(
      runBusinessEvent(4, async () => {
        throw new BlockedActionError("Not enough stock.", {
          entityType: "items",
          entityId: 7,
          action: "stock.reserve",
          details: { requested: "5" },
        });
      }),
    ).rejects.toThrow("Not enough stock.");

    expect(auditRepository.insertAuditEntry).toHaveBeenCalledTimes(1);
    expect(auditRepository.insertAuditEntry).toHaveBeenCalledWith(database.db, {
      actorUserId: 4,
      entityType: "items",
      entityId: 7,
      action: "blocked:stock.reserve",
      changeDetails: JSON.stringify({ reason: "Not enough stock.", requested: "5" }),
    });
  });

  it("writes nothing for an unexpected failure", async () => {
    await expect(
      runBusinessEvent(5, async () => {
        throw new Error("connection lost");
      }),
    ).rejects.toThrow("connection lost");

    expect(auditRepository.insertAuditEntry).not.toHaveBeenCalled();
  });
});

describe("recordBlockedAction", () => {
  it("prefixes the action and merges the reason into the details", async () => {
    await recordBlockedAction({
      actorUserId: null,
      entityType: "users",
      entityId: 0,
      action: "login",
      details: { email: "someone@rcwheels.test" },
    });

    expect(auditRepository.insertAuditEntry).toHaveBeenCalledWith(database.db, {
      actorUserId: null,
      entityType: "users",
      entityId: 0,
      action: "blocked:login",
      changeDetails: JSON.stringify({ email: "someone@rcwheels.test" }),
    });
  });
});
