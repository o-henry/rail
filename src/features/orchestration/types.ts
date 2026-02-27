export type UnifiedInput = {
  rawText: string;
  normalizedText: string;
  locale: string;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type UnifiedInputValidationResult =
  | {
      ok: true;
      value: UnifiedInput;
    }
  | {
      ok: false;
      errors: string[];
    };

export type TaskNodeStatus = "ready" | "blocked" | "running" | "done" | "failed" | "skipped" | "cancelled";

export type TaskNode = {
  id: string;
  role: string;
  title: string;
  description?: string;
  dependsOn: string[];
  status: TaskNodeStatus;
  metadata?: Record<string, unknown>;
};

export type TaskEdge = {
  fromId: string;
  toId: string;
};

export type TaskGraph = {
  rootTaskId?: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
};

export type ApprovalActionType = "commandExecution" | "fileChange" | "externalCall" | "unknown";
export type ApprovalStatus = "pending" | "approved" | "declined" | "cancelled";
export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type ApprovalRequest = {
  requestId: string;
  taskId: string;
  actionType: ApprovalActionType;
  preview: string;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt?: string;
  source?: "remote" | "local";
  metadata?: Record<string, unknown>;
};

export type GateDecision = {
  allowed: boolean;
  reason: string;
  matchedRequestId?: string;
};

export type MissionStage = "decompose" | "approval" | "execution" | "summary";
export type MissionStageStatus = "done" | "active" | "todo";

export type MissionStageState = {
  id: MissionStage;
  status: MissionStageStatus;
  title: string;
};

export type NextActionCTA = {
  stage: MissionStage;
  headline: string;
  actionLabel: string;
};

export type MissionFlowState = {
  stages: MissionStageState[];
  activeStage: MissionStage;
  cta: NextActionCTA;
};

export type BatchProvider = "web/gpt" | "web/perplexity" | "web/claude" | "web/grok" | "web/gemini";
export type BatchScheduleStatus = "enabled" | "disabled";
export type BatchTriggerType = "schedule" | "user_event" | "manual";

export type BatchSchedule = {
  id: string;
  pipelineId: string;
  label: string;
  status: BatchScheduleStatus;
  provider: BatchProvider;
  query: string;
  cron: string;
  timezone?: string;
  lastTriggeredAt?: string;
};

export type BatchRunStatus = "queued" | "running" | "done" | "failed" | "skipped";

export type BatchRunResult = {
  id: string;
  scheduleId: string;
  pipelineId: string;
  trigger: BatchTriggerType;
  startedAt: string;
  finishedAt?: string;
  status: BatchRunStatus;
  reason?: string;
  provider?: BatchProvider;
  payload?: unknown;
};

export type WorkbenchTimelineEvent = {
  at: string;
  kind: "decompose" | "approval" | "execution" | "collaboration";
  taskId?: string;
  summary: string;
  payload?: unknown;
};

export type WorkbenchPreview = {
  timeline: WorkbenchTimelineEvent[];
  collaborationInbound: WorkbenchTimelineEvent[];
  collaborationOutbound: WorkbenchTimelineEvent[];
  recallByTask: Record<string, Array<{ memoryId: string; score: number; summary: string }>>;
};

export type RailCompatibleDagNode = {
  id: string;
  role: string;
  depth: number;
  row: number;
  position: { x: number; y: number };
  status: TaskNodeStatus;
};

export type RailCompatibleDagEdge = {
  fromId: string;
  toId: string;
};

export type RailCompatibleDag = {
  nodes: RailCompatibleDagNode[];
  edges: RailCompatibleDagEdge[];
};

export type UnityTask = {
  id: string;
  title: string;
  targetPath?: string;
  risk: "low" | "medium" | "high";
  order: number;
  instructions: string;
};

export type UnityTaskBundle = {
  bundleId: string;
  createdAt: string;
  tasks: UnityTask[];
};

export type PatchFile = {
  path: string;
  diff: string;
};

export type PatchBundle = {
  bundleId: string;
  createdAt: string;
  files: PatchFile[];
};
