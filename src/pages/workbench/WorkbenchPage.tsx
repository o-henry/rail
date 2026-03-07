import { openPath } from "../../shared/tauri";
import type { WorkSession, WorkSessionStatus } from "../../features/orchestration/workbench/types";
import { WorkbenchQuickActions } from "./WorkbenchQuickActions";
import { WorkbenchSessionBoard } from "./WorkbenchSessionBoard";
import { WorkbenchSessionDetail } from "./WorkbenchSessionDetail";

type WorkbenchPageProps = {
  cwd: string;
  sessions: WorkSession[];
  selectedSession: WorkSession | null;
  selectedSessionId: string | null;
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
  return (
    <section className="workbench-layout workspace-tab-panel">
      <WorkbenchSessionBoard
        onSelectSession={props.onSelectSession}
        selectedSessionId={props.selectedSessionId}
        sessions={props.sessions}
      />

      <div className="workbench-sidebar-stack">
        <WorkbenchQuickActions
          selectedSession={props.selectedSession}
          onCreateManualSession={props.onCreateManualSession}
          onCreateRoleSession={props.onCreateRoleSession}
          onExecuteCommand={props.onExecuteCommand}
          onRecordCompanionEvent={props.onRecordCompanionEvent}
          onRecordUnityVerification={props.onRecordUnityVerification}
          onSetReviewState={props.onSetReviewState}
        />
        <WorkbenchSessionDetail
          onAddNote={props.onAddNote}
          onArchiveSession={props.onArchiveSession}
          onAttachArtifact={props.onAttachArtifact}
          onOpenArtifact={(path) => void openPath(resolveArtifactPath(props.cwd, path))}
          onSetManualStatus={props.onSetManualStatus}
          session={props.selectedSession}
        />
      </div>
    </section>
  );
}
