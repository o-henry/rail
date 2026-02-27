import type { GraphData } from "../../../features/workflow/types";
import {
  buildApprovalQueueSnapshotFromTransitions,
  buildMissionFlowState,
  buildPatchBundle,
  buildTaskGraph,
  buildUnityTaskBundle,
  createRailCompatibleDag,
  normalizeUnifiedInput,
  type ApprovalDecision,
  type ApprovalRequest,
  type GateDecision,
  type MissionFlowState,
  type TaskNode,
} from "../../../features/orchestration";
import { createApprovalQueue } from "../../../features/orchestration/approval/queue";
import { evaluateApprovalGate } from "../../../features/orchestration/approval/gate";
import type { PendingApproval, RunRecord, RunTransition } from "../types";

function toTaskNodes(graph: GraphData): TaskNode[] {
  const incomingByNodeId = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const current = incomingByNodeId.get(edge.to.nodeId) ?? [];
    incomingByNodeId.set(edge.to.nodeId, [...current, edge.from.nodeId]);
  }

  return graph.nodes.map((node) => ({
    id: node.id,
    role: String((node.config as { role?: string }).role ?? node.type),
    title: String((node.config as { agentName?: string }).agentName ?? node.id),
    description: String((node.config as { promptTemplate?: string }).promptTemplate ?? ""),
    dependsOn: incomingByNodeId.get(node.id) ?? [],
    status: "blocked",
    metadata: { nodeType: node.type },
  }));
}

export function buildRailCompatibleDagSnapshot(graph: GraphData) {
  const taskGraph = buildTaskGraph({
    nodes: toTaskNodes(graph),
    coordinatorRole: "coordinator",
  });
  return createRailCompatibleDag({ taskGraph });
}

export function validateUnifiedRunInput(question: string, locale: string) {
  return normalizeUnifiedInput({
    text: question,
    locale,
    metadata: { source: "rail-workflow" },
  });
}

export function buildRunMissionFlow(params: {
  hasDecomposed: boolean;
  pendingApprovals: number;
  hasExecutionStarted: boolean;
  hasExecutionCompleted: boolean;
  hasSummary: boolean;
}): MissionFlowState {
  return buildMissionFlowState(params);
}

export function buildRunApprovalSnapshot(transitions: RunTransition[]) {
  return buildApprovalQueueSnapshotFromTransitions(transitions);
}

export function buildRunUnityArtifacts(runRecord: RunRecord) {
  const donePosts = (runRecord.feedPosts ?? []).filter((post) => post.status === "done");
  const unityTaskBundle = buildUnityTaskBundle({
    runId: runRecord.runId,
    tasks: donePosts.map((post) => ({
      id: post.id,
      title: `${post.agentName} output`,
      instructions: post.summary,
      targetPath: `Assets/${post.nodeId}.md`,
      risk: "medium",
    })),
  });
  const patchBundle = buildPatchBundle({
    runId: runRecord.runId,
    files: [],
  });
  return { unityTaskBundle, patchBundle };
}

export function evaluateApprovalDecisionGate(params: {
  approval: PendingApproval | null | undefined;
  decision: ApprovalDecision;
}): GateDecision {
  if (!params.approval) {
    return {
      allowed: false,
      reason: "approval payload missing",
    };
  }

  const preview = JSON.stringify(params.approval.params ?? {});
  const queue: ApprovalRequest[] = createApprovalQueue([
    {
      requestId: String(params.approval.requestId),
      taskId: String(params.approval.requestId),
      actionType: "unknown",
      preview,
      status: params.decision === "accept" || params.decision === "acceptForSession" ? "approved" : "declined",
      source: "remote",
    },
  ]);

  return evaluateApprovalGate({
    taskId: String(params.approval.requestId),
    actionType: "unknown",
    preview,
    queue,
  });
}
