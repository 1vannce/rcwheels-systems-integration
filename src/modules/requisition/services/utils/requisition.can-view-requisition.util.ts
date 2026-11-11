import "server-only";

import { AppUser } from "@/modules/core";
import type { RequisitionDto } from "../../types/requisition.dto";

/**
 * Record-level access: the submitter, the submitter's assigned approver, the
 * inventory roles that process the request, and the system administrator.
 */
export async function canViewRequisitionUtil(
    actor: AppUser, 
    requisition: RequisitionDto
): Promise<boolean> {
  return (
    actor.userId === requisition.submittedBy ||
    actor.userId === requisition.approverId ||
    actor.role === "inventory_custodian" ||
    actor.role === "inventory_manager" ||
    actor.role === "system_administrator"
  );
}