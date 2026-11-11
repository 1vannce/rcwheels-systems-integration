import { describe, expect, it } from "vitest";

import {
  ApproveRequisitionDto,
  CreateRequisitionDto,
  PrepareAcknowledgementReceiptDto,
  RejectRequisitionDto,
  ReserveRequisitionDto,
  ResubmitRequisitionDto,
} from "./requisition.dto";

// These tests need no database, so they run in CI. They lock in the
// user-facing messages and the input rules the actions rely on (BR-RQ-02/05).

describe("CreateRequisitionDto", () => {
  it("coerces the item id and reads urgency from a checkbox", () => {
    const parsed = CreateRequisitionDto.parse({
      purpose: "Replace tires",
      isUrgent: "on",
      lines: [{ itemId: "3", requestedQty: "2.5" }],
    });

    expect(parsed.isUrgent).toBe(true);
    expect(parsed.lines).toEqual([{ itemId: 3, requestedQty: "2.5" }]);
  });

  it("leaves a blank requester name empty so the service uses the submitter", () => {
    const parsed = CreateRequisitionDto.parse({
      purpose: "For a mechanic",
      requesterName: "   ",
      lines: [{ itemId: 1, requestedQty: "1" }],
    });

    expect(parsed.requesterName).toBeFalsy();
  });

  it("requires at least one line", () => {
    const result = CreateRequisitionDto.safeParse({ purpose: "Nothing", lines: [] });

    expect(result.success ? null : result.error.issues[0].message).toBe("Add at least one item.");
  });

  it("refuses the same item twice", () => {
    const result = CreateRequisitionDto.safeParse({
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
      purpose: "Zero",
      lines: [{ itemId: 1, requestedQty: "0" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter a quantity above zero.",
    );
  });

  it("refuses more than three decimal places", () => {
    const result = CreateRequisitionDto.safeParse({
      purpose: "Precise",
      lines: [{ itemId: 1, requestedQty: "1.2345" }],
    });

    expect(result.success ? null : result.error.issues[0].message).toBe(
      "Enter a number with up to 3 decimal places.",
    );
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
        requisitionId: "4",
        purpose: "Fixed",
        lines: [{ itemId: 1, requestedQty: "1" }],
      }).success,
    ).toBe(true);

    expect(
      ResubmitRequisitionDto.safeParse({
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
