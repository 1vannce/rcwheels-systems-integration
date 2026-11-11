import type { MyRequisition } from "../types/requisition.type";

const submittedAtFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function statusLabel(status: MyRequisition["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RequisitionTable({
  requisitions,
}: {
  requisitions: MyRequisition[];
}) {
  if (requisitions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        You have not submitted any requests yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Your requisition requests</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Request</th>
            <th scope="col" className="px-4 py-3 font-medium">Requested for</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Delivery</th>
            <th scope="col" className="px-4 py-3 font-medium">Urgency</th>
            <th scope="col" className="px-4 py-3 font-medium">Items</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requisitions.map((requisition) => (
            <tr key={requisition.requisitionId} className="align-top">
              <td className="px-4 py-3">
                <p className="font-medium">RF-{requisition.requisitionId}</p>
                <p className="mt-1 max-w-56 text-muted-foreground">{requisition.purpose}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {submittedAtFormat.format(requisition.submittedAt)}
                </p>
              </td>
              <td className="px-4 py-3">{requisition.requesterName}</td>
              <td className="px-4 py-3 capitalize">{statusLabel(requisition.status)}</td>
              <td className="px-4 py-3">
                <p>{requisition.deliveryDate}</p>
                <p className="mt-1 text-muted-foreground">{requisition.deliveryLocation}</p>
              </td>
              <td className="px-4 py-3">{requisition.isUrgent ? "Urgent" : "Normal"}</td>
              <td className="px-4 py-3">
                <ul className="flex flex-col gap-1">
                  {requisition.lines.map((line) => (
                    <li key={line.requisitionLineId}>
                      {line.itemCode} · {line.requestedQty} {line.unit}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
