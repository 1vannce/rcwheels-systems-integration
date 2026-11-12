import { describe, expect, it } from "vitest";

import {
  ApproveRequisitionDto,
  CreateRequisitionDto,
  PrepareAcknowledgementReceiptDto,
  RejectRequisitionDto,
  ReserveRequisitionDto,
  ResubmitRequisitionDto,
} from "./requisition.dto";

const delivery = { deliveryDate: "2099-04-15", deliveryLocation: "Workshop bay 2" };

// These tests need no database, so they run in CI. They lock in the
// user-facing messages and the input rules the actions rely on (BR-RQ-02/05).

describe("CreateRequisitionDto", () => {
  it("coerces the item id and reads urgency from a checkbox", () => {
    const parsed = CreateRequisitionDto.parse({
      ...delivery,
      purpose: "Replace tires",
      isUrgent: "on",
      lines: [{ itemId: "3", requestedQty: "2.5" }],
    });

    expect(parsed.isUrgent).toBe(true);
    expect(parsed.lines).toEqual([{ itemId: 3, requestedQty: "2.5" }]);
  });

  it("accepts an optional mechanic id and strips browser-supplied identity and status", () => {
    const parsed = CreateRequisitionDto.parse({
      ...delivery,
      purpose: "For a mechanic",
      requestedForUserId: "7",
      submittedBy: 99,
      role: "system_administrator",
      status: "approved",
      requesterName: "Unverified name",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });

    expect(parsed.requestedForUserId).toBe(7);
    expect(parsed).not.toHaveProperty("submittedBy");
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("requesterName");
  });

  it("treats a blank mechanic selection as a request for the signed-in user", () => {
    const parsed = CreateRequisitionDto.parse({
      ...delivery,
      purpose: "For me",
      requestedForUserId: "",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });

    expect(parsed.requestedForUserId).toBeUndefined();
  });

  it("rejects a malformed mechanic account id", () => {
    const parsed = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "For a mechanic",
      requestedForUserId: "not-an-id",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires a purpose and a valid positive item id", () => {
    const missingPurpose = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "   ",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });
    const invalidItemId = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "Select a valid item",
      lines: [{ itemId: "0", requestedQty: "1" }],
    });

    expect(missingPurpose.success).toBe(false);
    expect(invalidItemId.success).toBe(false);
  });

  it("requires at least one line", () => {
    const result = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "Nothing",
      lines: [],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe("Add at least one item.");
  });

  it("refuses the same item twice", () => {
    const result = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "Duplicate",
      lines: [
        { itemId: 1, requestedQty: "1" },
        { itemId: 1, requestedQty: "2" },
      ],
    });

    expect(result.success ? null : result.error.issues[0].message).toContain("once");
  });

  it("refuses a zero quantity", () => {
    const result = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "Zero",
      lines: [{ itemId: 1, requestedQty: "0" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter a quantity above zero.",
    );
  });

  it("refuses more than three decimal places", () => {
    const result = CreateRequisitionDto.safeParse({
      ...delivery,
      purpose: "Precise",
      lines: [{ itemId: 1, requestedQty: "1.2345" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter a number with up to 3 decimal places.",
    );
  });

  it("requires a valid delivery date and a non-empty location", () => {
    const result = CreateRequisitionDto.safeParse({
      ...delivery,
      deliveryDate: "2099-02-30",
      deliveryLocation: "   ",
      purpose: "Replace tires",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("ApproveRequisitionDto", () => {
  it("carries a per-line approved quantity", () => {
    const parsed = ApproveRequisitionDto.parse({
      requisitionId: "4",
      lines: [{ requisitionLineId: "9", approvedQty: "3.5" }],
    });

    expect(parsed).toEqual({
      requisitionId: 4,
      lines: [{ requisitionLineId: 9, approvedQty: "3.5" }],
    });
  });

  it("requires at least one approved line", () => {
    const result = ApproveRequisitionDto.safeParse({ requisitionId: 4, lines: [] });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Approve at least one line.",
    );
  });
});

describe("RejectRequisitionDto", () => {
  it("requires a reason", () => {
    expect(RejectRequisitionDto.safeParse({ requisitionId: 4 }).success).toBe(false);
  });
});

describe("ResubmitRequisitionDto", () => {
  it("needs the request id and the corrected lines", () => {
    expect(
      ResubmitRequisitionDto.safeParse({
        ...delivery,
        requisitionId: "4",
        purpose: "Fixed",
        lines: [{ itemId: 1, requestedQty: "1" }],
      }).success,
    ).toBe(true);

    expect(
      ResubmitRequisitionDto.safeParse({
        ...delivery,
        purpose: "Fixed",
        lines: [{ itemId: 1, requestedQty: "1" }],
      }).success,
    ).toBe(false);
  });
});

describe("ReserveRequisitionDto", () => {
  it("refuses a non-positive reserve quantity", () => {
    const result = ReserveRequisitionDto.safeParse({
      requisitionId: 4,
      lines: [{ requisitionLineId: 2, quantity: "0" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter a quantity above zero.",
    );
  });
});

describe("PrepareAcknowledgementReceiptDto", () => {
  it("requires a delivery person", () => {
    const result = PrepareAcknowledgementReceiptDto.safeParse({
      requisitionId: 4,
      deliveryPersonnel: "  ",
      lines: [{ requisitionLineId: 2, sentQty: "1" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter the delivery person's name.",
    );
  });
});
