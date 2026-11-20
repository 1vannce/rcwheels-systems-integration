import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PageHeader from "@/components/page-header";
import { requireScreen, requireUser } from "@/modules/core";
import { getPurchaseOrderReviewContextService } from "@/modules/purchasing";
import { PurchaseOrderReviewDetail } from "@/modules/purchasing/components/purchase-order-review-detail";
import { formatPoNumber } from "@/modules/purchasing/utils/po-number.util";

export const metadata: Metadata = { title: "Accounting review" };

export default async function AccountingReviewDetailPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  await requireScreen("purchasing-accounting-review");
  const user = await requireUser();
  const purchaseOrderId = Number((await params).purchaseOrderId);

  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    notFound();
  }

  const context = await getPurchaseOrderReviewContextService(
    user,
    purchaseOrderId,
  );

  if (!context) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={formatPoNumber(context.order.purchaseOrderId)}
        description={`${context.order.supplierName} · prepared by ${context.order.preparedByName}`}
      />
      <Link
        href="/purchasing/accounting-review"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Back to Accounting review
      </Link>
      <PurchaseOrderReviewDetail
        context={context}
        canReview={user.role === "accounting_associate"}
        canCancel={user.role === "accounting_associate"}
      />
    </>
  );
}
