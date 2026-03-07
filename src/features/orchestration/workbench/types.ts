import type { MissionControlState } from "../agentic/missionControl";
import type {
  AgenticNextAction,
  AgenticVerificationStatus,
  AgenticWorkSurface,
  CompanionEvent,
  TaskTerminalResult,
} from "../types";

export type WorkSessionKind = "role_run" | "manual_task";
export type WorkSessionStatus = "waiting" | "active" | "review" | "unity" | "done";
export type WorkSessionReviewState = "none" | "pending" | "approved" | "rejected";

export type WorkSessionNote = {
  id: string;
  body: string;
  createdAt: string;
};

export type WorkSession = {
  id: string;
  kind: WorkSessionKind;
  title: string;
  roleId?: string;
  roleLabel?: string;
  taskId: string;
  status: WorkSessionStatus;
  surface: AgenticWorkSurface;
  nextAction: AgenticNextAction;
  verificationStatus: AgenticVerificationStatus;
  linkedRunIds: string[];
  artifactPaths: string[];
  memorySummary: string;
  updatedAt: string;
  createdAt: string;
  prompt: string;
  commands: string[];
  notes: WorkSessionNote[];
  reviewState: WorkSessionReviewState;
  bridgeEvents: CompanionEvent[];
  terminalResults: TaskTerminalResult[];
  mission: MissionControlState | null;
  archived?: boolean;
};

export type WorkSessionRecord = {
  version: 1;
  sessions: WorkSession[];
  selectedSessionId: string | null;
};
