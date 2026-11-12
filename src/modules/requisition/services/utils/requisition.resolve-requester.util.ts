import "server-only";

import { InvalidInputError, type AppUser } from "@/modules/core";
import type { Tx } from "@/db";
import { findActiveMechanicById } from "../../repositories/requisition.repository";

/** Resolve the optional recipient to a verified active mechanic account. */
export async function resolveRequesterUtil(
  tx: Tx,
  actor: AppUser,
  requestedForUserId?: number,
): Promise<{ requestedForUserId: number | null; requesterName: string }> {
  if (requestedForUserId === undefined) {
    return { requestedForUserId: null, requesterName: actor.fullName };
  }

  const mechanic = await findActiveMechanicById(tx, requestedForUserId);

  if (!mechanic) {
    throw new InvalidInputError("Select an active mechanic from the list.");
  }

  return { requestedForUserId: mechanic.userId, requesterName: mechanic.fullName };
}
