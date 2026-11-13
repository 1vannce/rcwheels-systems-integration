// Public API of the requisition module: services and types only. Other modules
// import from here, never from the repositories, schemas, or components.
//
// Create and update DTOs stay inside the module: actions and services import
// them by direct path from `../schemas/requisition.dto`, the same way client
// components import their own module's files (AGENTS.md).

/**
 * Action Exports
 */
export { approveRequisitionAction } from "./actions/action.approve-requisition";
export { dispatchRequisitionAction } from "./actions/action.dispatch-requisition";
export { prepareAcknowledgementReceiptAction } from "./actions/action.prep-requisition-AR";
export { rejectRequisitionAction } from "./actions/action.reject-requisition";
export { reserveRequisitionAction } from "./actions/action.reserve-requisition";
export { resubmitRequisitionAction } from "./actions/action.resubmit-requisition";
export { submitRequisitionAction } from "./actions/action.submit-requisition";

/**
 * Service Exports
 */
export {
  getNextRequisitionNumberService,
  listActiveMechanicsService,
  listAllRequisitionsService,
  listApprovedForIssueService,
  listCompletedRequisitionsService,
  listMyRequestsService,
  listPendingApprovalsService,
  listRejectedRequisitionsService,
} from "./services/requisition.lists.service";
export { approveRequisitionService } from "./services/requisition.approve.service";
export { 
  dispatchRequisitionService, 
  listReadyForDispatchService 
} from "./services/requisition.dispatch.service";
export { getRequisitionDetailService } from "./services/requisition.get-details.service";
export { 
  prepareAcknowledgementReceiptService, 
  listReadyForArPreparationService 
} from "./services/requisition.prep-AR.service";
export { rejectRequisitionService } from "./services/requisition.reject.service";
export { reserveRequisitionService } from "./services/requisition.reserve.service";
export { resubmitRequisitionService } from "./services/requisition.resubmit.service";
export { submitRequisitionService } from "./services/requisition.submit.service";

/**
 * DTO Exports
 */
export { requisitionStatuses } from "./types/requisition.dto";
export type {
  PendingApprovalItemDto,
  RequisitionDetailDto,
  RequisitionDto,
  RequisitionLineDto,
  RequisitionListItemDto,
  RequisitionMechanicOptionDto,
  RequisitionQueueItemDto,
  RequisitionStatus,
  RequisitionStatusEntryDto,
} from "./types/requisition.dto";
