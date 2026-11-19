import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { closeDatabase, describeWithDatabase, resetDatabase } from "@/test/db";

import { listSuppliersService } from "./supplier.service";

describeWithDatabase("supplier service", () => {
  beforeEach(resetDatabase);

  afterAll(closeDatabase);

  it("lists suppliers in name order with their contact details", async () => {
    await db.insert(suppliers).values([
      {
        supplierName: "Zeta Tire Supply",
        contactPerson: "Zoe Santos",
        contactDetails: "zoe@zeta.test",
        address: "Cebu City",
      },
      {
        supplierName: "Alpha Wheel Trading",
        contactPerson: null,
        contactDetails: null,
        address: null,
      },
    ]);

    const result = await listSuppliersService();

    expect(result).toEqual([
      {
        supplierId: 2,
        supplierName: "Alpha Wheel Trading",
        contactPerson: null,
        contactDetails: null,
        address: null,
      },
      {
        supplierId: 1,
        supplierName: "Zeta Tire Supply",
        contactPerson: "Zoe Santos",
        contactDetails: "zoe@zeta.test",
        address: "Cebu City",
      },
    ]);
  });

  it("returns an empty list when no suppliers exist", async () => {
    await expect(listSuppliersService()).resolves.toEqual([]);
  });
});
