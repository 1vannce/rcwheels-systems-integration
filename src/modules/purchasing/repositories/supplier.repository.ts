import "server-only";

import { asc, eq } from "drizzle-orm";

import type { Tx } from "@/db";
import { suppliers } from "@/db/schema";

import type { SupplierDto } from "../types/purchasing.dto";

/** Every supplier in name order, for the purchase-order form. */
export async function findSuppliers(tx: Tx): Promise<SupplierDto[]> {
  return tx
    .select({
      supplierId: suppliers.supplierId,
      supplierName: suppliers.supplierName,
      contactPerson: suppliers.contactPerson,
      contactDetails: suppliers.contactDetails,
      address: suppliers.address,
    })
    .from(suppliers)
    .orderBy(asc(suppliers.supplierName));
}

/** One supplier by ID, or null when it no longer exists. */
export async function findSupplierById(tx: Tx, supplierId: number): Promise<SupplierDto | null> {
  const [row] = await tx
    .select({
      supplierId: suppliers.supplierId,
      supplierName: suppliers.supplierName,
      contactPerson: suppliers.contactPerson,
      contactDetails: suppliers.contactDetails,
      address: suppliers.address,
    })
    .from(suppliers)
    .where(eq(suppliers.supplierId, supplierId));

  return row ?? null;
}
