import { openPath } from "../../shared/tauri";
import type { WorkSession, WorkSessionStatus } from "../../features/orchestration/workbench/types";
import type { GraphNode } from "../../features/workflow/types";
import { buildControlRoomOverview, buildGraphMonitorRows } from "./controlRoomState";
import { WorkbenchGlobalBar } from "./WorkbenchGlobalBar";
import { WorkbenchGraphMonitor } from "./WorkbenchGraphMonitor";
import { WorkbenchQuickActions } from "./WorkbenchQuickActions";
import { WorkbenchRuntimeConsole } from "./WorkbenchRuntimeConsole";
import { WorkbenchSessionBoard } from "./WorkbenchSessionBoard";
import { WorkbenchSessionDetail } from "./WorkbenchSessionDetail";
import type { WorkbenchNodeState, WorkbenchWorkspaceEvent } from "./workbenchRuntimeTypes";

type WorkbenchPageProps = {
  cwd: string;
  graphFileName: string;
  graphNodes: GraphNode[];
  nodeStates: Record<string, WorkbenchNodeState>;
  workspaceEvents: WorkbenchWorkspaceEvent[];
  pendingApprovalsCount: number;
  connectedProviderCount: number;
  isGraphRunning: boolean;
  sessions: WorkSession[];
  selectedSession: WorkSession | null;
  selectedSessionId: string | null;
  onOpenWorkflow: () => void;
  onCreateRoleSession: (input: {
    roleId: string;
    roleLabel: string;
    taskId: string;
    prompt: string;
  }) => void;
  onCreateManualSession: (input: {
    title: string;
    taskId: string;
    prompt?: string;
    commands?: string[];
  }) => void;
  onSelectSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onAddNote: (sessionId: string, note: string) => void;
  onAttachArtifact: (sessionId: string, path: string) => void;
  onSetManualStatus: (sessionId: string, status: WorkSessionStatus) => void;
  onSetReviewState: (sessionId: string, next: "approved" | "rejected") => void;
  onRecordCompanionEvent: (sessionId: string, type: "task_received" | "patch_ready" | "test_passed" | "test_failed" | "approval_requested", message?: string) => void;
  onRecordUnityVerification: (sessionId: string, success: boolean, message: string) => void;
  onExecuteCommand: (sessionId: string, command: string) => void;
};

function resolveArtifactPath(cwd: string, path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized) {
    return normalized;
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    return normalized;
  }
  const base = String(cwd ?? "").trim().replace(/[\\/]+$/, "");
  if (!base) {
    return normalized;
  }
  return `${base}/${normalized.replace(/^[./\\]+/, "")}`;
}

export default function WorkbenchPage(props: WorkbenchPageProps) {
  const overview = buildControlRoomOverview({
    sessions: props.sessions,
    nodeStates: props.nodeStates,
    workspaceEvents: props.workspaceEvents,
    pendingApprovals: props.pendingApprovalsCount,
    connectedProviders: props.connectedProviderCount,
    graphRunning: props.isGraphRunning,
  });
  const graphRows = buildGraphMonitorRows({
    graphNodes: props.graphNodes,
    nodeStates: props.nodeStates,
  });

  return (
    <section className="workbench-control-room workspace-tab-panel">
      <WorkbenchGlobalBar overview={overview} />
      <div className="workbench-left-stack">
        <WorkbenchQuickActions
          onCreateManualSession={props.onCreateManualSession}
          onCreateRoleSession={props.onCreateRoleSession}
        />
        <WorkbenchSessionBoard
          onSelectSession={props.onSelectSession}
          selectedSessionId={props.selectedSessionId}
          sessions={props.sessions}
        />
      </div>
      <WorkbenchGraphMonitor
        graphName={props.graphFileName}
        onOpenWorkflow={props.onOpenWorkflow}
        rows={graphRows}
      />
      <WorkbenchSessionDetail
        onAddNote={props.onAddNote}
        onArchiveSession={props.onArchiveSession}
        onAttachArtifact={props.onAttachArtifact}
        onOpenArtifact={(path) => void openPath(resolveArtifactPath(props.cwd, path))}
        onSetManualStatus={props.onSetManualStatus}
        session={props.selectedSession}
      />
      <WorkbenchRuntimeConsole
        onExecuteCommand={props.onExecuteCommand}
        onRecordCompanionEvent={props.onRecordCompanionEvent}
        onRecordUnityVerification={props.onRecordUnityVerification}
        onSetReviewState={props.onSetReviewState}
        session={props.selectedSession}
        workspaceEvents={props.workspaceEvents}
      />
    </section>
  );
}
