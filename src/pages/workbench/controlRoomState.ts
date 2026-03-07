import type { GraphNode } from "../../features/workflow/types";
import type { WorkSession } from "../../features/orchestration/workbench/types";
import type { WorkbenchNodeState, WorkbenchWorkspaceEvent } from "./workbenchRuntimeTypes";

export type ControlRoomOverview = {
  totalSessions: number;
  activeSessions: number;
  unityPending: number;
  completedSessions: number;
  activeNodes: number;
  recentErrors: number;
  pendingApprovals: number;
  connectedProviders: number;
  graphRunning: boolean;
};

export type GraphMonitorRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  active: boolean;
  logCount: number;
  lastLog: string;
};

function nodeTitle(node: GraphNode): string {
  const labelCandidates = ["label", "title", "name", "promptLabel"];
  for (const key of labelCandidates) {
    const value = String((node.config as Record<string, unknown>)[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return node.id;
}

export function buildControlRoomOverview(input: {
  sessions: WorkSession[];
  nodeStates: Record<string, WorkbenchNodeState>;
  workspaceEvents: WorkbenchWorkspaceEvent[];
  pendingApprovals: number;
  connectedProviders: number;
  graphRunning: boolean;
}): ControlRoomOverview {
  return {
    totalSessions: input.sessions.length,
    activeSessions: input.sessions.filter((session) => session.status === "active" || session.status === "review").length,
    unityPending: input.sessions.filter((session) => session.status === "unity").length,
    completedSessions: input.sessions.filter((session) => session.status === "done").length,
    activeNodes: Object.values(input.nodeStates).filter((state) => state.status === "running" || state.status === "queued" || state.status === "waiting_user").length,
    recentErrors: input.workspaceEvents.filter((event) => event.level === "error").slice(0, 12).length,
    pendingApprovals: input.pendingApprovals,
    connectedProviders: input.connectedProviders,
    graphRunning: input.graphRunning,
  };
}

export function buildGraphMonitorRows(input: {
  graphNodes: GraphNode[];
  nodeStates: Record<string, WorkbenchNodeState>;
}): GraphMonitorRow[] {
  return [...input.graphNodes]
    .map((node) => {
      const state = input.nodeStates[node.id];
      const logs = state?.logs ?? [];
      const status = state?.status ?? "idle";
      return {
        id: node.id,
        title: nodeTitle(node),
        type: node.type,
        status,
        active: status === "running" || status === "queued" || status === "waiting_user",
        logCount: logs.length,
        lastLog: logs[logs.length - 1] ?? "",
      } satisfies GraphMonitorRow;
    })
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });
}
