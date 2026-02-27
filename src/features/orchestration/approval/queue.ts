import type { ApprovalActionType, ApprovalDecision, ApprovalRequest, ApprovalStatus, GateDecision } from "../types";

type ApprovalQueueSeed = {
  requestId: string;
  taskId: string;
  actionType: ApprovalActionType;
  preview: string;
  status?: ApprovalStatus;
  source?: "remote" | "local";
  metadata?: Record<string, unknown>;
};

type TransitionLike = {
  at: string;
  nodeId: string;
  status: string;
  message?: string;
};

function toKey(taskId: string, actionType: ApprovalActionType, preview: string) {
  return `${taskId}::${actionType}::${preview}`;
}

export function createApprovalQueue(seeds: ApprovalQueueSeed[], nowIso = new Date().toISOString()): ApprovalRequest[] {
  const queue: ApprovalRequest[] = [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    const taskId = String(seed.taskId ?? "").trim();
    const actionType = (seed.actionType ?? "unknown") as ApprovalActionType;
    const preview = String(seed.preview ?? "").trim();
    const requestId = String(seed.requestId ?? "").trim();
    if (!taskId || !preview || !requestId) {
      continue;
    }
    const key = toKey(taskId, actionType, preview);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    queue.push({
      requestId,
      taskId,
      actionType,
      preview,
      status: seed.status ?? "pending",
      createdAt: nowIso,
      source: seed.source ?? "remote",
      metadata: { ...(seed.metadata ?? {}) },
    });
  }

  return queue;
}

export function applyApprovalDecision(
  queue: ApprovalRequest[],
  requestId: string,
  decision: ApprovalDecision,
  nowIso = new Date().toISOString(),
): ApprovalRequest[] {
  const nextStatus: ApprovalStatus =
    decision === "accept" || decision === "acceptForSession"
      ? "approved"
      : decision === "decline"
        ? "declined"
        : "cancelled";

  return queue.map((item) =>
    item.requestId !== requestId
      ? item
      : {
          ...item,
          status: nextStatus,
          updatedAt: nowIso,
        },
  );
}

export function buildApprovalQueueSnapshotFromTransitions(transitions: TransitionLike[]): ApprovalRequest[] {
  const seeds: ApprovalQueueSeed[] = transitions
    .filter((row) => row.status === "waiting_user")
    .map((row) => ({
      requestId: `${row.nodeId}:${row.at}`,
      taskId: row.nodeId,
      actionType: "unknown",
      preview: row.message ?? "approval requested",
      status: "pending",
      source: "remote",
    }));
  return createApprovalQueue(seeds);
}

export function summarizeApprovalGate(queue: ApprovalRequest[], decision: GateDecision) {
  return {
    pending: queue.filter((row) => row.status === "pending").length,
    approved: queue.filter((row) => row.status === "approved").length,
    declined: queue.filter((row) => row.status === "declined").length,
    gate: decision,
  };
}
