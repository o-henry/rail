import { buildConflictLedger, buildFinalSynthesisPacket } from "../mainAppRuntimeHelpers";
import { getWebProviderFromExecutor, getTurnExecutor, type TurnConfig, type WebProvider } from "../../features/workflow/domain";
import type { GraphData, GraphEdge, GraphNode, NodeAnchorSide, NodeExecutionStatus } from "../../features/workflow/types";
import type {
  EvidenceEnvelope,
  FeedInputSource,
  FeedPost,
  FinalSynthesisPacket,
  NodeResponsibilityMemory,
  NodeRunState,
  RunRecord,
} from "./types";
export const PAUSE_ERROR_TOKEN = "__PAUSED_BY_USER__";

export function buildNodeInputForNode(params: {
  edges: GraphEdge[];
  nodeId: string;
  outputs: Record<string, unknown>;
  rootInput: string;
}): unknown {
  const incoming = params.edges.filter((edge) => edge.to.nodeId === params.nodeId);
  if (incoming.length === 0) {
    return params.rootInput;
  }
  if (incoming.length === 1) {
    return params.outputs[incoming[0].from.nodeId] ?? null;
  }

  const merged: Record<string, unknown> = {};
  for (const edge of incoming) {
    merged[edge.from.nodeId] = params.outputs[edge.from.nodeId];
  }
  return merged;
}

export function buildFinalTurnInputPacket(params: {
  edges: GraphEdge[];
  nodeId: string;
  currentInput: unknown;
  outputs: Record<string, unknown>;
  rootInput: string;
  normalizedEvidenceByNodeId: Record<string, EvidenceEnvelope[]>;
  runMemory: Record<string, NodeResponsibilityMemory>;
}): FinalSynthesisPacket | unknown {
  const incomingEdges = params.edges.filter((edge) => edge.to.nodeId === params.nodeId);
  if (incomingEdges.length === 0) {
    return params.currentInput;
  }
  const upstream: Record<string, unknown> = {};
  const packets: EvidenceEnvelope[] = [];
  for (const edge of incomingEdges) {
    const sourceNodeId = edge.from.nodeId;
    if (!(sourceNodeId in params.outputs)) {
      continue;
    }
    upstream[sourceNodeId] = params.outputs[sourceNodeId];
    const sourcePackets = params.normalizedEvidenceByNodeId[sourceNodeId] ?? [];
    if (sourcePackets.length > 0) {
      packets.push(sourcePackets[sourcePackets.length - 1]);
    }
  }

  if (Object.keys(upstream).length === 0) {
    return params.currentInput;
  }
  const unresolvedConflicts = buildConflictLedger(packets);
  return buildFinalSynthesisPacket({
    question: params.rootInput,
    evidencePackets: packets,
    conflicts: unresolvedConflicts,
    runMemory: params.runMemory,
  });
}

export function appendRunTransition(
  runRecord: RunRecord,
  nodeId: string,
  state: NodeExecutionStatus,
  message?: string,
) {
  runRecord.transitions.push({
    at: new Date().toISOString(),
    nodeId,
    status: state,
    message,
  });
  if (message) {
    runRecord.summaryLogs.push(`[${nodeId}] ${state}: ${message}`);
  } else {
    runRecord.summaryLogs.push(`[${nodeId}] ${state}`);
  }
}

export function collectRequiredWebProviders(nodes: GraphNode[]): WebProvider[] {
  const providers = new Set<WebProvider>();
  for (const node of nodes) {
    if (node.type !== "turn") {
      continue;
    }
    const executor = getTurnExecutor(node.config as TurnConfig);
    const provider = getWebProviderFromExecutor(executor);
    if (provider) {
      providers.add(provider);
    }
  }
  return Array.from(providers);
}

export function buildWebConnectPreflightReasons(params: {
  bridgeRunning: boolean;
  tokenMasked: boolean;
  extensionOriginPolicy?: string;
  extensionOriginAllowlistConfigured?: boolean;
  missingProviders: WebProvider[];
  webProviderLabelFn: (provider: WebProvider) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string[] {
  const reasons: string[] = [];
  if (!params.bridgeRunning || !params.tokenMasked) {
    reasons.push(params.t("modal.webConnectReasonNotRunning"));
  }
  if (params.extensionOriginPolicy === "allowlist" && params.extensionOriginAllowlistConfigured === false) {
    reasons.push(params.t("modal.webConnectReasonPolicy"));
  }
  if (params.missingProviders.length > 0) {
    reasons.push(
      params.t("modal.webConnectReasonMissingProviders", {
        providers: params.missingProviders.map((provider) => params.webProviderLabelFn(provider)).join(", "),
      }),
    );
  }
  return reasons;
}

export function findDirectInputNodeIds(graph: GraphData): string[] {
  const incomingNodeIds = new Set(graph.edges.map((edge) => edge.to.nodeId));
  return graph.nodes.filter((node) => !incomingNodeIds.has(node.id)).map((node) => node.id);
}

export function createRunNodeStateSnapshot(nodes: GraphNode[]): {
  nodeStates: Record<string, NodeRunState>;
  runLogs: Record<string, string[]>;
} {
  const nodeStates: Record<string, NodeRunState> = {};
  const runLogs: Record<string, string[]> = {};
  for (const node of nodes) {
    nodeStates[node.id] = {
      status: "idle",
      logs: [],
    };
    runLogs[node.id] = [];
  }
  return { nodeStates, runLogs };
}

export function createRunRecord(params: {
  graph: GraphData;
  question: string;
  workflowGroupName?: string;
  workflowGroupKind?: RunRecord["workflowGroupKind"];
  workflowPresetKind?: RunRecord["workflowPresetKind"];
}): RunRecord {
  return {
    runId: `${Date.now()}`,
    question: params.question,
    startedAt: new Date().toISOString(),
    workflowGroupName: params.workflowGroupName,
    workflowGroupKind: params.workflowGroupKind,
    workflowPresetKind: params.workflowPresetKind,
    graphSnapshot: params.graph,
    transitions: [],
    summaryLogs: [],
    nodeLogs: {},
    threadTurnMap: {},
    providerTrace: [],
    knowledgeTrace: [],
    internalMemoryTrace: [],
    nodeMetrics: {},
    feedPosts: [],
    normalizedEvidenceByNodeId: {},
    conflictLedger: [],
    runMemory: {},
  };
}

export function resolveFinalNodeId(params: {
  graph: GraphData;
  transitions: RunRecord["transitions"];
  lastDoneNodeId: string;
}): string {
  const outgoingNodeIdSet = new Set(params.graph.edges.map((edge) => edge.from.nodeId));
  const sinkNodeIds = params.graph.nodes
    .map((node) => node.id)
    .filter((nodeId) => !outgoingNodeIdSet.has(nodeId));
  if (sinkNodeIds.length === 1) {
    return sinkNodeIds[0];
  }
  if (sinkNodeIds.length > 1) {
    const sinkSet = new Set(sinkNodeIds);
    for (let index = params.transitions.length - 1; index >= 0; index -= 1) {
      const row = params.transitions[index];
      if (sinkSet.has(row.nodeId)) {
        return row.nodeId;
      }
    }
  }
  return params.lastDoneNodeId || "";
}

export function buildFinalNodeFailureReason(params: {
  finalNodeId: string;
  finalNodeState?: NodeExecutionStatus;
  nodeStatusLabelFn: (state: NodeExecutionStatus) => string;
}): string {
  if (params.finalNodeId && params.finalNodeState) {
    return `최종 노드(${params.finalNodeId}) 상태=${params.nodeStatusLabelFn(params.finalNodeState)}`;
  }
  return "최종 노드를 확정하지 못했습니다.";
}

export function buildGraphExecutionIndex(graph: GraphData): {
  nodeMap: Map<string, GraphNode>;
  indegree: Map<string, number>;
  adjacency: Map<string, string[]>;
  incoming: Map<string, string[]>;
} {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of graph.edges) {
    indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
    const children = adjacency.get(edge.from.nodeId) ?? [];
    children.push(edge.to.nodeId);
    adjacency.set(edge.from.nodeId, children);
    const parents = incoming.get(edge.to.nodeId) ?? [];
    parents.push(edge.from.nodeId);
    incoming.set(edge.to.nodeId, parents);
  }

  return { nodeMap, indegree, adjacency, incoming };
}

export function enqueueZeroIndegreeNodes(params: {
  indegree: Map<string, number>;
  queue: string[];
  onQueued: (nodeId: string) => void;
}) {
  params.indegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      params.queue.push(nodeId);
      params.onQueued(nodeId);
    }
  });
}

export function scheduleChildrenWhenReady(params: {
  nodeId: string;
  adjacency: Map<string, string[]>;
  indegree: Map<string, number>;
  queue: string[];
  onQueued: (nodeId: string) => void;
}) {
  const children = params.adjacency.get(params.nodeId) ?? [];
  for (const childId of children) {
    const next = (params.indegree.get(childId) ?? 0) - 1;
    params.indegree.set(childId, next);
    if (next === 0) {
      params.queue.push(childId);
      params.onQueued(childId);
    }
  }
}

export function resolveFeedInputSources(params: {
  targetNodeId: string;
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  workflowQuestion: string;
  latestFeedSourceByNodeId: Map<string, FeedInputSource>;
  turnRoleLabelFn: (node: GraphNode) => string;
  nodeTypeLabelFn: (type: GraphNode["type"]) => string;
  nodeSelectionLabelFn: (node: GraphNode) => string;
}): FeedInputSource[] {
  const incomingEdges = params.edges.filter((edge) => edge.to.nodeId === params.targetNodeId);
  if (incomingEdges.length === 0) {
    return [
      {
        kind: "question",
        agentName: "사용자 입력 질문",
        summary: params.workflowQuestion.trim() || undefined,
      },
    ];
  }

  const seenNodeIds = new Set<string>();
  const sources: FeedInputSource[] = [];
  for (const edge of incomingEdges) {
    const sourceNodeId = edge.from.nodeId;
    if (!sourceNodeId || seenNodeIds.has(sourceNodeId)) {
      continue;
    }
    seenNodeIds.add(sourceNodeId);
    const known = params.latestFeedSourceByNodeId.get(sourceNodeId);
    const sourceNode = params.nodeMap.get(sourceNodeId);
    const sourceRoleLabel =
      sourceNode?.type === "turn"
        ? params.turnRoleLabelFn(sourceNode)
        : sourceNode
          ? params.nodeTypeLabelFn(sourceNode.type)
          : known?.roleLabel;
    const sourceAgentName = known?.agentName ?? (sourceNode ? params.nodeSelectionLabelFn(sourceNode) : sourceNodeId);
    sources.push({
      kind: "node",
      nodeId: sourceNodeId,
      agentName: sourceAgentName,
      roleLabel: sourceRoleLabel,
      summary: known?.summary,
      sourcePostId: known?.sourcePostId,
    });
  }
  return sources;
}

export function rememberFeedSource(
  latestFeedSourceByNodeId: Map<string, FeedInputSource>,
  post: FeedPost,
) {
  latestFeedSourceByNodeId.set(post.nodeId, {
    kind: "node",
    nodeId: post.nodeId,
    agentName: post.agentName,
    roleLabel: post.roleLabel,
    summary: post.summary,
    sourcePostId: post.id,
  });
}

export function isPauseSignalError(input: unknown): boolean {
  const text = String(input ?? "").toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.includes(PAUSE_ERROR_TOKEN.toLowerCase()) ||
    text.includes("cancelled") ||
    text.includes("취소") ||
    text.includes("interrupt")
  );
}

export function buildConnectPreviewLine(params: {
  connectFromNodeId: string;
  connectPreviewPoint: { x: number; y: number } | null;
  connectPreviewStartPoint: { x: number; y: number } | null;
  connectFromSide: NodeAnchorSide | null;
  canvasNodeMap: Map<string, GraphNode>;
  getNodeVisualSize: (nodeId: string) => { width: number; height: number };
  getNodeAnchorPointFn: (
    node: GraphNode,
    side: NodeAnchorSide,
    size: { width: number; height: number },
  ) => { x: number; y: number } | null;
  buildRoundedEdgePathFn: (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    readOnly: boolean,
    fromSide: NodeAnchorSide,
    toSide: NodeAnchorSide,
  ) => string;
}): string | null {
  if (!params.connectFromNodeId || !params.connectPreviewPoint) {
    return null;
  }
  const startPoint = (() => {
    if (params.connectPreviewStartPoint) {
      return params.connectPreviewStartPoint;
    }
    const fromNode = params.canvasNodeMap.get(params.connectFromNodeId);
    if (!fromNode) {
      return null;
    }
    return params.getNodeAnchorPointFn(
      fromNode,
      params.connectFromSide ?? "right",
      params.getNodeVisualSize(fromNode.id),
    );
  })();
  if (!startPoint) {
    return null;
  }
  const dx = params.connectPreviewPoint.x - startPoint.x;
  const dy = params.connectPreviewPoint.y - startPoint.y;
  const guessedToSide: NodeAnchorSide =
    Math.abs(dx) >= Math.abs(dy)
      ? dx >= 0
        ? "left"
        : "right"
      : dy >= 0
        ? "top"
        : "bottom";
  return params.buildRoundedEdgePathFn(
    startPoint.x,
    startPoint.y,
    params.connectPreviewPoint.x,
    params.connectPreviewPoint.y,
    false,
    params.connectFromSide ?? "right",
    guessedToSide,
  );
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export async function cancelGraphRun(params: {
  isGraphRunning: boolean;
  setIsGraphPaused: (value: boolean) => void;
  setStatus: (value: string) => void;
  pendingWebLogin: boolean;
  resolvePendingWebLogin: (continueAfterLogin: boolean) => void;
  activeWebNodeByProvider: Partial<Record<WebProvider, string>>;
  invokeFn: InvokeFn;
  addNodeLog: (nodeId: string, message: string) => void;
  clearWebBridgeStageWarnTimer: (provider: WebProvider) => void;
  activeWebPromptByProvider: Partial<Record<WebProvider, string>>;
  setError: (value: string) => void;
  pendingWebTurn: unknown;
  suspendedWebTurn: unknown;
  clearQueuedWebTurnRequests: (reason: string) => void;
  resolvePendingWebTurn: (result: { ok: boolean; output?: unknown; error?: string }) => void;
  pauseErrorToken: string;
  activeTurnNodeId: string;
  nodeStates: Record<string, { threadId?: string } | undefined>;
}) {
  if (!params.isGraphRunning) {
    return;
  }
  params.setIsGraphPaused(true);
  params.setStatus("일시정지 요청됨");

  if (params.pendingWebLogin) {
    params.resolvePendingWebLogin(false);
  }

  const activeWebProviders = Object.keys(params.activeWebNodeByProvider) as WebProvider[];
  if (activeWebProviders.length > 0) {
    for (const provider of activeWebProviders) {
      const activeWebNodeId = params.activeWebNodeByProvider[provider];
      try {
        await params.invokeFn("web_provider_cancel", { provider });
        if (activeWebNodeId) {
          params.addNodeLog(activeWebNodeId, "[WEB] 취소 요청 전송");
        }
        params.clearWebBridgeStageWarnTimer(provider);
        delete params.activeWebPromptByProvider[provider];
        delete params.activeWebNodeByProvider[provider];
      } catch (error) {
        params.setError(String(error));
      }
    }
  }

  if (params.pendingWebTurn) {
    params.clearQueuedWebTurnRequests(params.pauseErrorToken);
    params.resolvePendingWebTurn({ ok: false, error: params.pauseErrorToken });
    return;
  }
  if (params.suspendedWebTurn) {
    params.clearQueuedWebTurnRequests(params.pauseErrorToken);
    params.resolvePendingWebTurn({ ok: false, error: params.pauseErrorToken });
    return;
  }

  const activeNodeId = params.activeTurnNodeId;
  if (!activeNodeId) {
    return;
  }

  const active = params.nodeStates[activeNodeId];
  if (!active?.threadId) {
    return;
  }

  try {
    await params.invokeFn("turn_interrupt", { threadId: active.threadId });
    params.addNodeLog(activeNodeId, "turn_interrupt 요청 전송");
  } catch (error) {
    params.setError(String(error));
  }
}
