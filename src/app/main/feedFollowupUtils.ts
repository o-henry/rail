import { extractFinalAnswer } from "../../features/workflow/labels";
import type { TurnExecutor } from "../../features/workflow/domain";
import type { GraphNode } from "../../features/workflow/types";
import type { FeedPost, RunRecord } from "./types";

export function buildFollowupGraphSnapshot(
  node: GraphNode,
  graphSchemaVersion: number,
  defaultKnowledgeConfig: () => any,
): RunRecord["graphSnapshot"] {
  return {
    version: graphSchemaVersion,
    nodes: [node],
    edges: [],
    knowledge: defaultKnowledgeConfig(),
  };
}

export function buildFollowupFailedRunRecord(params: {
  runId: string;
  node: GraphNode;
  question: string;
  startedAt: string;
  finishedAt: string;
  errorMessage: string;
  failedShortMessage: string;
  nodeLogs: string[];
  threadId?: string;
  turnId?: string;
  executor: TurnExecutor;
  provider: string;
  post: FeedPost;
  graphSchemaVersion: number;
  defaultKnowledgeConfig: () => any;
  groupLabel: string;
}): RunRecord {
  return {
    runId: params.runId,
    question: params.question,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    workflowGroupName: params.groupLabel,
    workflowGroupKind: "custom",
    graphSnapshot: buildFollowupGraphSnapshot(params.node, params.graphSchemaVersion, params.defaultKnowledgeConfig),
    transitions: [
      { at: params.startedAt, nodeId: params.node.id, status: "running" },
      { at: params.finishedAt, nodeId: params.node.id, status: "failed", message: params.errorMessage },
    ],
    summaryLogs: [`[${params.node.id}] running`, `[${params.node.id}] failed: ${params.failedShortMessage}`],
    nodeLogs: {
      [params.node.id]: params.nodeLogs,
    },
    threadTurnMap: {
      [params.node.id]: {
        threadId: params.threadId,
        turnId: params.turnId,
      },
    },
    providerTrace: [
      {
        nodeId: params.node.id,
        executor: params.executor,
        provider: params.provider,
        status: "failed",
        startedAt: params.startedAt,
        finishedAt: params.finishedAt,
        summary: params.errorMessage,
      },
    ],
    feedPosts: [params.post],
  };
}

export function buildFollowupDoneRunRecord(params: {
  runId: string;
  node: GraphNode;
  question: string;
  startedAt: string;
  finishedAt: string;
  doneMessage: string;
  nodeLogs: string[];
  threadId?: string;
  turnId?: string;
  executor: TurnExecutor;
  provider: string;
  post: FeedPost;
  output: unknown;
  graphSchemaVersion: number;
  defaultKnowledgeConfig: () => any;
  groupLabel: string;
}): RunRecord {
  return {
    runId: params.runId,
    question: params.question,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    workflowGroupName: params.groupLabel,
    workflowGroupKind: "custom",
    finalAnswer: extractFinalAnswer(params.output),
    graphSnapshot: buildFollowupGraphSnapshot(params.node, params.graphSchemaVersion, params.defaultKnowledgeConfig),
    transitions: [
      { at: params.startedAt, nodeId: params.node.id, status: "running" },
      { at: params.finishedAt, nodeId: params.node.id, status: "done", message: params.doneMessage },
    ],
    summaryLogs: [`[${params.node.id}] running`, `[${params.node.id}] done`],
    nodeLogs: {
      [params.node.id]: params.nodeLogs,
    },
    threadTurnMap: {
      [params.node.id]: {
        threadId: params.threadId,
        turnId: params.turnId,
      },
    },
    providerTrace: [
      {
        nodeId: params.node.id,
        executor: params.executor,
        provider: params.provider,
        status: "done",
        startedAt: params.startedAt,
        finishedAt: params.finishedAt,
        summary: params.doneMessage,
      },
    ],
    feedPosts: [params.post],
  };
}
