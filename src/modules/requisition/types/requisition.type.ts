import type { requisitionStatusEnum } from "@/db/schema";

export type RequisitionStatus = (typeof requisitionStatusEnum.enumValues)[number];

export type RequisitionItemOption = {
  itemId: number;
  itemCode: string;
  itemName: string;
  specification: string;
  unit: string;
};

export type RequisitionLineSummary = {
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: string;
};

export type MyRequisition = {
  requisitionId: number;
  requesterName: string;
  purpose: string;
  deliveryDate: string;
  deliveryLocation: string;
  isUrgent: boolean;
  status: RequisitionStatus;
  submittedAt: Date;
  lines: RequisitionLineSummary[];
};
