import "server-only";

import { AppUser } from "@/modules/core";
import type { RequisitionDto } from "../../types/requisition.dto";

/**
 * Record-level access: the submitter, the mechanic recipient, the submitter's
 * assigned approver, requisition approvers with department oversight, inventory roles, and admin.
 */
export function canViewRequisitionUtil(
  actor: AppUser, 
  requisition: RequisitionDto,
): boolean {
  return (
    actor.userId === requisition.submittedBy ||
    actor.userId === requisition.requestedForUserId ||
    actor.userId === requisition.approverId ||
    actor.role === "requisition_approver" ||
    actor.role === "inventory_custodian" ||
    actor.role === "inventory_manager" ||
    actor.role === "system_administrator"
  );
}
