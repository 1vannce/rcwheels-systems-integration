import "server-only";

import { db } from "@/db";

import { findSuppliers } from "../repositories/supplier.repository";
import type { SupplierDto } from "../types/purchasing.dto";

/** Suppliers available to the Purchasing Staff when preparing a PO. */
export async function listSuppliersService(): Promise<SupplierDto[]> {
  return findSuppliers(db);
}
