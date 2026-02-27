import type { ApprovalActionType, ApprovalRequest, GateDecision } from "../types";

type EvaluateApprovalGateParams = {
  taskId: string;
  actionType: ApprovalActionType;
  preview: string;
  queue: ApprovalRequest[];
};

function normalizePreview(preview: string) {
  return String(preview).replace(/\s+/g, " ").trim();
}

export function evaluateApprovalGate(params: EvaluateApprovalGateParams): GateDecision {
  const taskId = String(params.taskId).trim();
  const actionType = params.actionType;
  const preview = normalizePreview(params.preview);

  const matched = params.queue.find(
    (row) =>
      row.taskId === taskId &&
      row.actionType === actionType &&
      normalizePreview(row.preview) === preview,
  );

  if (!matched) {
    return {
      allowed: false,
      reason: "approval request not found",
    };
  }

  if (matched.status !== "approved") {
    return {
      allowed: false,
      reason: `approval is ${matched.status}`,
      matchedRequestId: matched.requestId,
    };
  }

  return {
    allowed: true,
    reason: "approved",
    matchedRequestId: matched.requestId,
  };
}
