import { compareQuantities } from "@/modules/inventory";

import type { PurchaseRequestContextDto } from "../types/purchasing.dto";
import { formatPrNumber } from "../utils/pr-number.util";
import { CreatePurchaseRequisitionForm } from "./create-purchase-requisition-form";

/**
 * What the Custodian sees below an awaiting-stock request: the shortage PR
 * form, an existing PR, or the reason no PR can be raised yet.
 */
export function PurchaseRequestPanel({
  requisitionId,
  context,
}: {
  requisitionId: number;
  context: PurchaseRequestContextDto;
}) {
  if (context.lines.length === 0) {
    return null;
  }

  if (context.canCreate) {
    return (
      <CreatePurchaseRequisitionForm requisitionId={requisitionId} lines={context.lines} />
    );
  }

  if (context.openPurchaseRequisition) {
    return (
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Purchase request already raised</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPrNumber(context.openPurchaseRequisition.purchaseRequisitionId)} is open
          with Purchasing for this request.
        </p>
      </section>
    );
  }

  const availableLines = context.lines.filter(
    (line) => compareQuantities(line.availableQty, "0") > 0,
  );

  if (availableLines.length > 0) {
    return (
      <section className="rounded-lg border border-amber-600/25 bg-amber-500/8 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Reserve available stock first</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock is now available for{" "}
          {availableLines.map((line) => line.itemCode).join(", ")}. Reserve it before
          raising a purchase request for the remainder.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">No uncovered shortfall</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every line is already covered by reserved stock or an open purchase order.
      </p>
    </section>
  );
}
