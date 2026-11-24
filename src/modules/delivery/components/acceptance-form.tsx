"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { acceptDeliveryAction } from "../actions/internal-delivery.actions";
import type { PendingDelivery } from "../types/delivery.type";
import { formatDateTime } from "../utils/date.util";
import {
  compareQuantities,
  formatQuantity,
  isQuantity,
  subtractQuantities,
} from "../utils/quantity.util";

/** What is still in transit on a line: sent - accepted - returned. */
function deliveredQty(line: PendingDelivery["lines"][number]): string {
  return subtractQuantities(subtractQuantities(line.sentQty, line.acceptedQty), line.returnedQty);
}

/** The rejected remainder, or null when the accepted entry is not valid. */
function rejectedOf(delivered: string, accepted: string): string | null {
  if (!isQuantity(accepted) || compareQuantities(accepted, delivered) > 0) {
    return null;
  }

  return subtractQuantities(delivered, accepted);
}

/**
 * The requester checks each delivered line, enters how many they accept, and
 * signs the acknowledgement receipt. Anything not accepted is reported as
 * rejected with the problem, which starts an RDR.
 */
export function AcceptanceForm({ delivery }: { delivery: PendingDelivery }) {
  const [result, formAction] = useActionState(acceptDeliveryAction, null);
  const [accepted, setAccepted] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      delivery.lines.map((line) => [line.dispatchLineId, formatQuantity(deliveredQty(line))]),
    ),
  );
  const [problems, setProblems] = useState<Record<number, string>>({});

  const rows = delivery.lines.map((line) => {
    const delivered = deliveredQty(line);
    const acceptedQty = accepted[line.dispatchLineId] ?? "";

    return { line, delivered, acceptedQty, rejectedQty: rejectedOf(delivered, acceptedQty) };
  });

  const valid = rows.every((row) => row.rejectedQty !== null);
  const payload = JSON.stringify(
    rows.map((row) => ({
      dispatchLineId: row.line.dispatchLineId,
      acceptedQty: row.acceptedQty,
      rejectedQty: row.rejectedQty ?? "0",
      problem: problems[row.line.dispatchLineId] ?? "",
    })),
  );

  if (result?.ok) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">{delivery.rfNumber}</h2>
        <FormMessage result={result} />
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="dispatchId" value={delivery.dispatchId} />
      <input type="hidden" name="requisitionId" value={delivery.requisitionId} />
      <input type="hidden" name="lines" value={payload} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{delivery.rfNumber}</h2>
        <p className="text-sm text-muted-foreground">
          Brought by {delivery.deliveryPersonnel}, dispatched{" "}
          {formatDateTime(delivery.dispatchedAt)}
        </p>
      </div>

      <div className="flex flex-col divide-y rounded-md border">
        {rows.map(({ line, delivered, acceptedQty, rejectedQty }) => {
          const id = line.dispatchLineId;
          const hasRejected = rejectedQty !== null && compareQuantities(rejectedQty, "0") > 0;

          return (
            <div key={id} className="flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {line.itemCode} {line.itemName}
                  </p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatQuantity(delivered)} {line.unit} delivered
                  </p>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Accepted ({line.unit})</span>
                  <Input
                    inputMode="decimal"
                    className="w-28 tabular-nums"
                    value={acceptedQty}
                    aria-invalid={rejectedQty === null}
                    onChange={(event) =>
                      setAccepted((current) => ({ ...current, [id]: event.target.value.trim() }))
                    }
                  />
                </label>
              </div>
              {rejectedQty === null && (
                <p className="text-sm text-destructive">
                  Enter a number from 0 to {formatQuantity(delivered)}.
                </p>
              )}
              {hasRejected && (
                <label className="flex flex-col gap-1 text-sm">
                  <span>
                    What is wrong with the {formatQuantity(rejectedQty)} {line.unit} you are
                    rejecting?
                  </span>
                  <Input
                    required
                    minLength={3}
                    maxLength={300}
                    value={problems[id] ?? ""}
                    onChange={(event) =>
                      setProblems((current) => ({ ...current, [id]: event.target.value }))
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Signing records your name and the time on the acknowledgement receipt. Rejected items are
        reported to your approver and collected for return.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton disabled={!valid}>Sign acknowledgement receipt</SubmitButton>
      </div>
    </form>
  );
}
