import { describe, expect, it } from "vitest";

import { ReceiveSupplierDeliverySchema } from "../schemas/delivery.schema";
import {
  emptyReceivingLine,
  isBlankReceivingLine,
  receivingLineError,
  toReceivingPayloadLine,
  type ReceivingLineDraft,
} from "./receiving-lines";

function draft(values: Partial<ReceivingLineDraft>): ReceivingLineDraft {
  return { ...emptyReceivingLine, ...values };
}

describe("receive form lines", () => {
  it("treats only an untouched line as not delivered", () => {
    expect(isBlankReceivingLine(emptyReceivingLine)).toBe(true);
    expect(isBlankReceivingLine(draft({ acceptedQty: "1" }))).toBe(false);
  });

  it.each([
    [{ deliveredQty: "10", acceptedQty: "10" }, null],
    [{ deliveredQty: "10", acceptedQty: "6", rejectedQty: "4", inspectionNotes: "Torn" }, null],
    [{ deliveredQty: "2.5", acceptedQty: "2.25", rejectedQty: "0.250", inspectionNotes: "Torn" }, null],
    [{ acceptedQty: "1" }, "above zero"],
    [{ deliveredQty: "0", acceptedQty: "0" }, "above zero"],
    [{ deliveredQty: "11", acceptedQty: "11" }, "Only 10 is outstanding"],
    [{ deliveredQty: "5" }, "accepted and rejected"],
    [{ deliveredQty: "5", acceptedQty: "-1", rejectedQty: "6" }, "accepted and rejected"],
    [{ deliveredQty: "5", acceptedQty: "3", rejectedQty: "1" }, "must equal"],
    [{ deliveredQty: "5", acceptedQty: "6" }, "must equal"],
    [{ deliveredQty: "5", acceptedQty: "3", rejectedQty: "2" }, "Describe the problem"],
  ])("checks %o against 10 outstanding", (values, message) => {
    const error = receivingLineError(draft(values), "10.000");

    if (message === null) {
      expect(error).toBeNull();
    } else {
      expect(error).toContain(message);
    }
  });

  it("builds a line the action schema accepts, with a blank rejected quantity as 0", () => {
    const line = toReceivingPayloadLine(7, draft({ deliveredQty: " 6 ", acceptedQty: "6" }));
    const parsed = ReceiveSupplierDeliverySchema.safeParse({
      purchaseOrderId: 1,
      deliveryReceiptNo: "DR-1",
      lines: [line],
    });

    expect(line).toMatchObject({ deliveredQty: "6", rejectedQty: "0" });
    expect(parsed.success).toBe(true);
  });
});
