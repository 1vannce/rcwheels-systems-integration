import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen, requireUser } from "@/modules/core";
import { listOpenPurchaseOrdersService } from "@/modules/purchasing";
import { OpenPurchaseOrderList } from "@/modules/purchasing/components/open-purchase-order-list";

export const metadata: Metadata = { title: "Open PO follow-up" };

export default async function OpenPurchaseOrdersPage() {
  await requireScreen("purchasing-open-po-follow-up");
  const user = await requireUser();
  const orders = await listOpenPurchaseOrdersService(user);

  return (
    <>
      <PageHeader
        title="Open PO follow-up"
        description="Approved, placed, and partially received purchase orders with their committed and outstanding value. These are PO commitments, not posted accounting entries."
      />
      <OpenPurchaseOrderList orders={orders} />
    </>
  );
}
