import { describe, expect, it } from "vitest";

import { parseRequisitionFormData } from "./requisition.schema";

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("requesterName", "Dante Abellana");
  formData.set("purpose", "Replace worn tires");
  formData.set("deliveryDate", "2099-04-15");
  formData.set("deliveryLocation", "Workshop bay 2");
  formData.set("isUrgent", "on");
  formData.set("itemId_0", "1");
  formData.set("quantity_0", "2.5");

  return formData;
}

describe("requisition form validation", () => {
  it("accepts multiple item lines and urgency", () => {
    const formData = validFormData();
    formData.set("itemId_1", "2");
    formData.set("quantity_1", "1");

    const result = parseRequisitionFormData(formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        requesterName: "Dante Abellana",
        deliveryDate: "2099-04-15",
        deliveryLocation: "Workshop bay 2",
        isUrgent: true,
        lines: [
          { itemId: 1, quantity: "2.5" },
          { itemId: 2, quantity: "1" },
        ],
      });
    }
  });

  it("rejects missing details, invalid dates, and non-positive or over-precision quantities", () => {
    const formData = validFormData();
    formData.set("deliveryDate", "2099-02-30");
    formData.set("quantity_0", "0");

    expect(parseRequisitionFormData(formData).success).toBe(false);

    const invalidPrecision = validFormData();
    invalidPrecision.set("quantity_0", "1.0001");
    expect(parseRequisitionFormData(invalidPrecision).success).toBe(false);

    const missingLine = validFormData();
    missingLine.set("itemId_0", "");
    missingLine.set("quantity_0", "");
    expect(parseRequisitionFormData(missingLine).success).toBe(false);

    const missingDeliveryLocation = validFormData();
    missingDeliveryLocation.set("deliveryLocation", "   ");
    expect(parseRequisitionFormData(missingDeliveryLocation).success).toBe(false);

    const missingPurpose = validFormData();
    missingPurpose.set("purpose", "");
    expect(parseRequisitionFormData(missingPurpose).success).toBe(false);
  });

  it("ignores browser-supplied requester IDs, roles, and statuses", () => {
    const formData = validFormData();
    formData.set("submittedBy", "9876");
    formData.set("requesterId", "9876");
    formData.set("role", "system_administrator");
    formData.set("status", "approved");

    const result = parseRequisitionFormData(formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("submittedBy");
      expect(result.data).not.toHaveProperty("requesterId");
      expect(result.data).not.toHaveProperty("role");
      expect(result.data).not.toHaveProperty("status");
    }
  });
});
