import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen, requireUser } from "@/modules/core";
import { listPendingPurchaseOrdersService } from "@/modules/purchasing";
import { AccountingReviewQueue } from "@/modules/purchasing/components/accounting-review-queue";

export const metadata: Metadata = { title: "Accounting review" };

export default async function AccountingReviewPage() {
  await requireScreen("purchasing-accounting-review");
  const user = await requireUser();
  const orders = await listPendingPurchaseOrdersService(user);

  return (
    <>
      <PageHeader
        title="Accounting review"
        description="Approve the exact PO version for the budget, or return it to Purchasing with a reason. Approval does not place the order."
      />
      <AccountingReviewQueue orders={orders} />
    </>
  );
}
