import type { PresetKind, QualityProfileId, TurnExecutor, WebProvider, WebResultMode } from "../../features/workflow/domain";
import type { GraphData, GraphEdge, GraphNode, NodeExecutionStatus, NodeType } from "../../features/workflow/types";

export type EngineNotificationEvent = {
  method: string;
  params: unknown;
};

export type EngineLifecycleEvent = {
  state: string;
  message?: string | null;
};

export type ThreadStartResult = {
  threadId: string;
  raw: unknown;
};

export type UsageCheckResult = {
  sourceMethod: string;
  raw: unknown;
};

export type AuthProbeState = "authenticated" | "login_required" | "unknown";

export type AuthProbeResult = {
  state: AuthProbeState;
  sourceMethod?: string | null;
  authMode?: string | null;
  raw?: unknown;
  detail?: string | null;
};

export type AgentRuleDoc = {
  path: string;
  content: string;
};

export type AgentRulesReadResult = {
  docs?: AgentRuleDoc[];
};

export type LoginChatgptResult = {
  authUrl: string;
  raw?: unknown;
};

export type AuthMode = "chatgpt" | "apikey" | "unknown";
export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type EngineApprovalRequestEvent = {
  requestId: number;
  method: string;
  params: unknown;
};

export type PendingApproval = {
  requestId: number;
  source: "remote";
  method: string;
  params: unknown;
};

export type CodexMultiAgentMode = "off" | "balanced" | "max";

export type CanvasDisplayEdge = {
  edge: GraphEdge;
  edgeKey: string;
  readOnly: boolean;
};

export type KnowledgeSnippet = {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  score: number;
};

export type KnowledgeRetrieveResult = {
  snippets: KnowledgeSnippet[];
  warnings: string[];
};

export type KnowledgeTraceEntry = {
  nodeId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
};

export type UsageStats = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type FeedAttachmentKind = "markdown" | "json";

export type FeedAttachment = {
  kind: FeedAttachmentKind;
  title: string;
  content: string;
  truncated: boolean;
  charCount: number;
  filePath?: string;
};

export type FeedPostStatus = "draft" | "done" | "low_quality" | "failed" | "cancelled";
export type FeedInputSource = {
  kind: "question" | "node";
  nodeId?: string;
  agentName: string;
  roleLabel?: string;
  summary?: string;
  sourcePostId?: string;
};

export type FeedPost = {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: NodeType;
  isFinalDocument?: boolean;
  executor?: TurnExecutor;
  agentName: string;
  roleLabel: string;
  status: FeedPostStatus;
  createdAt: string;
  summary: string;
  steps: string[];
  inputSources?: FeedInputSource[];
  inputContext?: {
    preview: string;
    charCount: number;
    truncated: boolean;
  };
  evidence: {
    durationMs?: number;
    usage?: UsageStats;
    qualityScore?: number;
    qualityDecision?: string;
  };
  attachments: FeedAttachment[];
  redaction: {
    masked: boolean;
    ruleVersion: string;
  };
};

export type FeedStatusFilter = "all" | FeedPostStatus;
export type FeedExecutorFilter = "all" | "codex" | "web" | "ollama";
export type FeedPeriodFilter = "all" | "today" | "7d";
export type FeedCategory = "all_posts" | "completed_posts" | "web_posts" | "error_posts";
export type RunGroupKind = "template" | "custom";

export type QualityCheck = {
  id: string;
  label: string;
  kind: string;
  required: boolean;
  passed: boolean;
  scoreDelta: number;
  detail?: string;
};

export type QualityReport = {
  profile: QualityProfileId;
  threshold: number;
  score: number;
  decision: "PASS" | "REJECT";
  checks: QualityCheck[];
  failures: string[];
  warnings: string[];
};

export type NodeRunState = {
  status: NodeExecutionStatus;
  logs: string[];
  output?: unknown;
  error?: string;
  threadId?: string;
  turnId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  usage?: UsageStats;
  qualityReport?: QualityReport;
};

export type RunTransition = {
  at: string;
  nodeId: string;
  status: NodeExecutionStatus;
  message?: string;
};

export type NodeMetric = {
  nodeId: string;
  profile: QualityProfileId;
  score: number;
  decision: "PASS" | "REJECT";
  threshold: number;
  failedChecks: number;
  warningCount: number;
};

export type QualitySummary = {
  avgScore: number;
  passRate: number;
  totalNodes: number;
  passNodes: number;
};

export type RegressionSummary = {
  baselineRunId?: string;
  avgScoreDelta?: number;
  passRateDelta?: number;
  status: "improved" | "stable" | "degraded" | "unknown";
  note?: string;
};

export type RunRecord = {
  runId: string;
  question?: string;
  startedAt: string;
  finishedAt?: string;
  workflowGroupName?: string;
  workflowGroupKind?: RunGroupKind;
  workflowPresetKind?: PresetKind;
  finalAnswer?: string;
  graphSnapshot: GraphData;
  transitions: RunTransition[];
  summaryLogs: string[];
  nodeLogs?: Record<string, string[]>;
  threadTurnMap: Record<string, { threadId?: string; turnId?: string }>;
  providerTrace?: Array<{
    nodeId: string;
    executor: TurnExecutor;
    provider: string;
    status: "done" | "failed" | "cancelled";
    startedAt: string;
    finishedAt: string;
    summary?: string;
  }>;
  knowledgeTrace?: KnowledgeTraceEntry[];
  nodeMetrics?: Record<string, NodeMetric>;
  qualitySummary?: QualitySummary;
  regression?: RegressionSummary;
  feedPosts?: FeedPost[];
};

export type FeedViewPost = FeedPost & {
  sourceFile: string;
  question?: string;
};

export type DragState = {
  nodeIds: string[];
  pointerStart: LogicalPoint;
  startPositions: Record<string, { x: number; y: number }>;
};

export type EdgeDragState = {
  edgeKey: string;
  pointerStart: LogicalPoint;
  startControl: LogicalPoint;
};

export type PanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

export type PointerState = {
  clientX: number;
  clientY: number;
};

export type LogicalPoint = {
  x: number;
  y: number;
};

export type NodeVisualSize = {
  width: number;
  height: number;
};

export type MarqueeSelection = {
  start: LogicalPoint;
  current: LogicalPoint;
  append: boolean;
};

export type WebProviderRunResult = {
  ok: boolean;
  text?: string;
  raw?: unknown;
  meta?: {
    provider: string;
    url?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    elapsedMs?: number | null;
    extractionStrategy?: string | null;
  };
  error?: string;
  errorCode?: string;
};

export type WebWorkerHealth = {
  running: boolean;
  lastError?: string | null;
  providers?: unknown;
  logPath?: string | null;
  profileRoot?: string | null;
  activeProvider?: string | null;
  bridge?: unknown;
};

export type PendingWebTurn = {
  nodeId: string;
  provider: WebProvider;
  prompt: string;
  mode: WebResultMode;
};

export type PendingWebLogin = {
  nodeId: string;
  provider: WebProvider;
  reason: string;
};

export type GraphClipboardSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  copiedAt: number;
};
