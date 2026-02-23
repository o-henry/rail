import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";

type EngineNotificationEvent = {
  method: string;
  params: unknown;
};

type EngineLifecycleEvent = {
  state: string;
  message?: string | null;
};

type ThreadStartResult = {
  threadId: string;
  raw: unknown;
};

type UsageCheckResult = {
  sourceMethod: string;
  raw: unknown;
};

type AuthProbeState = "authenticated" | "login_required" | "unknown";

type AuthProbeResult = {
  state: AuthProbeState;
  sourceMethod?: string | null;
  authMode?: string | null;
  raw?: unknown;
  detail?: string | null;
};

type AgentRuleDoc = {
  path: string;
  content: string;
};

type AgentRulesReadResult = {
  docs?: AgentRuleDoc[];
};

type LoginChatgptResult = {
  authUrl: string;
  raw?: unknown;
};

type AuthMode = "chatgpt" | "apikey" | "unknown";
type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

type EngineApprovalRequestEvent = {
  requestId: number;
  method: string;
  params: unknown;
};

type PendingApproval = {
  requestId: number;
  source: "remote";
  method: string;
  params: unknown;
};

type WorkspaceTab = "workflow" | "feed" | "history" | "settings" | "bridge";
type NodeType = "turn" | "transform" | "gate";
type PortType = "in" | "out";

type GraphNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

type GraphEdge = {
  from: { nodeId: string; port: PortType; side?: NodeAnchorSide };
  to: { nodeId: string; port: PortType; side?: NodeAnchorSide };
  control?: { x: number; y: number };
};

type CanvasDisplayEdge = {
  edge: GraphEdge;
  edgeKey: string;
  readOnly: boolean;
};

type GraphData = {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  knowledge: KnowledgeConfig;
};

type KnowledgeFileStatus = "ready" | "missing" | "unsupported" | "error";

type KnowledgeFileRef = {
  id: string;
  name: string;
  path: string;
  ext: string;
  enabled: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  status?: KnowledgeFileStatus;
  statusMessage?: string;
};

type KnowledgeConfig = {
  files: KnowledgeFileRef[];
  topK: number;
  maxChars: number;
};

type KnowledgeSnippet = {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  score: number;
};

type KnowledgeRetrieveResult = {
  snippets: KnowledgeSnippet[];
  warnings: string[];
};

type KnowledgeTraceEntry = {
  nodeId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
};

type NodeExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting_user"
  | "done"
  | "failed"
  | "skipped"
  | "cancelled";

type UsageStats = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type FeedAttachmentKind = "markdown" | "json";

type FeedAttachment = {
  kind: FeedAttachmentKind;
  title: string;
  content: string;
  truncated: boolean;
  charCount: number;
};

type FeedPostStatus = "draft" | "done" | "failed" | "cancelled";
type FeedTerminalStatus = Exclude<FeedPostStatus, "draft">;

type FeedPost = {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: NodeType;
  executor?: TurnExecutor;
  agentName: string;
  roleLabel: string;
  status: FeedPostStatus;
  createdAt: string;
  summary: string;
  steps: string[];
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

type FeedStatusFilter = "all" | FeedPostStatus;
type FeedExecutorFilter = "all" | "codex" | "web" | "ollama";
type FeedPeriodFilter = "all" | "today" | "7d";
type FeedCategory = "all_posts" | "completed_posts" | "web_posts" | "error_posts";

type NodeRunState = {
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

type RunTransition = {
  at: string;
  nodeId: string;
  status: NodeExecutionStatus;
  message?: string;
};

type RunRecord = {
  runId: string;
  question?: string;
  startedAt: string;
  finishedAt?: string;
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

type FeedViewPost = FeedPost & {
  sourceFile: string;
  question?: string;
};

type FeedBuildInput = {
  runId: string;
  node: GraphNode;
  status: FeedTerminalStatus;
  createdAt: string;
  summary?: string;
  logs?: string[];
  output?: unknown;
  error?: string;
  durationMs?: number;
  usage?: UsageStats;
  qualityReport?: QualityReport;
};

type TurnTerminal = {
  ok: boolean;
  status: string;
  params: unknown;
};

type DragState = {
  nodeIds: string[];
  pointerStart: LogicalPoint;
  startPositions: Record<string, { x: number; y: number }>;
};

type EdgeDragState = {
  edgeKey: string;
  pointerStart: LogicalPoint;
  startControl: LogicalPoint;
};

type PanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type PointerState = {
  clientX: number;
  clientY: number;
};

type LogicalPoint = {
  x: number;
  y: number;
};

type NodeVisualSize = {
  width: number;
  height: number;
};

type MarqueeSelection = {
  start: LogicalPoint;
  current: LogicalPoint;
  append: boolean;
};

type NodeAnchorSide = "top" | "right" | "bottom" | "left";
type FancySelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type TurnExecutor =
  | "codex"
  | "web_gemini"
  | "web_gpt"
  | "web_grok"
  | "web_perplexity"
  | "web_claude"
  | "ollama";
type PresetKind =
  | "validation"
  | "development"
  | "research"
  | "expert"
  | "unityGame"
  | "fullstack"
  | "creative"
  | "newsTrend";
type CostPreset = "conservative" | "balanced" | "aggressive";
type WebAutomationMode = "bridgeAssisted" | "auto" | "manualPasteJson" | "manualPasteText";
type WebResultMode = WebAutomationMode;
type WebProvider = "gemini" | "gpt" | "grok" | "perplexity" | "claude";

type TurnConfig = {
  executor?: TurnExecutor;
  model?: string;
  role?: string;
  cwd?: string;
  promptTemplate?: string;
  knowledgeEnabled?: boolean;
  webResultMode?: WebResultMode;
  webTimeoutMs?: number;
  ollamaModel?: string;
  qualityProfile?: QualityProfileId;
  qualityThreshold?: number;
  qualityCommandEnabled?: boolean;
  qualityCommands?: string;
  artifactType?: ArtifactType;
};

type QualityProfileId =
  | "code_implementation"
  | "research_evidence"
  | "design_planning"
  | "synthesis_final"
  | "generic";

type ArtifactType =
  | "none"
  | "RequirementArtifact"
  | "DesignArtifact"
  | "TaskPlanArtifact"
  | "ChangePlanArtifact"
  | "EvidenceArtifact";

type QualityCheck = {
  id: string;
  label: string;
  kind: string;
  required: boolean;
  passed: boolean;
  scoreDelta: number;
  detail?: string;
};

type QualityReport = {
  profile: QualityProfileId;
  threshold: number;
  score: number;
  decision: "PASS" | "REJECT";
  checks: QualityCheck[];
  failures: string[];
  warnings: string[];
};

type NodeMetric = {
  nodeId: string;
  profile: QualityProfileId;
  score: number;
  decision: "PASS" | "REJECT";
  threshold: number;
  failedChecks: number;
  warningCount: number;
};

type QualitySummary = {
  avgScore: number;
  passRate: number;
  totalNodes: number;
  passNodes: number;
};

type RegressionSummary = {
  baselineRunId?: string;
  avgScoreDelta?: number;
  passRateDelta?: number;
  status: "improved" | "stable" | "degraded" | "unknown";
  note?: string;
};

type QualityCommandResult = {
  name: string;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
  elapsedMs: number;
};

type WebProviderRunResult = {
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

type WebWorkerHealth = {
  running: boolean;
  lastError?: string | null;
  providers?: unknown;
  logPath?: string | null;
  profileRoot?: string | null;
  activeProvider?: string | null;
  bridge?: unknown;
};

type WebBridgeProviderSeen = {
  provider: WebProvider;
  pageUrl?: string | null;
  lastSeenAt?: string | null;
};

type WebBridgeStatus = {
  running: boolean;
  port: number;
  tokenMasked: string;
  token?: string;
  tokenStorage?: string;
  lastSeenAt?: string | null;
  connectedProviders: WebBridgeProviderSeen[];
  queuedTasks: number;
  activeTasks: number;
};

type PendingWebTurn = {
  nodeId: string;
  provider: WebProvider;
  prompt: string;
  mode: WebResultMode;
};

type PendingWebLogin = {
  nodeId: string;
  provider: WebProvider;
  reason: string;
};

type TransformMode = "pick" | "merge" | "template";

type TransformConfig = {
  mode?: TransformMode;
  pickPath?: string;
  mergeJson?: string;
  template?: string;
};

type GateConfig = {
  decisionPath?: string;
  passNodeId?: string;
  rejectNodeId?: string;
  schemaJson?: string;
};

const APPROVAL_DECISIONS: ApprovalDecision[] = ["accept", "acceptForSession", "decline", "cancel"];
const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
const DEFAULT_STAGE_WIDTH = 1400;
const DEFAULT_STAGE_HEIGHT = 900;
const STAGE_GROW_MARGIN = 120;
const STAGE_GROW_LIMIT = 720;
const MAX_STAGE_WIDTH = 4200;
const MAX_STAGE_HEIGHT = 3200;
const GRAPH_STAGE_INSET_X = 90;
const GRAPH_STAGE_INSET_Y = 150;
const MIN_CANVAS_ZOOM = 0.6;
const MAX_CANVAS_ZOOM = 1.8;
const QUESTION_INPUT_MAX_HEIGHT = 132;
const NODE_DRAG_MARGIN = 60;
const NODE_ANCHOR_OFFSET = 15;
const FALLBACK_TURN_ROLE = "GENERAL AGENT";
const GRAPH_SCHEMA_VERSION = 3;
const KNOWLEDGE_DEFAULT_TOP_K = 0;
const KNOWLEDGE_DEFAULT_MAX_CHARS = 2800;
const QUALITY_DEFAULT_THRESHOLD = 70;
const FEED_REDACTION_RULE_VERSION = "feed-v1";
const FEED_ATTACHMENT_CHAR_CAP = 12_000;
const FEED_STEP_PLACEHOLDER = "실행 로그 요약 없음";
const AUTO_LAYOUT_START_X = 40;
const AUTO_LAYOUT_START_Y = 40;
const AUTO_LAYOUT_COLUMN_GAP = 320;
const AUTO_LAYOUT_ROW_GAP = 184;
const AUTO_LAYOUT_SNAP_THRESHOLD = 44;
const AUTO_LAYOUT_DRAG_SNAP_THRESHOLD = 36;
const AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD = 38;
const AUTO_EDGE_STRAIGHTEN_THRESHOLD = 72;
const AGENT_RULE_CACHE_TTL_MS = 12_000;
const AGENT_RULE_MAX_DOCS = 16;
const AGENT_RULE_MAX_DOC_CHARS = 6_000;
const AUTH_LOGIN_REQUIRED_CONFIRM_COUNT = 3;
const AUTH_LOGIN_REQUIRED_GRACE_MS = 120_000;
const CODEX_LOGIN_COOLDOWN_MS = 45_000;
const SIMPLE_WORKFLOW_UI = true;
const KNOWLEDGE_TOP_K_OPTIONS: FancySelectOption[] = [
  { value: "0", label: "0개" },
  { value: "1", label: "1개" },
  { value: "2", label: "2개" },
  { value: "3", label: "3개" },
  { value: "4", label: "4개" },
  { value: "5", label: "5개" },
];
const KNOWLEDGE_MAX_CHARS_OPTIONS: FancySelectOption[] = [
  { value: "1600", label: "짧게 (빠름)" },
  { value: "2800", label: "보통 (균형)" },
  { value: "4000", label: "길게 (정밀)" },
  { value: "5600", label: "아주 길게 (최대)" },
];
const TURN_EXECUTOR_OPTIONS = [
  "codex",
  "web_gemini",
  "web_gpt",
  "web_grok",
  "web_perplexity",
  "web_claude",
  "ollama",
] as const;
const TURN_EXECUTOR_LABELS: Record<TurnExecutor, string> = {
  codex: "Codex",
  web_gemini: "WEB / GEMINI",
  web_gpt: "WEB / GPT",
  web_grok: "WEB / GROK",
  web_perplexity: "WEB / PERPLEXITY",
  web_claude: "WEB / CLAUDE",
  ollama: "Ollama (로컬)",
};
const WEB_PROVIDER_OPTIONS: ReadonlyArray<WebProvider> = [
  "gemini",
  "gpt",
  "grok",
  "perplexity",
  "claude",
];
const TURN_MODEL_OPTIONS = [
  "GPT-5.3-Codex",
  "GPT-5.3-Codex-Spark",
  "GPT-5.2-Codex",
  "GPT-5.1-Codex-Max",
  "GPT-5.2",
  "GPT-5.1-Codex-Mini",
] as const;
const DEFAULT_TURN_MODEL = TURN_MODEL_OPTIONS[0];
const WORKSPACE_CWD_STORAGE_KEY = "rail.settings.cwd";
const LOGIN_COMPLETED_STORAGE_KEY = "rail.settings.login_completed";
const AUTH_MODE_STORAGE_KEY = "rail.settings.auth_mode";
const COST_PRESET_OPTIONS: FancySelectOption[] = [
  { value: "conservative", label: "고사양 (품질 우선)" },
  { value: "balanced", label: "보통 (기본)" },
  { value: "aggressive", label: "저사양 (사용량 절감)" },
];
const COST_PRESET_DEFAULT_MODEL: Record<CostPreset, (typeof TURN_MODEL_OPTIONS)[number]> = {
  conservative: "GPT-5.3-Codex",
  balanced: "GPT-5.2-Codex",
  aggressive: "GPT-5.1-Codex-Mini",
};
const TURN_MODEL_CANONICAL_PAIRS: Array<{ display: string; engine: string }> = [
  { display: "GPT-5.3-Codex", engine: "gpt-5.3-codex" },
  { display: "GPT-5.3-Codex-Spark", engine: "gpt-5.3-codex-spark" },
  { display: "GPT-5.2-Codex", engine: "gpt-5.2-codex" },
  { display: "GPT-5.1-Codex-Max", engine: "gpt-5.1-codex-max" },
  { display: "GPT-5.2", engine: "gpt-5.2" },
  { display: "GPT-5.1-Codex-Mini", engine: "gpt-5.1-codex-mini" },
];
const NODE_ANCHOR_SIDES: NodeAnchorSide[] = ["top", "right", "bottom", "left"];
const QUALITY_PROFILE_OPTIONS: FancySelectOption[] = [
  { value: "code_implementation", label: "코드 구현" },
  { value: "research_evidence", label: "자료/근거 검증" },
  { value: "design_planning", label: "설계/기획" },
  { value: "synthesis_final", label: "최종 종합" },
  { value: "generic", label: "일반" },
];
const QUALITY_THRESHOLD_MIN = 10;
const QUALITY_THRESHOLD_MAX = 100;
const QUALITY_THRESHOLD_STEP = 10;
const QUALITY_THRESHOLD_OPTIONS: FancySelectOption[] = Array.from(
  { length: (QUALITY_THRESHOLD_MAX - QUALITY_THRESHOLD_MIN) / QUALITY_THRESHOLD_STEP + 1 },
  (_, index) => {
    const score = QUALITY_THRESHOLD_MIN + index * QUALITY_THRESHOLD_STEP;
    return { value: String(score), label: `${score}점` };
  },
);

function normalizeQualityThreshold(value: unknown): number {
  const parsed = Number(value);
  const fallback = QUALITY_DEFAULT_THRESHOLD;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(QUALITY_THRESHOLD_MIN, Math.min(QUALITY_THRESHOLD_MAX, safe));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}

function normalizeQualityScore(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}

const ARTIFACT_TYPE_OPTIONS: FancySelectOption[] = [
  { value: "none", label: "사용 안 함" },
  { value: "RequirementArtifact", label: "요구사항 아티팩트" },
  { value: "DesignArtifact", label: "설계 아티팩트" },
  { value: "TaskPlanArtifact", label: "작업계획 아티팩트" },
  { value: "ChangePlanArtifact", label: "변경계획 아티팩트" },
  { value: "EvidenceArtifact", label: "근거 아티팩트" },
];
const PRESET_TEMPLATE_META: ReadonlyArray<{ key: PresetKind; label: string; statusLabel: string }> = [
  { key: "validation", label: "정밀 검증 템플릿", statusLabel: "정밀 검증 템플릿" },
  { key: "development", label: "개발 실행 템플릿", statusLabel: "개발 실행 템플릿" },
  { key: "research", label: "근거 리서치 템플릿", statusLabel: "근거 리서치 템플릿" },
  { key: "expert", label: "전문가 분석 템플릿", statusLabel: "전문가 분석 템플릿" },
  { key: "unityGame", label: "유니티 게임개발 템플릿", statusLabel: "유니티 게임개발 템플릿" },
  { key: "fullstack", label: "풀스택 구현 템플릿", statusLabel: "풀스택 구현 템플릿" },
  { key: "creative", label: "창의 제작 템플릿", statusLabel: "창의 제작 템플릿" },
  { key: "newsTrend", label: "뉴스 트렌드 템플릿", statusLabel: "뉴스 트렌드 템플릿" },
];
const PRESET_TEMPLATE_OPTIONS: FancySelectOption[] = PRESET_TEMPLATE_META.map((row) => ({
  value: row.key,
  label: row.label,
}));

function formatUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const message = extractStringByPaths(error, [
      "message",
      "error",
      "details",
      "cause.message",
      "data.message",
    ]);
    if (message) {
      return message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return String(error);
}

function loadPersistedCwd(fallback = "."): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CWD_STORAGE_KEY);
    const parsed = typeof raw === "string" ? raw.trim() : "";
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function loadPersistedLoginCompleted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(LOGIN_COMPLETED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadPersistedAuthMode(): AuthMode {
  if (typeof window === "undefined") {
    return "unknown";
  }
  try {
    const raw = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    return extractAuthMode(raw ?? null) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function isEngineAlreadyStartedError(error: unknown): boolean {
  const lower = toErrorText(error).toLowerCase();
  return lower.includes("engine already started") || lower.includes("already started");
}

function toUsageCheckErrorMessage(error: unknown): string {
  const raw = toErrorText(error);
  const lower = raw.toLowerCase();

  if (
    (lower.includes("login") || lower.includes("auth")) &&
    (lower.includes("required") || lower.includes("unauthorized"))
  ) {
    return "로그인이 완료되지 않아 사용량을 조회할 수 없습니다. 설정에서 로그인 후 다시 시도해주세요.";
  }

  if (
    (lower.includes("unknown variant") || lower.includes("method not found")) &&
    (lower.includes("account/ratelimits/read") ||
      lower.includes("account/read") ||
      lower.includes("account/usage/get") ||
      lower.includes("account/usage") ||
      lower.includes("account/get") ||
      lower.includes("account/status"))
  ) {
    return "사용량 조회 API를 지원하지 않는 엔진 버전입니다. 엔진 실행/로그인은 정상이어도 사용량은 현재 버전에서 조회할 수 없습니다.";
  }

  if (lower.includes("not initialized")) {
    return "엔진 초기화가 아직 끝나지 않아 사용량 조회를 할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }

  if (
    lower.includes("engine not running") ||
    lower.includes("failed to spawn") ||
    lower.includes("broken pipe") ||
    lower.includes("connection reset") ||
    lower.includes("connection refused")
  ) {
    return "엔진 연결이 끊어져 사용량 조회에 실패했습니다. 엔진 상태를 확인하고 다시 시도해주세요.";
  }

  const compact = raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
  return `사용량 조회에 실패했습니다. 원인: ${compact}`;
}

function toOpenRunsFolderErrorMessage(error: unknown): string {
  const raw = toErrorText(error);
  const lower = raw.toLowerCase();

  if (lower.includes("not allowed") || lower.includes("permission")) {
    return "실행 기록 폴더를 열 권한이 없습니다. 앱 권한 설정을 확인해주세요.";
  }
  if (lower.includes("not found") || lower.includes("no such file")) {
    return "실행 기록 폴더를 찾지 못했습니다. 먼저 실행 기록을 생성해주세요.";
  }
  return `실행 기록 폴더 열기 실패: ${raw}`;
}

function toTurnModelDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_TURN_MODEL;
  }
  const lower = trimmed.toLowerCase();
  const matched = TURN_MODEL_CANONICAL_PAIRS.find(
    (entry) => entry.engine === lower || entry.display.toLowerCase() === lower,
  );
  return matched?.display ?? trimmed;
}

function toTurnModelEngineId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return TURN_MODEL_CANONICAL_PAIRS[0].engine;
  }
  const lower = trimmed.toLowerCase();
  const matched = TURN_MODEL_CANONICAL_PAIRS.find(
    (entry) => entry.engine === lower || entry.display.toLowerCase() === lower,
  );
  if (matched) {
    return matched.engine;
  }
  if (lower.startsWith("gpt-")) {
    return lower;
  }
  return trimmed;
}

function isCostPreset(value: string): value is CostPreset {
  return value === "conservative" || value === "balanced" || value === "aggressive";
}

function isPresetKind(value: string): value is PresetKind {
  return PRESET_TEMPLATE_META.some((row) => row.key === value);
}

function costPresetLabel(preset: CostPreset): string {
  return COST_PRESET_OPTIONS.find((entry) => entry.value === preset)?.label ?? preset;
}

function isCriticalTurnNode(node: GraphNode): boolean {
  if (node.type !== "turn") {
    return false;
  }
  const config = node.config as TurnConfig;
  const signal = `${node.id} ${String(config.role ?? "")} ${String(config.promptTemplate ?? "")}`.toLowerCase();
  return /final|synth|judge|evaluat|quality|verif|검증|평가|판정|최종|합성/.test(signal);
}

function getCostPresetTargetModel(preset: CostPreset, isCritical: boolean): (typeof TURN_MODEL_OPTIONS)[number] {
  if (preset === "conservative") {
    return "GPT-5.3-Codex";
  }
  if (preset === "balanced") {
    return isCritical ? "GPT-5.3-Codex" : "GPT-5.2-Codex";
  }
  return isCritical ? "GPT-5.2-Codex" : "GPT-5.1-Codex-Mini";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  return Boolean(target.closest("[contenteditable='true']"));
}

function isNodeDragAllowedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target.closest(
      "button, input, textarea, select, a, .node-anchor, .fancy-select, .fancy-select-menu",
    )
  ) {
    return false;
  }
  return true;
}

function extractDeltaText(input: unknown, depth = 0): string {
  if (depth > 3 || input == null) {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => extractDeltaText(item, depth + 1)).join("");
  }

  if (typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;

  if (typeof record.delta === "string") {
    return record.delta;
  }
  if (typeof record.text === "string") {
    return record.text;
  }

  const candidates = [record.delta, record.content, record.item, record.message, record.data];
  return candidates.map((candidate) => extractDeltaText(candidate, depth + 1)).join("");
}

function extractAuthMode(input: unknown, depth = 0): AuthMode | null {
  if (depth > 4 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (normalized === "chatgpt") {
      return "chatgpt";
    }
    if (normalized === "apikey" || normalized === "api_key" || normalized === "api-key") {
      return "apikey";
    }
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const mode = extractAuthMode(item, depth + 1);
      if (mode) {
        return mode;
      }
    }
    return null;
  }
  if (typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.authMode === "string") {
    return extractAuthMode(record.authMode, depth + 1);
  }
  if (typeof record.auth_mode === "string") {
    return extractAuthMode(record.auth_mode, depth + 1);
  }

  const candidates = [record.account, record.user, record.data, record.payload];
  for (const candidate of candidates) {
    const mode = extractAuthMode(candidate, depth + 1);
    if (mode) {
      return mode;
    }
  }
  return null;
}

function extractCompletedStatus(input: unknown, depth = 0): string | null {
  if (depth > 4 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    return input;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const status = extractCompletedStatus(item, depth + 1);
      if (status) {
        return status;
      }
    }
    return null;
  }
  if (typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.status === "string") {
    return record.status;
  }
  const candidates = [record.item, record.result, record.data, record.payload, record.output];
  for (const candidate of candidates) {
    const status = extractCompletedStatus(candidate, depth + 1);
    if (status) {
      return status;
    }
  }
  return null;
}

function extractStringByPaths(value: unknown, paths: string[]): string | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  const root = value as Record<string, unknown>;
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = root;
    let ok = true;

    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        ok = false;
        break;
      }
    }

    if (ok && typeof current === "string") {
      return current;
    }
  }

  return null;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function closestNumericOptionValue(
  options: FancySelectOption[],
  current: number,
  fallback: number,
): string {
  const parsed = options
    .map((option) => Number(option.value))
    .filter((value) => Number.isFinite(value));
  if (parsed.length === 0) {
    return String(fallback);
  }
  if (parsed.includes(current)) {
    return String(current);
  }
  let nearest = parsed[0] ?? fallback;
  let nearestDistance = Math.abs(current - nearest);
  for (let index = 1; index < parsed.length; index += 1) {
    const candidate = parsed[index];
    const distance = Math.abs(current - candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return String(nearest);
}

function findUsageObject(input: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5 || input == null || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const hasTokenKeys = [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "prompt_tokens",
    "completion_tokens",
    "inputTokens",
    "outputTokens",
    "totalTokens",
  ].some((key) => key in record);
  if (hasTokenKeys) {
    return record;
  }

  const children = [
    record.usage,
    record.metrics,
    record.tokenUsage,
    record.result,
    record.item,
    record.data,
    record.payload,
    record.output,
    record.completion,
  ];
  for (const child of children) {
    const found = findUsageObject(child, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

function extractUsageStats(input: unknown): UsageStats | undefined {
  const usage = findUsageObject(input);
  if (!usage) {
    return undefined;
  }

  const inputTokens =
    readNumber(usage.input_tokens) ??
    readNumber(usage.prompt_tokens) ??
    readNumber(usage.inputTokens) ??
    readNumber(usage.promptTokens);
  const outputTokens =
    readNumber(usage.output_tokens) ??
    readNumber(usage.completion_tokens) ??
    readNumber(usage.outputTokens) ??
    readNumber(usage.completionTokens);
  const totalTokens = readNumber(usage.total_tokens) ?? readNumber(usage.totalTokens);

  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)),
  };
}

function formatDuration(durationMs?: number): string {
  if (durationMs == null || durationMs < 0) {
    return "-";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}초`;
}

function formatNodeElapsedTime(runState: NodeRunState | undefined, nowMs: number): string {
  if (!runState) {
    return "-";
  }
  if (runState.durationMs != null && runState.durationMs >= 0) {
    return formatDuration(runState.durationMs);
  }
  if (!runState.startedAt) {
    return "-";
  }
  const startedAtMs = new Date(runState.startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return "-";
  }
  const finishedAtMs = runState.finishedAt ? new Date(runState.finishedAt).getTime() : Number.NaN;
  const endMs = Number.isFinite(finishedAtMs) ? finishedAtMs : nowMs;
  return formatDuration(Math.max(0, endMs - startedAtMs));
}

function formatUsage(usage?: UsageStats): string {
  if (!usage) {
    return "-";
  }
  const total = usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
  const inputText = usage.inputTokens != null ? `${usage.inputTokens}` : "-";
  const outputText = usage.outputTokens != null ? `${usage.outputTokens}` : "-";
  return `${total}토큰 (입력 ${inputText} / 출력 ${outputText})`;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function formatResetAt(input: unknown): string {
  const raw = readNumber(input);
  if (raw == null || raw <= 0) {
    return "-";
  }
  const date = new Date(raw * 1000);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("ko-KR", { hour12: false });
}

function formatRunDateTime(input?: string | null): string {
  if (!input) {
    return "-";
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }
  return date.toLocaleString("ko-KR", {
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function formatRunFileLabel(fileName?: string | null): string {
  if (!fileName) {
    return "";
  }
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toUpperCase();
}

function feedPostStatusLabel(status: FeedPostStatus): string {
  switch (status) {
    case "draft":
      return "작업중";
    case "done":
      return "완료";
    case "failed":
      return "오류";
    case "cancelled":
      return "취소";
    default:
      return status;
  }
}

function sanitizeShareTitle(input: string): string {
  const compact = input
    .trim()
    .replace(/[\\/:*?"<>|#^\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return compact || "rail-share";
}

function hashStringToHue(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function buildFeedAvatarLabel(post: FeedViewPost): string {
  const source = post.agentName?.trim() || post.roleLabel?.trim() || post.nodeId;
  return source.slice(0, 1).toUpperCase() || "A";
}

function formatUsedPercent(input: unknown): string {
  const value = readNumber(input);
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }
  const percentText = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  return `${percentText}%`;
}

function formatCreditSummary(input: unknown): string {
  const credits = asRecord(input);
  if (!credits) {
    return "-";
  }
  const balance =
    typeof credits.balance === "string" || typeof credits.balance === "number"
      ? String(credits.balance)
      : "-";
  const hasCredits = credits.hasCredits === true;
  const unlimited = credits.unlimited === true;
  if (unlimited) {
    return "무제한";
  }
  if (!hasCredits) {
    return "없음";
  }
  return `잔액 ${balance}`;
}

function formatRateLimitBlock(title: string, source: Record<string, unknown>): string[] {
  const lines: string[] = [title];
  const planType = typeof source.planType === "string" && source.planType.trim() ? source.planType : "-";
  const limitId = typeof source.limitId === "string" && source.limitId.trim() ? source.limitId : "-";
  lines.push(`- 요금제: ${planType}`);
  lines.push(`- 한도 ID: ${limitId}`);
  lines.push(`- 크레딧: ${formatCreditSummary(source.credits)}`);

  const primary = asRecord(source.primary);
  if (primary) {
    lines.push(
      `- 기본 윈도우 (5시간): 사용량 ${formatUsedPercent(primary.usedPercent)} / 리셋 ${formatResetAt(primary.resetsAt)}`,
    );
  }
  const secondary = asRecord(source.secondary);
  if (secondary) {
    lines.push(
      `- 보조 윈도우 (1주일): 사용량 ${formatUsedPercent(secondary.usedPercent)} / 리셋 ${formatResetAt(secondary.resetsAt)}`,
    );
  }
  return lines;
}

function formatUsageInfoForDisplay(raw: unknown): string {
  const root = asRecord(raw);
  if (!root) {
    return JSON.stringify(raw, null, 2);
  }

  const lines: string[] = [];
  const tokenUsage = extractUsageStats(raw);
  if (tokenUsage) {
    lines.push(`토큰 사용량: ${formatUsage(tokenUsage)}`);
  }
  const rateLimits = asRecord(root.rateLimits);
  if (rateLimits) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(...formatRateLimitBlock("현재 한도", rateLimits));
  }

  const byLimitId = asRecord(root.rateLimitsByLimitId);
  if (byLimitId) {
    const entries = Object.entries(byLimitId)
      .map(([limitKey, value]) => {
        const item = asRecord(value);
        if (!item) {
          return null;
        }
        const rawName = typeof item.limitName === "string" ? item.limitName.trim() : "";
        const rawId =
          typeof item.limitId === "string" && item.limitId.trim() ? item.limitId.trim() : limitKey.trim();
        const name = rawName || rawId || limitKey;
        const header = rawId && rawId !== name ? `${name} (${rawId})` : name;
        return { header, item };
      })
      .filter((entry): entry is { header: string; item: Record<string, unknown> } => entry != null);

    if (entries.length > 0) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push("모델별 한도");
      for (const entry of entries) {
        lines.push(...formatRateLimitBlock(`• ${entry.header}`, entry.item));
        lines.push("");
      }
      if (lines[lines.length - 1] === "") {
        lines.pop();
      }
    }
  }

  if (lines.length === 0) {
    return JSON.stringify(raw, null, 2);
  }
  return lines.join("\n");
}

function redactSensitiveText(input: string): string {
  let next = input;
  next = next.replace(/(sk-[A-Za-z0-9_-]{8,})/g, "sk-***");
  next = next.replace(/(bearer\s+)[A-Za-z0-9._\-+/=]{10,}/gi, "$1***");
  next = next.replace(/([?&](?:token|auth|key|api_key|access_token|session|jwt)=)[^&\s]+/gi, "$1***");
  next = next.replace(/(cookie|set-cookie)\s*[:=]\s*[^\r\n;]+/gi, "$1=***");
  next = next.replace(/\/Users\/([^/\s]+)/g, "/Users/***");
  return next;
}

function clipTextByChars(input: string, maxChars = FEED_ATTACHMENT_CHAR_CAP): {
  text: string;
  truncated: boolean;
  charCount: number;
} {
  const text = input ?? "";
  const charCount = text.length;
  if (charCount <= maxChars) {
    return { text, truncated: false, charCount };
  }
  return {
    text: `${text.slice(0, maxChars)}\n\n...[중략: ${charCount - maxChars}자 생략]`,
    truncated: true,
    charCount,
  };
}

function summarizeFeedSteps(logs: string[]): string[] {
  const steps: string[] = [];
  const pushStep = (label: string) => {
    if (!steps.includes(label)) {
      steps.push(label);
    }
  };
  for (const line of logs) {
    const lower = line.toLowerCase();
    if (lower.includes("[첨부]")) {
      pushStep("첨부 근거 반영");
    }
    if (lower.includes("[web]") && lower.includes("로그인")) {
      pushStep("웹 로그인 확인");
    }
    if (lower.includes("[web]") && (lower.includes("자동화") || lower.includes("응답"))) {
      pushStep("웹 자동화 실행");
    }
    if (lower.includes("turn_interrupt") || lower.includes("취소")) {
      pushStep("사용자 중지 요청");
    }
    if (lower.includes("[품질]")) {
      pushStep("품질 검증");
    }
    if (lower.includes("변환 완료")) {
      pushStep("결과 변환");
    }
    if (lower.includes("분기 결과")) {
      pushStep("분기 판정");
    }
    if (lower.includes("실패") || lower.includes("오류")) {
      pushStep("오류 처리");
    }
    if (lower.includes("턴 실행 완료") || lower.includes("완료")) {
      pushStep("완료");
    }
    if (steps.length >= 5) {
      break;
    }
  }
  return normalizeFeedSteps(steps).slice(0, 5);
}

function normalizeFeedSteps(steps: string[]): string[] {
  const placeholderCompact = FEED_STEP_PLACEHOLDER.replace(/\s+/g, "");
  const seen = new Set<string>();
  return steps
    .map((step) => step.trim())
    .map((step) => step.replace(/^[-•·\s]+/, "").replace(/[.。!！:：]+$/, "").trim())
    .filter((step) => {
      if (!step) {
        return false;
      }
      const compact = step.replace(/\s+/g, "");
      if (compact.includes(placeholderCompact)) {
        return false;
      }
      if (seen.has(step)) {
        return false;
      }
      seen.add(step);
      return true;
    });
}

function buildFeedSummary(status: FeedPostStatus, output: unknown, error?: string, summary?: string): string {
  const trimmedSummary = (summary ?? "").trim();
  if (trimmedSummary) {
    return trimmedSummary;
  }
  if (status === "draft") {
    return "에이전트가 현재 작업 중입니다.";
  }
  if (status !== "done") {
    return error?.trim() || "실행 실패로 상세 로그 확인이 필요합니다.";
  }
  const outputText = extractFinalAnswer(output).trim();
  if (!outputText) {
    return "실행은 완료되었지만 표시할 결과 텍스트가 없습니다.";
  }
  return outputText.length > 360 ? `${outputText.slice(0, 360)}...` : outputText;
}

function buildFeedPost(input: FeedBuildInput): {
  post: FeedPost;
  rawAttachments: Record<FeedAttachmentKind, string>;
} {
  const config = input.node.config as TurnConfig;
  const roleLabel = input.node.type === "turn" ? turnRoleLabel(input.node) : nodeTypeLabel(input.node.type);
  const agentName =
    input.node.type === "turn"
      ? turnModelLabel(input.node)
      : input.node.type === "transform"
        ? "데이터 변환"
        : "결정 분기";
  const logs = input.logs ?? [];
  const steps = summarizeFeedSteps(logs);
  const summary = buildFeedSummary(input.status, input.output, input.error, input.summary);
  const outputText = extractFinalAnswer(input.output).trim() || stringifyInput(input.output).trim();
  const logsText = logs.length > 0 ? logs.join("\n") : "(로그 없음)";
  const markdownRaw = [
    `# ${agentName}`,
    `- 상태: ${nodeStatusLabel(input.status as NodeExecutionStatus)}`,
    `- 역할: ${roleLabel}`,
    "",
    "## 요약",
    summary || "(없음)",
    "",
    "## 단계 요약",
    ...steps.map((step) => `- ${step}`),
    "",
    "## 핵심 결과",
    outputText || "(출력 없음)",
    "",
    "## 노드 로그",
    logsText,
    "",
    "## 참고",
    "- 이 문서는 실행 결과를 자동 요약해 생성되었습니다.",
  ].join("\n");

  const jsonRaw = JSON.stringify(
    {
      nodeId: input.node.id,
      nodeType: input.node.type,
      status: input.status,
      summary,
      steps,
      output: input.output ?? null,
      logs,
      error: input.error ?? null,
      evidence: {
        durationMs: input.durationMs,
        usage: input.usage,
        qualityScore: input.qualityReport?.score,
        qualityDecision: input.qualityReport?.decision,
      },
    },
    null,
    2,
  );

  const markdownClip = clipTextByChars(markdownRaw);
  const jsonClip = clipTextByChars(jsonRaw);

  const markdownMasked = redactSensitiveText(markdownClip.text);
  const jsonMasked = redactSensitiveText(jsonClip.text);

  const post: FeedPost = {
    id: `${input.runId}:${input.node.id}:${input.status}`,
    runId: input.runId,
    nodeId: input.node.id,
    nodeType: input.node.type,
    executor: input.node.type === "turn" ? getTurnExecutor(config) : undefined,
    agentName,
    roleLabel,
    status: input.status,
    createdAt: input.createdAt,
    summary,
    steps,
    evidence: {
      durationMs: input.durationMs,
      usage: input.usage,
      qualityScore: input.qualityReport?.score,
      qualityDecision: input.qualityReport?.decision,
    },
    attachments: [
      {
        kind: "markdown",
        title: "요약 문서 (Markdown)",
        content: markdownMasked,
        truncated: markdownClip.truncated,
        charCount: markdownClip.charCount,
      },
      {
        kind: "json",
        title: "구조화 결과 (JSON)",
        content: jsonMasked,
        truncated: jsonClip.truncated,
        charCount: jsonClip.charCount,
      },
    ],
    redaction: {
      masked: true,
      ruleVersion: FEED_REDACTION_RULE_VERSION,
    },
  };

  return {
    post,
    rawAttachments: {
      markdown: markdownClip.text,
      json: jsonClip.text,
    },
  };
}

function normalizeRunFeedPosts(run: RunRecord): FeedPost[] {
  if (Array.isArray(run.feedPosts) && run.feedPosts.length > 0) {
    return run.feedPosts;
  }
  const nodeMap = new Map(run.graphSnapshot.nodes.map((node) => [node.id, node]));
  const terminalMap = new Map<string, RunTransition>();
  for (const transition of run.transitions) {
    if (transition.status !== "done" && transition.status !== "failed" && transition.status !== "cancelled") {
      continue;
    }
    const prev = terminalMap.get(transition.nodeId);
    if (!prev || new Date(transition.at).getTime() >= new Date(prev.at).getTime()) {
      terminalMap.set(transition.nodeId, transition);
    }
  }

  const posts: FeedPost[] = [];
  for (const [nodeId, transition] of terminalMap.entries()) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }
    const logs = run.nodeLogs?.[nodeId] ?? [];
    const metric = run.nodeMetrics?.[nodeId];
    const built = buildFeedPost({
      runId: run.runId,
      node,
      status: transition.status as FeedTerminalStatus,
      createdAt: transition.at,
      summary: transition.message,
      logs,
      output: {
        nodeId,
        status: transition.status,
        message: transition.message ?? "",
        logs: logs.slice(-10),
      },
      error: transition.status === "failed" ? transition.message : undefined,
      qualityReport: metric
        ? {
            profile: metric.profile,
            threshold: metric.threshold,
            score: metric.score,
            decision: metric.decision,
            checks: [],
            failures: [],
            warnings: [],
          }
        : undefined,
    });
    posts.push(built.post);
  }

  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return posts;
}

function normalizeRunRecord(run: RunRecord): RunRecord {
  const feedPosts = normalizeRunFeedPosts(run);
  return {
    ...run,
    feedPosts,
  };
}

function feedAttachmentRawKey(postId: string, kind: FeedAttachmentKind): string {
  return `${postId}:${kind}`;
}

function toQualityProfileId(value: unknown): QualityProfileId | null {
  if (
    value === "code_implementation" ||
    value === "research_evidence" ||
    value === "design_planning" ||
    value === "synthesis_final" ||
    value === "generic"
  ) {
    return value;
  }
  return null;
}

function inferQualityProfile(node: GraphNode, config: TurnConfig): QualityProfileId {
  const explicit = toQualityProfileId(config.qualityProfile);
  if (explicit) {
    return explicit;
  }

  const executor = getTurnExecutor(config);
  const signal = `${String(config.role ?? "")} ${String(config.promptTemplate ?? "")} ${node.id}`.toLowerCase();
  if (
    executor === "web_gemini" ||
    executor === "web_gpt" ||
    executor === "web_grok" ||
    executor === "web_perplexity" ||
    executor === "web_claude"
  ) {
    return "research_evidence";
  }
  if (/impl|code|test|lint|build|refactor|fix|bug|개발|구현|코드/.test(signal)) {
    return "code_implementation";
  }
  if (/research|evidence|search|fact|source|검증|자료|근거|조사/.test(signal)) {
    return "research_evidence";
  }
  if (/design|plan|architecture|요구|설계|기획/.test(signal)) {
    return "design_planning";
  }
  if (/final|synth|judge|평가|최종|합성/.test(signal)) {
    return "synthesis_final";
  }
  return "generic";
}

function toArtifactType(value: unknown): ArtifactType {
  if (
    value === "RequirementArtifact" ||
    value === "DesignArtifact" ||
    value === "TaskPlanArtifact" ||
    value === "ChangePlanArtifact" ||
    value === "EvidenceArtifact"
  ) {
    return value;
  }
  return "none";
}

function parseQualityCommands(input: unknown): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeArtifactOutput(
  nodeId: string,
  artifactType: ArtifactType,
  rawOutput: unknown,
): { output: unknown; warnings: string[] } {
  if (artifactType === "none") {
    return { output: rawOutput, warnings: [] };
  }

  let payload: unknown = rawOutput;
  if (typeof rawOutput === "string") {
    const text = rawOutput.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { text };
      }
    } else {
      payload = { text };
    }
  }

  const warnings: string[] = [];
  if (payload == null || typeof payload !== "object") {
    payload = { text: stringifyInput(rawOutput) };
    warnings.push("아티팩트 변환: 구조화된 출력이 없어 텍스트 기반으로 보정했습니다.");
  }

  const envelope = {
    artifactType,
    version: "v1",
    authorNodeId: nodeId,
    createdAt: new Date().toISOString(),
    payload,
  };

  return {
    output: {
      artifact: envelope,
      text: extractFinalAnswer(rawOutput) || stringifyInput(rawOutput),
      raw: rawOutput,
    },
    warnings,
  };
}

async function buildQualityReport(params: {
  node: GraphNode;
  config: TurnConfig;
  output: unknown;
  cwd: string;
}): Promise<QualityReport> {
  const { node, config, output, cwd } = params;
  const profile = inferQualityProfile(node, config);
  const threshold = normalizeQualityThreshold(config.qualityThreshold ?? QUALITY_DEFAULT_THRESHOLD);
  const checks: QualityCheck[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const fullText = extractFinalAnswer(output) || stringifyInput(output);
  const normalized = fullText.toLowerCase();

  const addCheck = (input: {
    id: string;
    label: string;
    kind: string;
    required: boolean;
    passed: boolean;
    penalty: number;
    detail?: string;
  }) => {
    if (!input.passed) {
      score = Math.max(0, score - input.penalty);
      if (input.required) {
        failures.push(input.label);
      }
    }
    checks.push({
      id: input.id,
      label: input.label,
      kind: input.kind,
      required: input.required,
      passed: input.passed,
      scoreDelta: input.passed ? 0 : -input.penalty,
      detail: input.detail,
    });
  };

  addCheck({
    id: "non_empty",
    label: "응답 비어있지 않음",
    kind: "structure",
    required: true,
    passed: fullText.trim().length > 0,
    penalty: 40,
  });

  addCheck({
    id: "minimum_length",
    label: "최소 설명 길이",
    kind: "structure",
    required: false,
    passed: fullText.trim().length >= 120,
    penalty: 10,
    detail: "120자 미만이면 요약 부족으로 감점",
  });

  if (profile === "research_evidence") {
    addCheck({
      id: "source_signal",
      label: "근거/출처 신호 포함",
      kind: "evidence",
      required: true,
      passed: /(source|출처|근거|http|https|reference)/i.test(fullText),
      penalty: 20,
    });
    addCheck({
      id: "uncertainty_signal",
      label: "한계/불확실성 표기",
      kind: "consistency",
      required: false,
      passed: /(한계|불확실|리스크|위험|counter|반례|제약)/i.test(fullText),
      penalty: 10,
    });
  } else if (profile === "design_planning") {
    const hits = ["목표", "제약", "리스크", "우선순위", "아키텍처", "scope", "milestone"].filter((key) =>
      normalized.includes(key.toLowerCase()),
    ).length;
    addCheck({
      id: "design_sections",
      label: "설계 핵심 항목 포함",
      kind: "structure",
      required: true,
      passed: hits >= 3,
      penalty: 20,
      detail: "목표/제약/리스크/우선순위 등 3개 이상 필요",
    });
  } else if (profile === "synthesis_final") {
    const hits = ["결론", "근거", "한계", "다음 단계", "실행", "체크리스트"].filter((key) =>
      normalized.includes(key.toLowerCase()),
    ).length;
    addCheck({
      id: "final_structure",
      label: "최종 답변 구조 충족",
      kind: "structure",
      required: true,
      passed: hits >= 3,
      penalty: 20,
      detail: "결론/근거/한계/다음 단계 중 3개 이상",
    });
  } else if (profile === "code_implementation") {
    addCheck({
      id: "code_plan_signal",
      label: "코드/파일/테스트 계획 포함",
      kind: "structure",
      required: true,
      passed: /(file|파일|test|테스트|lint|build|patch|module|class|function)/i.test(fullText),
      penalty: 20,
    });

    if (config.qualityCommandEnabled) {
      const commands = parseQualityCommands(config.qualityCommands);
      if (commands.length === 0) {
        warnings.push("품질 명령 실행이 켜져 있지만 명령 목록이 비어 있습니다.");
      } else {
        try {
          const commandResults = await invoke<QualityCommandResult[]>("quality_run_checks", {
            commands,
            cwd,
          });
          const failed = commandResults.find((row) => row.exitCode !== 0);
          addCheck({
            id: "local_commands",
            label: "로컬 품질 명령 통과",
            kind: "local_command",
            required: true,
            passed: !failed,
            penalty: 30,
            detail: failed ? `${failed.name} 실패(exit=${failed.exitCode})` : "모든 명령 성공",
          });
          for (const row of commandResults) {
            if (row.exitCode !== 0 && row.stderrTail.trim()) {
              warnings.push(`[${row.name}] ${row.stderrTail}`);
            }
          }
        } catch (error) {
          addCheck({
            id: "local_commands",
            label: "로컬 품질 명령 통과",
            kind: "local_command",
            required: true,
            passed: false,
            penalty: 30,
            detail: String(error),
          });
        }
      }
    }
  }

  const normalizedScore = normalizeQualityScore(score);
  const decision: "PASS" | "REJECT" = normalizedScore >= threshold ? "PASS" : "REJECT";

  return {
    profile,
    threshold,
    score: normalizedScore,
    decision,
    checks,
    failures,
    warnings,
  };
}

function summarizeQualityMetrics(nodeMetrics: Record<string, NodeMetric>): QualitySummary {
  const rows = Object.values(nodeMetrics);
  if (rows.length === 0) {
    return { avgScore: 0, passRate: 0, totalNodes: 0, passNodes: 0 };
  }
  const passNodes = rows.filter((row) => row.decision === "PASS").length;
  const avgScore = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  const passRate = passNodes / rows.length;
  return {
    avgScore: Math.round(avgScore * 100) / 100,
    passRate: Math.round(passRate * 10000) / 100,
    totalNodes: rows.length,
    passNodes,
  };
}

function getByPath(input: unknown, path: string): unknown {
  if (!path.trim()) {
    return input;
  }

  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function stringifyInput(input: unknown): string {
  if (input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  return formatUnknown(input);
}

function replaceInputPlaceholder(template: string, value: string): string {
  return template.split("{{input}}").join(value);
}

function buildForcedAgentRuleBlock(docs: AgentRuleDoc[]): string {
  if (docs.length === 0) {
    return "";
  }

  const parts = docs.map((doc, index) => {
    const content = doc.content.trim();
    return `## 규칙 문서 ${index + 1}: ${doc.path}\n${content}`;
  });

  return [
    "[SYSTEM 강제 규칙]",
    "아래 AGENT/SKILL 규칙은 선택사항이 아니며 반드시 준수해야 합니다.",
    "규칙 충돌 시 문서에 명시된 우선순위를 따르고, 없으면 더 구체적인 규칙을 우선합니다.",
    "",
    ...parts,
    "[/SYSTEM 강제 규칙]",
  ].join("\n");
}

function defaultKnowledgeConfig(): KnowledgeConfig {
  return {
    files: [],
    topK: KNOWLEDGE_DEFAULT_TOP_K,
    maxChars: KNOWLEDGE_DEFAULT_MAX_CHARS,
  };
}

function normalizeKnowledgeStatus(input: unknown): KnowledgeFileStatus | undefined {
  if (input === "ready" || input === "missing" || input === "unsupported" || input === "error") {
    return input;
  }
  return undefined;
}

function normalizeKnowledgeFile(input: unknown): KnowledgeFileRef | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const row = input as Record<string, unknown>;
  const rawPath = String(row.path ?? "").trim();
  if (!rawPath) {
    return null;
  }

  const id = String(row.id ?? "").trim() || rawPath;
  const name = String(row.name ?? "").trim() || rawPath.split(/[\\/]/).pop() || rawPath;
  const ext = String(row.ext ?? "").trim();
  const enabled = typeof row.enabled === "boolean" ? row.enabled : true;
  const sizeBytes = readNumber(row.sizeBytes);
  const mtimeMs = readNumber(row.mtimeMs);
  const status = normalizeKnowledgeStatus(row.status);
  const statusMessage = typeof row.statusMessage === "string" ? row.statusMessage : undefined;

  return {
    id,
    name,
    path: rawPath,
    ext,
    enabled,
    sizeBytes,
    mtimeMs,
    status,
    statusMessage,
  };
}

function normalizeKnowledgeConfig(input: unknown): KnowledgeConfig {
  if (!input || typeof input !== "object") {
    return defaultKnowledgeConfig();
  }
  const row = input as Record<string, unknown>;
  const files = Array.isArray(row.files) ? row.files.map(normalizeKnowledgeFile).filter(Boolean) : [];
  const topK = Math.max(0, Math.min(5, readNumber(row.topK) ?? KNOWLEDGE_DEFAULT_TOP_K));
  const maxChars = Math.max(300, Math.min(20_000, readNumber(row.maxChars) ?? KNOWLEDGE_DEFAULT_MAX_CHARS));
  return {
    files: files as KnowledgeFileRef[],
    topK,
    maxChars,
  };
}

function cloneGraph(input: GraphData): GraphData {
  return {
    version: input.version,
    nodes: input.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      config: { ...node.config },
    })),
    edges: input.edges.map((edge) => ({
      from: { ...edge.from },
      to: { ...edge.to },
      control: edge.control ? { ...edge.control } : undefined,
    })),
    knowledge: {
      files: (input.knowledge?.files ?? []).map((file) => ({ ...file })),
      topK: input.knowledge?.topK ?? KNOWLEDGE_DEFAULT_TOP_K,
      maxChars: input.knowledge?.maxChars ?? KNOWLEDGE_DEFAULT_MAX_CHARS,
    },
  };
}

function graphEquals(a: GraphData, b: GraphData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildRoundedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  withArrow: boolean,
  fromSide: NodeAnchorSide,
  toSide: NodeAnchorSide,
): string {
  const toVector = (side: NodeAnchorSide): LogicalPoint => {
    if (side === "left") {
      return { x: -1, y: 0 };
    }
    if (side === "right") {
      return { x: 1, y: 0 };
    }
    if (side === "top") {
      return { x: 0, y: -1 };
    }
    return { x: 0, y: 1 };
  };

  const offsetPoint = (point: LogicalPoint, side: NodeAnchorSide, distance: number): LogicalPoint => {
    const vector = toVector(side);
    return { x: point.x + vector.x * distance, y: point.y + vector.y * distance };
  };

  const simplifyOrthogonalPoints = (points: LogicalPoint[]): LogicalPoint[] => {
    const compact: LogicalPoint[] = [];
    for (const point of points) {
      const prev = compact[compact.length - 1];
      if (!prev || Math.abs(prev.x - point.x) > 0.1 || Math.abs(prev.y - point.y) > 0.1) {
        compact.push(point);
      }
    }

    const simplified: LogicalPoint[] = [];
    for (const point of compact) {
      const mid = simplified[simplified.length - 1];
      const head = simplified[simplified.length - 2];
      if (!mid || !head) {
        simplified.push(point);
        continue;
      }
      const isCollinearX = Math.abs(head.x - mid.x) <= 0.1 && Math.abs(mid.x - point.x) <= 0.1;
      const isCollinearY = Math.abs(head.y - mid.y) <= 0.1 && Math.abs(mid.y - point.y) <= 0.1;
      if (isCollinearX || isCollinearY) {
        simplified[simplified.length - 1] = point;
      } else {
        simplified.push(point);
      }
    }
    return simplified;
  };

  const roundedPathFromPoints = (points: LogicalPoint[], radius: number): string => {
    if (points.length < 2) {
      return "";
    }
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const next = points[i + 1];

      const inVec = { x: cur.x - prev.x, y: cur.y - prev.y };
      const outVec = { x: next.x - cur.x, y: next.y - cur.y };
      const inLen = Math.hypot(inVec.x, inVec.y);
      const outLen = Math.hypot(outVec.x, outVec.y);
      if (inLen < 0.1 || outLen < 0.1) {
        d += ` L ${cur.x} ${cur.y}`;
        continue;
      }

      const corner = Math.min(radius, inLen / 2, outLen / 2);
      const p1 = {
        x: cur.x - (inVec.x / inLen) * corner,
        y: cur.y - (inVec.y / inLen) * corner,
      };
      const p2 = {
        x: cur.x + (outVec.x / outLen) * corner,
        y: cur.y + (outVec.y / outLen) * corner,
      };
      d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  };

  const start = { x: x1, y: y1 };
  const end = { x: x2, y: y2 };
  const alignedVertical =
    (fromSide === "top" || fromSide === "bottom") &&
    (toSide === "top" || toSide === "bottom") &&
    Math.abs(x1 - x2) <= 24;
  const alignedHorizontal =
    (fromSide === "left" || fromSide === "right") &&
    (toSide === "left" || toSide === "right") &&
    Math.abs(y1 - y2) <= 24;
  if (alignedVertical || alignedHorizontal) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const baseDistance = Math.hypot(end.x - start.x, end.y - start.y);
  if (baseDistance <= 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const arrowLead = withArrow ? 10 : 0;
  const startStubDistance = 24;
  const endStubDistance = 24 + arrowLead;
  const startStub = offsetPoint(start, fromSide, startStubDistance);
  const endStub = offsetPoint(end, toSide, -endStubDistance);

  const fromHorizontal = fromSide === "left" || fromSide === "right";
  const toHorizontal = toSide === "left" || toSide === "right";

  const points: LogicalPoint[] = [start, startStub];
  if (fromHorizontal && toHorizontal) {
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: startStub.y }, { x: midX, y: endStub.y });
  } else if (!fromHorizontal && !toHorizontal) {
    const midY = (start.y + end.y) / 2;
    points.push({ x: startStub.x, y: midY }, { x: endStub.x, y: midY });
  } else if (fromHorizontal && !toHorizontal) {
    points.push({ x: endStub.x, y: startStub.y });
  } else {
    points.push({ x: startStub.x, y: endStub.y });
  }
  points.push(endStub);

  if (withArrow && arrowLead > 0) {
    const leadPoint = offsetPoint(end, toSide, -arrowLead);
    points.push(leadPoint);
  }
  points.push(end);

  const simplified = simplifyOrthogonalPoints(points);
  return roundedPathFromPoints(simplified, 8);
}

function buildManualEdgePath(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1} ${y1} L ${cx} ${cy} L ${x2} ${y2}`;
}

function edgeMidPoint(start: LogicalPoint, end: LogicalPoint): LogicalPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function getNodeAnchorPoint(
  node: GraphNode,
  side: NodeAnchorSide,
  size?: NodeVisualSize,
): LogicalPoint {
  const width = size?.width ?? NODE_WIDTH;
  const height = size?.height ?? NODE_HEIGHT;

  if (side === "top") {
    return { x: node.position.x + width / 2, y: node.position.y - NODE_ANCHOR_OFFSET };
  }
  if (side === "right") {
    return { x: node.position.x + width + NODE_ANCHOR_OFFSET, y: node.position.y + height / 2 };
  }
  if (side === "bottom") {
    return { x: node.position.x + width / 2, y: node.position.y + height + NODE_ANCHOR_OFFSET };
  }
  return { x: node.position.x - NODE_ANCHOR_OFFSET, y: node.position.y + height / 2 };
}

function getGraphEdgeKey(edge: GraphEdge): string {
  return `${edge.from.nodeId}:${edge.from.port}->${edge.to.nodeId}:${edge.to.port}`;
}

function buildSimpleReadonlyTurnEdges(
  graph: GraphData,
  visibleNodeIdSet: Set<string>,
): Array<{ fromId: string; toId: string }> {
  if (visibleNodeIdSet.size === 0) {
    return [];
  }

  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    const children = outgoing.get(edge.from.nodeId) ?? [];
    children.push(edge.to.nodeId);
    outgoing.set(edge.from.nodeId, children);
  }

  const results: Array<{ fromId: string; toId: string }> = [];
  const seen = new Set<string>();

  for (const fromId of visibleNodeIdSet) {
    const queue: string[] = [];
    const initialChildren = outgoing.get(fromId) ?? [];
    for (const childId of initialChildren) {
      if (!visibleNodeIdSet.has(childId)) {
        queue.push(childId);
      }
    }

    const visitedHidden = new Set<string>();
    while (queue.length > 0) {
      const currentId = queue.shift() ?? "";
      if (!currentId || visitedHidden.has(currentId)) {
        continue;
      }
      visitedHidden.add(currentId);

      const children = outgoing.get(currentId) ?? [];
      for (const childId of children) {
        if (!childId || childId === fromId) {
          continue;
        }
        if (visibleNodeIdSet.has(childId)) {
          const key = `${fromId}->${childId}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ fromId, toId: childId });
          }
          continue;
        }
        if (!visitedHidden.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  return results;
}

function getAutoConnectionSides(
  fromNode: GraphNode,
  toNode: GraphNode,
  fromSize?: NodeVisualSize,
  toSize?: NodeVisualSize,
): {
  fromSide: NodeAnchorSide;
  toSide: NodeAnchorSide;
} {
  const fromWidth = fromSize?.width ?? NODE_WIDTH;
  const fromHeight = fromSize?.height ?? NODE_HEIGHT;
  const toWidth = toSize?.width ?? NODE_WIDTH;
  const toHeight = toSize?.height ?? NODE_HEIGHT;
  const fromRect = {
    left: fromNode.position.x,
    right: fromNode.position.x + fromWidth,
    top: fromNode.position.y,
    bottom: fromNode.position.y + fromHeight,
  };
  const toRect = {
    left: toNode.position.x,
    right: toNode.position.x + toWidth,
    top: toNode.position.y,
    bottom: toNode.position.y + toHeight,
  };
  const overlapX = Math.min(fromRect.right, toRect.right) - Math.max(fromRect.left, toRect.left);
  const overlapY = Math.min(fromRect.bottom, toRect.bottom) - Math.max(fromRect.top, toRect.top);

  const fromCenterX = fromNode.position.x + fromWidth / 2;
  const fromCenterY = fromNode.position.y + fromHeight / 2;
  const toCenterX = toNode.position.x + toWidth / 2;
  const toCenterY = toNode.position.y + toHeight / 2;
  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  if (overlapX > 24) {
    return dy >= 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }
  if (overlapY > 24) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }
  return dy >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

function alignAutoEdgePoints(
  fromNode: GraphNode,
  toNode: GraphNode,
  fromPoint: LogicalPoint,
  toPoint: LogicalPoint,
  fromSide: NodeAnchorSide,
  toSide: NodeAnchorSide,
  fromSize: NodeVisualSize,
  toSize: NodeVisualSize,
): { fromPoint: LogicalPoint; toPoint: LogicalPoint } {
  const fromHorizontal = fromSide === "left" || fromSide === "right";
  const toHorizontal = toSide === "left" || toSide === "right";
  const fromVertical = !fromHorizontal;
  const toVertical = !toHorizontal;

  if (fromHorizontal && toHorizontal) {
    const deltaY = Math.abs(fromPoint.y - toPoint.y);
    if (deltaY <= AUTO_EDGE_STRAIGHTEN_THRESHOLD) {
      const fromCenterY = fromNode.position.y + fromSize.height / 2;
      const toCenterY = toNode.position.y + toSize.height / 2;
      const laneY = Math.round((fromCenterY + toCenterY) / 2);
      return {
        fromPoint: { ...fromPoint, y: laneY },
        toPoint: { ...toPoint, y: laneY },
      };
    }
  }

  if (fromVertical && toVertical) {
    const deltaX = Math.abs(fromPoint.x - toPoint.x);
    if (deltaX <= AUTO_EDGE_STRAIGHTEN_THRESHOLD) {
      const fromCenterX = fromNode.position.x + fromSize.width / 2;
      const toCenterX = toNode.position.x + toSize.width / 2;
      const laneX = Math.round((fromCenterX + toCenterX) / 2);
      return {
        fromPoint: { ...fromPoint, x: laneX },
        toPoint: { ...toPoint, x: laneX },
      };
    }
  }

  return { fromPoint, toPoint };
}

function snapToLayoutGrid(value: number, axis: "x" | "y", thresholdPx?: number): number {
  const start = axis === "x" ? AUTO_LAYOUT_START_X : AUTO_LAYOUT_START_Y;
  const gap = axis === "x" ? AUTO_LAYOUT_COLUMN_GAP : AUTO_LAYOUT_ROW_GAP;
  const normalized = (value - start) / gap;
  const snapped = Math.round(normalized) * gap + start;
  if (thresholdPx == null) {
    return snapped;
  }
  return Math.abs(value - snapped) <= thresholdPx ? snapped : value;
}

function snapToNearbyNodeAxis(
  value: number,
  axis: "x" | "y",
  candidates: GraphNode[],
  thresholdPx: number,
): number {
  if (candidates.length === 0 || thresholdPx <= 0) {
    return value;
  }
  let nearest = value;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const node of candidates) {
    const candidateValue = axis === "x" ? node.position.x : node.position.y;
    const distance = Math.abs(value - candidateValue);
    if (distance < nearestDistance) {
      nearest = candidateValue;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= thresholdPx ? nearest : value;
}

function autoArrangeGraphLayout(input: GraphData): GraphData {
  if (input.nodes.length <= 1) {
    return input;
  }

  const nodeIds = input.nodes.map((node) => node.id);
  const nodeIdSet = new Set(nodeIds);
  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const depth = new Map<string, number>();

  for (const id of nodeIds) {
    incomingCount.set(id, 0);
    outgoing.set(id, []);
    depth.set(id, 0);
  }

  for (const edge of input.edges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) {
      continue;
    }
    outgoing.get(fromId)?.push(toId);
    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1);
  }

  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const));
  const roots = nodeIds
    .filter((id) => (incomingCount.get(id) ?? 0) === 0)
    .sort((a, b) => {
      const nodeA = nodeById.get(a);
      const nodeB = nodeById.get(b);
      const dy = (nodeA?.position.y ?? 0) - (nodeB?.position.y ?? 0);
      if (dy !== 0) {
        return dy;
      }
      const dx = (nodeA?.position.x ?? 0) - (nodeB?.position.x ?? 0);
      if (dx !== 0) {
        return dx;
      }
      return a.localeCompare(b);
    });

  const queue = [...roots];
  let cursor = 0;
  while (cursor < queue.length) {
    const currentId = queue[cursor];
    cursor += 1;
    const currentDepth = depth.get(currentId) ?? 0;
    const children = outgoing.get(currentId) ?? [];
    for (const childId of children) {
      const nextDepth = Math.max(depth.get(childId) ?? 0, currentDepth + 1);
      depth.set(childId, nextDepth);
      const nextIncoming = (incomingCount.get(childId) ?? 0) - 1;
      incomingCount.set(childId, nextIncoming);
      if (nextIncoming === 0) {
        queue.push(childId);
      }
    }
  }

  for (const id of nodeIds) {
    if ((incomingCount.get(id) ?? 0) > 0) {
      const parentDepths = input.edges
        .filter((edge) => edge.to.nodeId === id && nodeIdSet.has(edge.from.nodeId))
        .map((edge) => depth.get(edge.from.nodeId) ?? 0);
      const inferredDepth = parentDepths.length > 0 ? Math.max(...parentDepths) + 1 : 0;
      depth.set(id, Math.max(depth.get(id) ?? 0, inferredDepth));
    }
  }

  const columns = new Map<number, GraphNode[]>();
  for (const node of input.nodes) {
    const col = depth.get(node.id) ?? 0;
    const bucket = columns.get(col) ?? [];
    bucket.push(node);
    columns.set(col, bucket);
  }

  for (const [, nodes] of columns) {
    nodes.sort((a, b) => {
      const dy = a.position.y - b.position.y;
      if (dy !== 0) {
        return dy;
      }
      const dx = a.position.x - b.position.x;
      if (dx !== 0) {
        return dx;
      }
      return a.id.localeCompare(b.id);
    });
  }

  const nextNodes = input.nodes.map((node) => {
    const col = depth.get(node.id) ?? 0;
    const rows = columns.get(col) ?? [];
    const row = Math.max(0, rows.findIndex((item) => item.id === node.id));
    return {
      ...node,
      position: {
        x: AUTO_LAYOUT_START_X + col * AUTO_LAYOUT_COLUMN_GAP,
        y: AUTO_LAYOUT_START_Y + row * AUTO_LAYOUT_ROW_GAP,
      },
    };
  });

  const hasChanged = nextNodes.some((node, index) => {
    const before = input.nodes[index];
    return before.position.x !== node.position.x || before.position.y !== node.position.y;
  });
  if (!hasChanged) {
    return input;
  }
  return {
    ...input,
    nodes: nextNodes,
  };
}

function makeNodeId(type: NodeType): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}-${suffix}`;
}

function defaultNodeConfig(type: NodeType): Record<string, unknown> {
  if (type === "turn") {
    return {
      executor: "codex",
      model: DEFAULT_TURN_MODEL,
      role: "",
      cwd: ".",
      promptTemplate: "{{input}}",
      knowledgeEnabled: true,
      qualityThreshold: QUALITY_DEFAULT_THRESHOLD,
      artifactType: "none",
      qualityCommandEnabled: false,
      qualityCommands: "npm run build",
    };
  }

  if (type === "transform") {
    return {
      mode: "pick",
      pickPath: "text",
      mergeJson: "{}",
      template: "{{input}}",
    };
  }

  return {
    decisionPath: "DECISION",
    passNodeId: "",
    rejectNodeId: "",
    schemaJson: "",
  };
}

function nodeCardSummary(node: GraphNode): string {
  if (node.type === "turn") {
    return "";
  }
  if (SIMPLE_WORKFLOW_UI) {
    return "";
  }
  if (node.type === "transform") {
    const config = node.config as TransformConfig;
    const mode = String(config.mode ?? "pick");
    if (mode === "merge") {
      return "정리 방식: 고정 정보 덧붙이기";
    }
    if (mode === "template") {
      return "정리 방식: 문장 틀로 다시 쓰기";
    }
    return "정리 방식: 필요한 값만 꺼내기";
  }
  const config = node.config as GateConfig;
  const path = String(config.decisionPath ?? "DECISION");
  return `판단값 위치: ${path === "decision" ? "DECISION" : path}`;
}

function turnModelLabel(node: GraphNode): string {
  const config = node.config as TurnConfig;
  const executor = getTurnExecutor(config);
  if (executor === "ollama") {
    return `Ollama · ${String(config.ollamaModel ?? "llama3.1:8b")}`;
  }
  if (executor !== "codex") {
    return turnExecutorLabel(executor);
  }
  return toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL));
}

function getTurnExecutor(config: TurnConfig): TurnExecutor {
  const raw = typeof config.executor === "string" ? config.executor : "codex";
  return TURN_EXECUTOR_OPTIONS.includes(raw as TurnExecutor) ? (raw as TurnExecutor) : "codex";
}

function turnExecutorLabel(executor: TurnExecutor): string {
  return TURN_EXECUTOR_LABELS[executor];
}

function getWebProviderFromExecutor(executor: TurnExecutor): WebProvider | null {
  if (executor === "web_gemini") {
    return "gemini";
  }
  if (executor === "web_gpt") {
    return "gpt";
  }
  if (executor === "web_grok") {
    return "grok";
  }
  if (executor === "web_perplexity") {
    return "perplexity";
  }
  if (executor === "web_claude") {
    return "claude";
  }
  return null;
}

function webProviderLabel(provider: WebProvider): string {
  if (provider === "gemini") {
    return "GEMINI";
  }
  if (provider === "gpt") {
    return "GPT";
  }
  if (provider === "grok") {
    return "GROK";
  }
  if (provider === "perplexity") {
    return "PERPLEXITY";
  }
  return "CLAUDE";
}

function webProviderHomeUrl(provider: WebProvider): string {
  if (provider === "gemini") {
    return "https://gemini.google.com/app";
  }
  if (provider === "gpt") {
    return "https://chatgpt.com/";
  }
  if (provider === "grok") {
    return "https://grok.com/";
  }
  if (provider === "perplexity") {
    return "https://www.perplexity.ai/";
  }
  return "https://claude.ai/";
}

function normalizeWebResultMode(mode: unknown): WebResultMode {
  if (mode === "manualPasteJson" || mode === "manualPasteText") {
    return mode;
  }
  if (mode === "bridgeAssisted" || mode === "auto") {
    return "bridgeAssisted";
  }
  return "bridgeAssisted";
}

function toWebBridgeStatus(raw: unknown): WebBridgeStatus {
  const fallback: WebBridgeStatus = {
    running: false,
    port: 38961,
    tokenMasked: "",
    connectedProviders: [],
    queuedTasks: 0,
    activeTasks: 0,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback;
  }
  const row = raw as Record<string, unknown>;
  const connectedProviders = Array.isArray(row.connectedProviders)
    ? row.connectedProviders
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }
          const entry = item as Record<string, unknown>;
          const providerRaw = String(entry.provider ?? "").trim().toLowerCase();
          if (!WEB_PROVIDER_OPTIONS.includes(providerRaw as WebProvider)) {
            return null;
          }
          return {
            provider: providerRaw as WebProvider,
            pageUrl: typeof entry.pageUrl === "string" ? entry.pageUrl : entry.pageUrl == null ? null : undefined,
            lastSeenAt:
              typeof entry.lastSeenAt === "string"
                ? entry.lastSeenAt
                : entry.lastSeenAt == null
                  ? null
                  : undefined,
          } as WebBridgeProviderSeen;
        })
        .filter(Boolean) as WebBridgeProviderSeen[]
    : [];
  return {
    running: row.running === true,
    port: Number(row.port ?? 38961) || 38961,
    tokenMasked: typeof row.tokenMasked === "string" ? row.tokenMasked : "",
    token: typeof row.token === "string" ? row.token : undefined,
    tokenStorage: typeof row.tokenStorage === "string" ? row.tokenStorage : undefined,
    lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : row.lastSeenAt == null ? null : undefined,
    connectedProviders,
    queuedTasks: Math.max(0, Number(row.queuedTasks ?? 0) || 0),
    activeTasks: Math.max(0, Number(row.activeTasks ?? 0) || 0),
  };
}

function turnRoleLabel(node: GraphNode): string {
  const config = node.config as TurnConfig;
  const raw = String(config.role ?? "").trim();
  if (raw) {
    return raw;
  }

  const signal = `${node.id} ${String(config.promptTemplate ?? "")}`.toLowerCase();
  if (signal.includes("search")) {
    return "SEARCH AGENT";
  }
  if (signal.includes("judge") || signal.includes("evaluator") || signal.includes("quality")) {
    return "EVALUATION AGENT";
  }
  if (signal.includes("final") || signal.includes("synth")) {
    return "SYNTHESIS AGENT";
  }
  if (signal.includes("intake") || signal.includes("requirements")) {
    return "PLANNING AGENT";
  }
  if (signal.includes("architect")) {
    return "ARCHITECTURE AGENT";
  }
  if (signal.includes("implementation")) {
    return "IMPLEMENTATION AGENT";
  }
  return FALLBACK_TURN_ROLE;
}

function nodeTypeLabel(type: NodeType): string {
  if (type === "turn") {
    return "응답 에이전트";
  }
  if (SIMPLE_WORKFLOW_UI) {
    return "내부 처리";
  }
  if (type === "transform") {
    return "데이터 변환";
  }
  return "결정 분기";
}

function nodeSelectionLabel(node: GraphNode): string {
  if (node.type === "turn") {
    return turnModelLabel(node);
  }
  if (node.type === "transform") {
    return "데이터 변환";
  }
  return "결정 분기";
}

function nodeStatusLabel(status: NodeExecutionStatus): string {
  if (status === "idle") {
    return "대기";
  }
  if (status === "queued") {
    return "대기열";
  }
  if (status === "running") {
    return "실행 중";
  }
  if (status === "waiting_user") {
    return "사용자 입력 대기";
  }
  if (status === "done") {
    return "완료";
  }
  if (status === "failed") {
    return "오류";
  }
  if (status === "skipped") {
    return "건너뜀";
  }
  return "정지";
}

function knowledgeStatusMeta(status?: KnowledgeFileStatus): { label: string; tone: string } {
  if (status === "ready") {
    return { label: "준비됨", tone: "ready" };
  }
  if (status === "missing") {
    return { label: "파일 없음", tone: "missing" };
  }
  if (status === "unsupported") {
    return { label: "미지원", tone: "unsupported" };
  }
  if (status === "error") {
    return { label: "오류", tone: "error" };
  }
  return { label: "미확인", tone: "unknown" };
}

function approvalDecisionLabel(decision: ApprovalDecision): string {
  if (decision === "accept") {
    return "허용";
  }
  if (decision === "acceptForSession") {
    return "세션 동안 허용";
  }
  if (decision === "decline") {
    return "거절";
  }
  return "취소";
}

function approvalSourceLabel(source: PendingApproval["source"]): string {
  if (source === "remote") {
    return "엔진(app-server)";
  }
  return source;
}

function lifecycleStateLabel(state: string): string {
  const map: Record<string, string> = {
    starting: "시작 중",
    ready: "준비됨",
    stopped: "중지됨",
    disconnected: "연결 끊김",
    parseError: "파싱 오류",
    readError: "읽기 오류",
    stderrError: "표준오류 스트림 오류",
  };
  return map[state] ?? state;
}

function formatRelativeFeedTime(iso: string): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) {
    return iso;
  }
  const diffMs = Date.now() - at;
  if (diffMs < 60_000) {
    return "방금";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function NavIcon({ tab, active = false }: { tab: WorkspaceTab; active?: boolean }) {
  if (tab === "workflow") {
    return (
      <img alt="" aria-hidden="true" className="nav-workflow-image" src="/workflow.svg" />
    );
  }
  if (tab === "feed") {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="nav-workflow-image nav-feed-image"
        src={active ? "/post.svg" : "/post.svg"}
      />
    );
  }
  if (tab === "history") {
    return <img alt="" aria-hidden="true" className="nav-workflow-image" src="/time.svg" />;
  }
  if (tab === "settings") {
    return <img alt="" aria-hidden="true" className="nav-workflow-image" src="/setting.svg" />;
  }
  if (tab === "bridge") {
    return <img alt="" aria-hidden="true" className="nav-workflow-image" src="/scroll.svg" />;
  }
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M12 3.5l2 1.1 2.3-.2 1 2 2 .9-.1 2.4 1.4 1.8-1.4 1.8.1 2.4-2 .9-1 2-2.3-.2-2 1.1-2-1.1-2.3.2-1-2-2-.9.1-2.4-1.4-1.8 1.4-1.8-.1-2.4 2-.9 1-2 2.3.2 2-1.1z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FancySelect({
  ariaLabel,
  className,
  disabled = false,
  emptyMessage = "항목이 없습니다.",
  onChange,
  options,
  placeholder = "선택",
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  onChange: (nextValue: string) => void;
  options: FancySelectOption[];
  placeholder?: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const isGraphFileSelect = (className ?? "").includes("graph-file-select");

  useEffect(() => {
    const onWindowMouseDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onWindowMouseDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) {
      return;
    }

    const container = root.closest(".inspector-content, .childview-view");
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const minBottomGap = 16;
    const previousGap = container.style.getPropertyValue("--dropdown-open-gap");
    const requiredGap = 160;
    container.style.setProperty("--dropdown-open-gap", `${requiredGap}px`);

    const frame = window.requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const overflow = menuRect.bottom + minBottomGap - containerRect.bottom;
      if (overflow <= 0) {
        return;
      }
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.min(maxScrollTop, container.scrollTop + overflow);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (previousGap) {
        container.style.setProperty("--dropdown-open-gap", previousGap);
      } else {
        container.style.removeProperty("--dropdown-open-gap");
      }
    };
  }, [isOpen]);

  return (
    <div className={`fancy-select ${className ?? ""} ${isOpen ? "is-open" : ""}`} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="fancy-select-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((prev) => !prev);
        }}
        type="button"
      >
        <span className={`fancy-select-value ${selected ? "" : "is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden="true" className="fancy-select-chevron">
          <img
            alt=""
            className="fancy-select-chevron-icon"
            src={isOpen ? "/up-arrow.svg" : "/down-arrow.svg"}
          />
        </span>
      </button>
      {isOpen && (
        <div className="fancy-select-menu" ref={menuRef} role="listbox">
          {options.length === 0 && (
            <div
              className="fancy-select-empty"
              style={
                isGraphFileSelect
                  ? { minHeight: "36px", height: "36px", display: "flex", alignItems: "center", padding: "0 11px" }
                  : undefined
              }
            >
              {emptyMessage}
            </div>
          )}
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`fancy-select-option ${option.value === value ? "is-selected" : ""}`}
              disabled={option.disabled}
              key={option.value}
              onClick={() => {
                if (option.disabled) {
                  return;
                }
                onChange(option.value);
                setIsOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function authModeLabel(mode: AuthMode): string {
  if (mode === "chatgpt") {
    return "챗지피티";
  }
  if (mode === "apikey") {
    return "API 키";
  }
  return "미확인";
}

function InspectorSectionTitle({ title, help }: { title: string; help: string }) {
  return (
    <div className="inspector-section-title">
      <h3>{title}</h3>
      <span aria-label={`${title} 도움말`} className="help-tooltip" data-tooltip={help} role="note" tabIndex={0}>
        ?
      </span>
      <div className="help-tooltip-panel" role="tooltip">
        {help}
      </div>
    </div>
  );
}

function extractFinalAnswer(output: unknown): string {
  const maybeText = extractStringByPaths(output, [
    "text",
    "completion.text",
    "finalDraft",
    "result",
  ]);
  if (maybeText) {
    return maybeText;
  }
  if (output == null) {
    return "";
  }
  return formatUnknown(output);
}

function makePresetNode(
  id: string,
  type: NodeType,
  x: number,
  y: number,
  config: Record<string, unknown>,
): GraphNode {
  return {
    id,
    type,
    position: { x, y },
    config,
  };
}

type PresetTurnPolicy = {
  profile: QualityProfileId;
  threshold: number;
  qualityCommandEnabled: boolean;
  qualityCommands: string;
  artifactType: ArtifactType;
};

const DEFAULT_PRESET_TURN_POLICY: PresetTurnPolicy = {
  profile: "generic",
  threshold: QUALITY_DEFAULT_THRESHOLD,
  qualityCommandEnabled: false,
  qualityCommands: "npm run build",
  artifactType: "none",
};

function resolvePresetTurnPolicy(kind: PresetKind, nodeId: string): PresetTurnPolicy {
  const key = nodeId.toLowerCase();

  if (kind === "validation") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 68 };
    }
    if (key.includes("search")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: key.includes("-a") ? 80 : 82,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("judge")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "research_evidence", threshold: 87 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 79,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  if (kind === "development") {
    if (key.includes("requirements")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 72,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("architecture")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 79,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("implementation")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 84,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("evaluator")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 86 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 82,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "research") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 70 };
    }
    if (key.includes("collector")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 80,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("factcheck")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 90,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  if (kind === "expert") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 72 };
    }
    if (key.includes("analysis")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 82,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("review")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 86 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 85,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "unityGame") {
    if (key.includes("intake")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 68,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("system")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 81,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("implementation")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 83,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run typecheck\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("qa")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 88 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "TaskPlanArtifact",
      };
    }
  }

  if (kind === "fullstack") {
    if (key.includes("intake")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 72,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("backend")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 85,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run test\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("frontend")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 83,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run test -- --runInBand\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("ops")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 89 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 85,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "creative") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 66 };
    }
    if (key.includes("diverge")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "generic", threshold: 58 };
    }
    if (key.includes("critic")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 80 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 74,
        artifactType: "TaskPlanArtifact",
      };
    }
  }

  if (kind === "newsTrend") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 70 };
    }
    if (key.includes("scan")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 80,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("check")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 91,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  return DEFAULT_PRESET_TURN_POLICY;
}

function applyPresetTurnPolicies(kind: PresetKind, nodes: GraphNode[]): GraphNode[] {
  return nodes.map((node) => {
    if (node.type !== "turn") {
      return node;
    }
    const policy = resolvePresetTurnPolicy(kind, node.id);
    const current = node.config as TurnConfig;
    return {
      ...node,
      config: {
        ...current,
        qualityProfile: policy.profile,
        qualityThreshold: normalizeQualityThreshold(policy.threshold),
        qualityCommandEnabled: policy.qualityCommandEnabled,
        qualityCommands: policy.qualityCommands,
        artifactType: policy.artifactType,
      },
    };
  });
}

function buildValidationPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "당신은 검증 설계 에이전트다. 아래 질문을 분석해 검증 계획 JSON만 출력하라.\n" +
        "출력 형식:\n" +
        "{\n" +
        '  "question":"...",\n' +
        '  "goal":"...",\n' +
        '  "checkpoints":["...","...","..."],\n' +
        '  "searchQueries":["...","...","..."]\n' +
        "}\n" +
        "질문: {{input}}",
    }),
    makePresetNode("turn-search-a", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "SEARCH AGENT A",
      cwd: ".",
      promptTemplate:
        "아래 입력에서 주장에 유리한 근거를 찾아 JSON으로 정리하라.\n" +
        "출력 형식:\n" +
        '{ "evidences":[{"claim":"...","evidence":"...","sourceHint":"...","confidence":0.0}] }\n' +
        "조건: 근거가 약하면 confidence를 낮게 주고 추정이라고 표시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-search-b", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "SEARCH AGENT B",
      cwd: ".",
      promptTemplate:
        "아래 입력에서 반례/한계/위험요인을 찾아 JSON으로 정리하라.\n" +
        "출력 형식:\n" +
        '{ "risks":[{"point":"...","why":"...","confidence":0.0,"mitigation":"..."}] }\n' +
        "조건: 모호하면 모호하다고 명시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-judge", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "EVALUATION AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 종합 평가해 JSON만 출력하라.\n" +
        "출력 형식:\n" +
        '{ "DECISION":"PASS|REJECT", "finalDraft":"...", "why":["...","..."], "gaps":["..."], "confidence":0.0 }\n' +
        "판정 기준: 근거 일관성, 반례 대응 가능성, 불확실성 명시 여부.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("gate-decision", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-final",
      rejectNodeId: "transform-reject",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 입력을 바탕으로 최종 답변을 한국어로 작성하라.\n" +
        "규칙:\n" +
        "1) 핵심 결론 먼저\n" +
        "2) 근거 3~5개\n" +
        "3) 한계/불확실성 분리\n" +
        "4) 바로 실행 가능한 다음 단계 제시\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-reject", "transform", 1320, 220, {
      mode: "template",
      template: "검증 결과 REJECT. 추가 조사 필요. 원본: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-intake", port: "out" }, to: { nodeId: "turn-search-a", port: "in" } },
    { from: { nodeId: "turn-intake", port: "out" }, to: { nodeId: "turn-search-b", port: "in" } },
    { from: { nodeId: "turn-search-a", port: "out" }, to: { nodeId: "turn-judge", port: "in" } },
    { from: { nodeId: "turn-search-b", port: "out" }, to: { nodeId: "turn-judge", port: "in" } },
    { from: { nodeId: "turn-judge", port: "out" }, to: { nodeId: "gate-decision", port: "in" } },
    { from: { nodeId: "gate-decision", port: "out" }, to: { nodeId: "turn-final", port: "in" } },
    { from: { nodeId: "gate-decision", port: "out" }, to: { nodeId: "transform-reject", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildDevelopmentPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-requirements", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "REQUIREMENTS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 요청을 분석해 요구사항 JSON만 출력하라.\n" +
        '{ "functional":["..."], "nonFunctional":["..."], "constraints":["..."], "priority":["P0","P1","P2"] }\n' +
        "질문: {{input}}",
    }),
    makePresetNode("turn-architecture", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "ARCHITECTURE AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 현실적인 시스템 설계를 JSON으로 제안하라.\n" +
        '{ "architecture":"...", "components":[...], "tradeoffs":[...], "risks":[...], "decisionLog":[...] }\n' +
        "과설계 금지, MVP 우선.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-implementation", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "IMPLEMENTATION AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 기반으로 구현 계획을 단계별로 작성하라.\n" +
        "필수: 파일 단위 변경 목록, 테스트 계획, 실패 시 롤백 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-evaluator", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "QUALITY AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 리뷰해 품질 판정을 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "finalDraft":"...", "risk":["..."], "blockingIssues":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-quality", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-final-dev",
      rejectNodeId: "transform-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-final-dev", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "DEV SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 입력으로 최종 개발 가이드를 작성하라.\n" +
        "구성: 구현 순서, 코드 품질 기준, 테스트 명세, 배포 체크리스트, 운영 리스크 대응.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-rework", "transform", 1320, 220, {
      mode: "template",
      template: "REJECT - requirements/architecture 재검토 필요. 입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-requirements", port: "out" },
      to: { nodeId: "turn-architecture", port: "in" },
    },
    {
      from: { nodeId: "turn-requirements", port: "out" },
      to: { nodeId: "turn-implementation", port: "in" },
    },
    {
      from: { nodeId: "turn-architecture", port: "out" },
      to: { nodeId: "turn-evaluator", port: "in" },
    },
    {
      from: { nodeId: "turn-implementation", port: "out" },
      to: { nodeId: "turn-evaluator", port: "in" },
    },
    {
      from: { nodeId: "turn-evaluator", port: "out" },
      to: { nodeId: "gate-quality", port: "in" },
    },
    {
      from: { nodeId: "gate-quality", port: "out" },
      to: { nodeId: "turn-final-dev", port: "in" },
    },
    {
      from: { nodeId: "gate-quality", port: "out" },
      to: { nodeId: "transform-rework", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildResearchPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-research-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "RESEARCH PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 조사 계획으로 분해해 JSON만 출력하라.\n" +
        '{ "researchGoal":"...", "questions":["..."], "evidenceCriteria":["..."], "riskChecks":["..."] }\n' +
        "질문: {{input}}",
    }),
    makePresetNode("turn-research-collector", "turn", 420, 120, {
      model: "GPT-5.2",
      role: "SOURCE COLLECTION AGENT",
      cwd: ".",
      promptTemplate:
        "입력 기준으로 핵심 근거 후보를 수집해 JSON으로 정리하라.\n" +
        '{ "evidences":[{"id":"E1","statement":"...","whyRelevant":"...","confidence":0.0}] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-research-factcheck", "turn", 720, 120, {
      model: "GPT-5.2-Codex",
      role: "FACT CHECK AGENT",
      cwd: ".",
      promptTemplate:
        "수집 근거를 검증하고 JSON으로 출력하라.\n" +
        '{ "verified":["E1"], "contested":["E2"], "missing":["..."], "notes":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("transform-research-brief", "transform", 1020, 120, {
      mode: "template",
      template:
        "자료조사 요약\n- 핵심 사실: {{input}}\n- 검증 포인트: 신뢰도, 최신성, 반례 존재 여부\n- 최종 답변 작성 전 누락 항목 점검",
    }),
    makePresetNode("turn-research-final", "turn", 1320, 120, {
      model: "GPT-5.3-Codex",
      role: "RESEARCH SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "근거 중심 최종 답변을 한국어로 작성하라.\n" +
        "규칙: 주장 옆에 근거 ID(E1, E2) 표시, 불확실성 분리, 과장 금지.\n" +
        "입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-research-intake", port: "out" },
      to: { nodeId: "turn-research-collector", port: "in" },
    },
    {
      from: { nodeId: "turn-research-collector", port: "out" },
      to: { nodeId: "turn-research-factcheck", port: "in" },
    },
    {
      from: { nodeId: "turn-research-factcheck", port: "out" },
      to: { nodeId: "transform-research-brief", port: "in" },
    },
    {
      from: { nodeId: "transform-research-brief", port: "out" },
      to: { nodeId: "turn-research-final", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildExpertPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-expert-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "DOMAIN INTAKE AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 전문가 분석용 브리프로 구조화하라.\n" +
        '{ "domain":"...", "objective":"...", "constraints":["..."], "successCriteria":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-expert-analysis", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "DOMAIN EXPERT AGENT",
      cwd: ".",
      promptTemplate:
        "도메인 전문가 관점의 해결 전략을 작성하라.\n" +
        "필수: 핵심 원리, 실제 적용 절차, 실패 조건, 대안 전략.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-expert-review", "turn", 420, 220, {
      model: "GPT-5.2",
      role: "PEER REVIEW AGENT",
      cwd: ".",
      promptTemplate:
        "전략의 취약점과 반례를 엄격히 리뷰해 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "criticalIssues":["..."], "improvements":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-expert", "gate", 720, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-expert-final",
      rejectNodeId: "transform-expert-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-expert-final", "turn", 1020, 40, {
      model: "GPT-5.3-Codex",
      role: "EXPERT SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "최종 전문가 답변을 작성하라.\n" +
        "구성: 핵심 결론, 단계별 실행안, 검증 체크리스트, 실패 시 대체안.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-expert-rework", "transform", 1020, 220, {
      mode: "template",
      template: "REJECT. 전문가 전략을 보완해야 합니다. 보완 항목 목록을 작성하세요. 원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-expert-intake", port: "out" }, to: { nodeId: "turn-expert-analysis", port: "in" } },
    { from: { nodeId: "turn-expert-intake", port: "out" }, to: { nodeId: "turn-expert-review", port: "in" } },
    { from: { nodeId: "turn-expert-analysis", port: "out" }, to: { nodeId: "gate-expert", port: "in" } },
    { from: { nodeId: "turn-expert-review", port: "out" }, to: { nodeId: "gate-expert", port: "in" } },
    { from: { nodeId: "gate-expert", port: "out" }, to: { nodeId: "turn-expert-final", port: "in" } },
    { from: { nodeId: "gate-expert", port: "out" }, to: { nodeId: "transform-expert-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildUnityGamePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-unity-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "UNITY CONCEPT AGENT",
      cwd: ".",
      promptTemplate:
        "입력 요청을 유니티 게임 기획 브리프로 구조화하라.\n" +
        '{ "genre":"...", "coreLoop":"...", "targetPlatform":["..."], "scope":"MVP", "mustHave":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-system", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "UNITY SYSTEM DESIGN AGENT",
      cwd: ".",
      promptTemplate:
        "유니티 시스템 설계안을 작성하라.\n" +
        "필수: 씬 구조, 게임 상태 관리, 입력 시스템, 데이터 저장 전략.\n" +
        "출력은 JSON 우선.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-implementation", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "UNITY IMPLEMENTATION AGENT",
      cwd: ".",
      promptTemplate:
        "구현 계획을 작성하라.\n" +
        "필수: C# 스크립트 목록, 폴더 구조, 단계별 구현 순서, 테스트 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-qa", "turn", 720, 120, {
      model: "GPT-5.2",
      role: "UNITY QA AGENT",
      cwd: ".",
      promptTemplate:
        "설계/구현 계획을 리뷰해 JSON 판정을 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "bugsToWatch":["..."], "performanceRisks":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-unity", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-unity-final",
      rejectNodeId: "transform-unity-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-unity-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "UNITY FINALIZATION AGENT",
      cwd: ".",
      promptTemplate:
        "유니티 개발 실행 가이드를 최종 작성하라.\n" +
        "구성: 1주차~N주차 스프린트, 우선순위, 검증 체크리스트, 리스크 대응.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-unity-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 유니티 계획 재작성 필요.\n보완 항목:\n1) 성능 병목\n2) 콘텐츠 제작 범위\n3) 테스트 자동화\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-unity-intake", port: "out" }, to: { nodeId: "turn-unity-system", port: "in" } },
    {
      from: { nodeId: "turn-unity-intake", port: "out" },
      to: { nodeId: "turn-unity-implementation", port: "in" },
    },
    { from: { nodeId: "turn-unity-system", port: "out" }, to: { nodeId: "turn-unity-qa", port: "in" } },
    {
      from: { nodeId: "turn-unity-implementation", port: "out" },
      to: { nodeId: "turn-unity-qa", port: "in" },
    },
    { from: { nodeId: "turn-unity-qa", port: "out" }, to: { nodeId: "gate-unity", port: "in" } },
    { from: { nodeId: "gate-unity", port: "out" }, to: { nodeId: "turn-unity-final", port: "in" } },
    { from: { nodeId: "gate-unity", port: "out" }, to: { nodeId: "transform-unity-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildFullstackPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-fullstack-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PRODUCT SPEC AGENT",
      cwd: ".",
      promptTemplate:
        "요청을 풀스택 제품 명세로 구조화하라.\n" +
        '{ "personas":["..."], "features":["..."], "nonFunctional":["..."], "mvpScope":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-backend", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "BACKEND AGENT",
      cwd: ".",
      promptTemplate:
        "백엔드 설계안을 작성하라.\n" +
        "필수: API 계약, DB 스키마, 인증/권한, 오류 처리, 관측성.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-frontend", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "FRONTEND AGENT",
      cwd: ".",
      promptTemplate:
        "프론트엔드 구현 계획을 작성하라.\n" +
        "필수: 정보구조, 화면 흐름, 상태관리, 접근성, 테스트 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-ops", "turn", 720, 120, {
      model: "GPT-5.2",
      role: "OPS & SECURITY AGENT",
      cwd: ".",
      promptTemplate:
        "운영/보안 리뷰 결과를 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "securityRisks":["..."], "deployChecklist":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-fullstack", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-fullstack-final",
      rejectNodeId: "transform-fullstack-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-fullstack-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "FULLSTACK DELIVERY AGENT",
      cwd: ".",
      promptTemplate:
        "풀스택 실행 가이드를 최종 작성하라.\n" +
        "구성: 개발 순서, 마일스톤, 테스트 전략, 배포 전략, 운영 가드레일.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-fullstack-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 풀스택 계획 재작업 필요.\n핵심 보완: 보안, 장애복구, 테스트 커버리지.\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-fullstack-intake", port: "out" },
      to: { nodeId: "turn-fullstack-backend", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-intake", port: "out" },
      to: { nodeId: "turn-fullstack-frontend", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-backend", port: "out" },
      to: { nodeId: "turn-fullstack-ops", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-frontend", port: "out" },
      to: { nodeId: "turn-fullstack-ops", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-ops", port: "out" },
      to: { nodeId: "gate-fullstack", port: "in" },
    },
    {
      from: { nodeId: "gate-fullstack", port: "out" },
      to: { nodeId: "turn-fullstack-final", port: "in" },
    },
    {
      from: { nodeId: "gate-fullstack", port: "out" },
      to: { nodeId: "transform-fullstack-rework", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildCreativePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-creative-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PROBLEM REFRAME AGENT",
      cwd: ".",
      promptTemplate:
        "입력 문제를 창의 탐색용으로 재정의하라.\n" +
        '{ "coreProblem":"...", "hiddenConstraints":["..."], "challengeStatement":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-creative-diverge", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "IDEA DIVERGENCE AGENT",
      cwd: ".",
      promptTemplate:
        "상호 성격이 다른 아이디어 8개를 제시하라.\n" +
        "조건: 서로 중복 금지, 평범한 해법 금지, 실행 가능성도 함께 표기.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-creative-critic", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "IDEA CRITIC AGENT",
      cwd: ".",
      promptTemplate:
        "아이디어를 냉정하게 평가해 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "topIdeas":[{"idea":"...","reason":"...","risk":"..."}], "rejectedReasons":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-creative", "gate", 720, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-creative-final",
      rejectNodeId: "transform-creative-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-creative-final", "turn", 1020, 40, {
      model: "GPT-5.3-Codex",
      role: "CREATIVE SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "선정된 아이디어를 실전용 제안서로 작성하라.\n" +
        "구성: 컨셉, 차별점, 실행 단계, 리스크 대응, 성공 지표.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-creative-rework", "transform", 1020, 220, {
      mode: "template",
      template:
        "REJECT. 아이디어를 더 과감하고 차별적으로 재작성하세요.\n평가에서 낮았던 이유를 반드시 반영.\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-creative-intake", port: "out" },
      to: { nodeId: "turn-creative-diverge", port: "in" },
    },
    {
      from: { nodeId: "turn-creative-diverge", port: "out" },
      to: { nodeId: "turn-creative-critic", port: "in" },
    },
    {
      from: { nodeId: "turn-creative-critic", port: "out" },
      to: { nodeId: "gate-creative", port: "in" },
    },
    {
      from: { nodeId: "gate-creative", port: "out" },
      to: { nodeId: "turn-creative-final", port: "in" },
    },
    {
      from: { nodeId: "gate-creative", port: "out" },
      to: { nodeId: "transform-creative-rework", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildNewsTrendPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-news-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "NEWS BRIEF AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 최신 뉴스/트렌드 조사 쿼리로 분해하라.\n" +
        '{ "timeWindow":"최근 7일 또는 30일", "queries":["..."], "mustVerify":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-a", "turn", 420, 40, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 120000,
      model: "GPT-5.2",
      role: "WEB NEWS SCAN AGENT A",
      cwd: ".",
      promptTemplate:
        "최신 뉴스 관점으로 핵심 이슈 5개를 수집하고 날짜/출처/핵심포인트를 요약해줘.\n입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-b", "turn", 420, 220, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 120000,
      model: "GPT-5.2-Codex",
      role: "WEB TREND SCAN AGENT B",
      cwd: ".",
      promptTemplate:
        "트렌드 관점으로 신호(증가/감소/변곡점)를 찾아 요약해줘.\n입력: {{input}}",
    }),
    makePresetNode("turn-news-check", "turn", 720, 120, {
      model: "GPT-5.2-Codex",
      role: "NEWS FACT CHECK AGENT",
      cwd: ".",
      promptTemplate:
        "두 수집 결과를 교차검증해 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "confirmed":["..."], "conflicts":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-news", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-news-final",
      rejectNodeId: "transform-news-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-news-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "NEWS SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "최신 뉴스/트렌드 브리핑을 작성하라.\n" +
        "구성: 핵심 변화, 영향 분석, 향후 2주 시나리오, 확인 필요 항목.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-news-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 최신성/출처 신뢰성 검증이 부족합니다.\n추가 확인 항목을 먼저 보강하세요.\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-news-intake", port: "out" }, to: { nodeId: "turn-news-scan-a", port: "in" } },
    { from: { nodeId: "turn-news-intake", port: "out" }, to: { nodeId: "turn-news-scan-b", port: "in" } },
    { from: { nodeId: "turn-news-scan-a", port: "out" }, to: { nodeId: "turn-news-check", port: "in" } },
    { from: { nodeId: "turn-news-scan-b", port: "out" }, to: { nodeId: "turn-news-check", port: "in" } },
    { from: { nodeId: "turn-news-check", port: "out" }, to: { nodeId: "gate-news", port: "in" } },
    { from: { nodeId: "gate-news", port: "out" }, to: { nodeId: "turn-news-final", port: "in" } },
    { from: { nodeId: "gate-news", port: "out" }, to: { nodeId: "transform-news-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

function buildPresetGraphByKind(kind: PresetKind): GraphData {
  if (kind === "validation") {
    return buildValidationPreset();
  }
  if (kind === "development") {
    return buildDevelopmentPreset();
  }
  if (kind === "research") {
    return buildResearchPreset();
  }
  if (kind === "unityGame") {
    return buildUnityGamePreset();
  }
  if (kind === "fullstack") {
    return buildFullstackPreset();
  }
  if (kind === "creative") {
    return buildCreativePreset();
  }
  if (kind === "newsTrend") {
    return buildNewsTrendPreset();
  }
  return buildExpertPreset();
}

function normalizeGraph(input: unknown): GraphData {
  if (!input || typeof input !== "object") {
    return { version: GRAPH_SCHEMA_VERSION, nodes: [], edges: [], knowledge: defaultKnowledgeConfig() };
  }

  const data = input as Record<string, unknown>;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const version = typeof data.version === "number" ? data.version : 1;

  const normalizedNodes = nodes
    .filter((node): node is GraphNode => Boolean(node))
    .map((node) => {
      if (node.type !== "turn") {
        return node;
      }
      const config = (node.config ?? {}) as Record<string, unknown>;
      const rawExecutor = typeof config.executor === "string" ? config.executor : "codex";
      const executor = TURN_EXECUTOR_OPTIONS.includes(rawExecutor as TurnExecutor)
        ? rawExecutor
        : "codex";
      const normalizedConfig = {
        ...config,
        executor,
        webResultMode: normalizeWebResultMode(config.webResultMode),
        model: toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL)),
        knowledgeEnabled:
          typeof config.knowledgeEnabled === "boolean" ? config.knowledgeEnabled : true,
        qualityProfile: toQualityProfileId(config.qualityProfile) ?? undefined,
        qualityThreshold: normalizeQualityThreshold(
          readNumber(config.qualityThreshold) ?? QUALITY_DEFAULT_THRESHOLD,
        ),
        qualityCommandEnabled:
          typeof config.qualityCommandEnabled === "boolean" ? config.qualityCommandEnabled : false,
        qualityCommands: String(config.qualityCommands ?? "npm run build"),
        artifactType: toArtifactType(config.artifactType),
      };
      return {
        ...node,
        config: normalizedConfig,
      };
    });

  const normalizedEdges = edges
    .map((edge) => {
      if (!edge || typeof edge !== "object") {
        return null;
      }
      const row = edge as Record<string, unknown>;
      const from = row.from as Record<string, unknown> | undefined;
      const to = row.to as Record<string, unknown> | undefined;
      if (!from || !to) {
        return null;
      }
      const fromNodeId = String(from.nodeId ?? "").trim();
      const toNodeId = String(to.nodeId ?? "").trim();
      if (!fromNodeId || !toNodeId) {
        return null;
      }
      const controlRow =
        row.control && typeof row.control === "object"
          ? (row.control as Record<string, unknown>)
          : null;
      const controlX = controlRow ? readNumber(controlRow.x) : undefined;
      const controlY = controlRow ? readNumber(controlRow.y) : undefined;
      return {
        from: {
          nodeId: fromNodeId,
          port: "out" as PortType,
          side:
            from.side === "top" || from.side === "right" || from.side === "bottom" || from.side === "left"
              ? (from.side as NodeAnchorSide)
              : undefined,
        },
        to: {
          nodeId: toNodeId,
          port: "in" as PortType,
          side: to.side === "top" || to.side === "right" || to.side === "bottom" || to.side === "left"
            ? (to.side as NodeAnchorSide)
            : undefined,
        },
        control:
          typeof controlX === "number" && typeof controlY === "number"
            ? { x: controlX, y: controlY }
            : undefined,
      } as GraphEdge;
    })
    .filter(Boolean) as GraphEdge[];

  return {
    version: Math.max(version, GRAPH_SCHEMA_VERSION),
    nodes: normalizedNodes,
    edges: normalizedEdges,
    knowledge: normalizeKnowledgeConfig(data.knowledge),
  };
}

function validateSimpleSchema(schema: unknown, data: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const rule = schema as Record<string, unknown>;
  const errors: string[] = [];

  if (Array.isArray(rule.enum) && rule.enum.length > 0) {
    const exists = rule.enum.some((item) => JSON.stringify(item) === JSON.stringify(data));
    if (!exists) {
      errors.push(`${path}: value must be one of enum`);
      return errors;
    }
  }

  const expectedType = typeof rule.type === "string" ? rule.type : "";
  if (expectedType) {
    const typeOk =
      (expectedType === "object" && data !== null && typeof data === "object" && !Array.isArray(data)) ||
      (expectedType === "array" && Array.isArray(data)) ||
      (expectedType === "string" && typeof data === "string") ||
      (expectedType === "number" && typeof data === "number") ||
      (expectedType === "integer" && Number.isInteger(data)) ||
      (expectedType === "boolean" && typeof data === "boolean") ||
      (expectedType === "null" && data === null);
    if (!typeOk) {
      errors.push(`${path}: expected type ${expectedType}`);
      return errors;
    }
  }

  if (expectedType === "object" && data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(rule.required)) {
      for (const key of rule.required) {
        if (typeof key === "string" && !(key in record)) {
          errors.push(`${path}.${key}: required`);
        }
      }
    }
    if (rule.properties && typeof rule.properties === "object") {
      const properties = rule.properties as Record<string, unknown>;
      for (const [key, childSchema] of Object.entries(properties)) {
        if (key in record) {
          errors.push(...validateSimpleSchema(childSchema, record[key], `${path}.${key}`));
        }
      }
    }
  }

  if (expectedType === "array" && Array.isArray(data) && rule.items) {
    for (let i = 0; i < data.length; i += 1) {
      errors.push(...validateSimpleSchema(rule.items, data[i], `${path}[${i}]`));
    }
  }

  return errors;
}

function isTurnTerminalEvent(method: string, params: unknown): TurnTerminal | null {
  if (method === "turn/completed") {
    return { ok: true, status: "completed", params };
  }
  if (method === "turn/failed") {
    return { ok: false, status: "failed", params };
  }

  if (method === "item/completed") {
    const kind = extractStringByPaths(params, ["type", "kind", "item.type", "item.kind"]);
    if (kind && !kind.toLowerCase().includes("turn")) {
      return null;
    }
    const status = (extractCompletedStatus(params) ?? "").toLowerCase();
    if (["failed", "error", "cancelled", "rejected"].includes(status)) {
      return { ok: false, status, params };
    }
    if (["completed", "done", "success", "succeeded"].includes(status)) {
      return { ok: true, status, params };
    }
  }

  return null;
}

function App() {
  const defaultCwd = useMemo(() => loadPersistedCwd("."), []);
  const defaultLoginCompleted = useMemo(() => loadPersistedLoginCompleted(), []);
  const defaultAuthMode = useMemo(() => loadPersistedAuthMode(), []);

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("workflow");

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState<string>(DEFAULT_TURN_MODEL);
  const [costPreset, setCostPreset] = useState<CostPreset>("balanced");
  const [workflowQuestion, setWorkflowQuestion] = useState(
    "언어 학습에서 AI가 기존 학습 패러다임을 어떻게 개선할 수 있는지 분석해줘.",
  );

  const [engineStarted, setEngineStarted] = useState(false);
  const [status, setStatus] = useState("대기 중");
  const [running, setRunning] = useState(false);
  const [error, setErrorState] = useState("");
  const [, setErrorLogs] = useState<string[]>([]);

  const [usageInfoText, setUsageInfoText] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(defaultAuthMode);
  const [loginCompleted, setLoginCompleted] = useState(defaultLoginCompleted);
  const [codexAuthBusy, setCodexAuthBusy] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [pendingWebTurn, setPendingWebTurn] = useState<PendingWebTurn | null>(null);
  const [pendingWebLogin, setPendingWebLogin] = useState<PendingWebLogin | null>(null);
  const [webResponseDraft, setWebResponseDraft] = useState("");
  const [, setWebWorkerHealth] = useState<WebWorkerHealth>({
    running: false,
  });
  const [webWorkerBusy, setWebWorkerBusy] = useState(false);
  const [webBridgeStatus, setWebBridgeStatus] = useState<WebBridgeStatus>({
    running: false,
    port: 38961,
    tokenMasked: "",
    connectedProviders: [],
    queuedTasks: 0,
    activeTasks: 0,
  });
  const [webBridgeLogs, setWebBridgeLogs] = useState<string[]>([]);
  const [webBridgeConnectCode, setWebBridgeConnectCode] = useState("");
  const [providerChildViewOpen, setProviderChildViewOpen] = useState<Record<WebProvider, boolean>>({
    gemini: false,
    gpt: false,
    grok: false,
    perplexity: false,
    claude: false,
  });

  const [graph, setGraph] = useState<GraphData>({
    version: GRAPH_SCHEMA_VERSION,
    nodes: [],
    edges: [],
    knowledge: defaultKnowledgeConfig(),
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string>("");
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>("");
  const [connectFromSide, setConnectFromSide] = useState<NodeAnchorSide | null>(null);
  const [connectPreviewStartPoint, setConnectPreviewStartPoint] = useState<LogicalPoint | null>(null);
  const [connectPreviewPoint, setConnectPreviewPoint] = useState<LogicalPoint | null>(null);
  const [isConnectingDrag, setIsConnectingDrag] = useState(false);
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);
  const [graphFileName, setGraphFileName] = useState("");
  const [selectedGraphFileName, setSelectedGraphFileName] = useState("");
  const [graphRenameOpen, setGraphRenameOpen] = useState(false);
  const [graphRenameDraft, setGraphRenameDraft] = useState("");
  const [graphFiles, setGraphFiles] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<string[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedViewPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedStatusFilter, setFeedStatusFilter] = useState<FeedStatusFilter>("all");
  const [feedExecutorFilter, setFeedExecutorFilter] = useState<FeedExecutorFilter>("all");
  const [feedPeriodFilter, setFeedPeriodFilter] = useState<FeedPeriodFilter>("all");
  const [feedKeyword, setFeedKeyword] = useState("");
  const [feedCategory, setFeedCategory] = useState<FeedCategory>("all_posts");
  const [feedFilterOpen, setFeedFilterOpen] = useState(false);
  const [feedExpandedByPost, setFeedExpandedByPost] = useState<Record<string, boolean>>({});
  const [feedShareMenuPostId, setFeedShareMenuPostId] = useState<string | null>(null);
  const [feedReplyDraftByPost, setFeedReplyDraftByPost] = useState<Record<string, string>>({});
  const [feedInspectorPostId, setFeedInspectorPostId] = useState("");
  const [feedInspectorSnapshotNode, setFeedInspectorSnapshotNode] = useState<GraphNode | null>(null);
  const [feedInspectorRuleDocs, setFeedInspectorRuleDocs] = useState<AgentRuleDoc[]>([]);
  const [feedInspectorRuleLoading, setFeedInspectorRuleLoading] = useState(false);
  const [pendingNodeRequests, setPendingNodeRequests] = useState<Record<string, string[]>>({});
  const [activeFeedRunMeta, setActiveFeedRunMeta] = useState<{
    runId: string;
    question: string;
    startedAt: string;
  } | null>(null);
  const [selectedRunFile, setSelectedRunFile] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunRecord | null>(null);
  const [lastSavedRunFile, setLastSavedRunFile] = useState("");
  const [nodeStates, setNodeStates] = useState<Record<string, NodeRunState>>({});
  const [isGraphRunning, setIsGraphRunning] = useState(false);
  const [isRunStarting, setIsRunStarting] = useState(false);
  const [runtimeNowMs, setRuntimeNowMs] = useState(() => Date.now());
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [canvasLogicalViewport, setCanvasLogicalViewport] = useState({
    width: DEFAULT_STAGE_WIDTH,
    height: DEFAULT_STAGE_HEIGHT,
  });
  const [undoStack, setUndoStack] = useState<GraphData[]>([]);
  const [redoStack, setRedoStack] = useState<GraphData[]>([]);
  const [, setNodeSizeVersion] = useState(0);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
  const hasTauriRuntime = useMemo(
    () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__),
    [],
  );

  const dragRef = useRef<DragState | null>(null);
  const edgeDragRef = useRef<EdgeDragState | null>(null);
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);
  const nodeSizeMapRef = useRef<Record<string, NodeVisualSize>>({});
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const dragPointerRef = useRef<PointerState | null>(null);
  const dragAutoPanFrameRef = useRef<number | null>(null);
  const dragWindowMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragWindowUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragStartSnapshotRef = useRef<GraphData | null>(null);
  const edgeDragStartSnapshotRef = useRef<GraphData | null>(null);
  const edgeDragWindowMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const edgeDragWindowUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const zoomStatusTimerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);
  const activeTurnNodeIdRef = useRef<string>("");
  const activeWebNodeIdRef = useRef<string>("");
  const activeWebProviderRef = useRef<WebProvider | null>(null);
  const turnTerminalResolverRef = useRef<((terminal: TurnTerminal) => void) | null>(null);
  const webTurnResolverRef = useRef<((result: { ok: boolean; output?: unknown; error?: string }) => void) | null>(
    null,
  );
  const webLoginResolverRef = useRef<((retry: boolean) => void) | null>(null);
  const activeRunDeltaRef = useRef<Record<string, string>>({});
  const collectingRunRef = useRef(false);
  const runLogCollectorRef = useRef<Record<string, string[]>>({});
  const feedRunCacheRef = useRef<Record<string, RunRecord>>({});
  const feedRawAttachmentRef = useRef<Record<string, string>>({});
  const pendingNodeRequestsRef = useRef<Record<string, string[]>>({});
  const agentRulesCacheRef = useRef<Record<string, { loadedAt: number; docs: AgentRuleDoc[] }>>({});
  const runStartGuardRef = useRef(false);
  const pendingWebTurnAutoOpenKeyRef = useRef("");
  const pendingWebLoginAutoOpenKeyRef = useRef("");
  const authLoginRequiredProbeCountRef = useRef(0);
  const lastAuthenticatedAtRef = useRef<number>(defaultLoginCompleted ? Date.now() : 0);
  const codexLoginLastAttemptAtRef = useRef(0);

  const activeApproval = pendingApprovals[0];
  const canvasNodes = useMemo(() => {
    if (!SIMPLE_WORKFLOW_UI) {
      return graph.nodes;
    }
    return graph.nodes.filter((node) => node.type === "turn");
  }, [graph.nodes]);
  const canvasNodeIdSet = useMemo(() => new Set(canvasNodes.map((node) => node.id)), [canvasNodes]);
  const canvasNodeMap = useMemo(() => new Map(canvasNodes.map((node) => [node.id, node])), [canvasNodes]);
  const canvasEdges = useMemo(() => {
    if (!SIMPLE_WORKFLOW_UI) {
      return graph.edges;
    }
    return graph.edges.filter(
      (edge) => canvasNodeIdSet.has(edge.from.nodeId) && canvasNodeIdSet.has(edge.to.nodeId),
    );
  }, [graph.edges, canvasNodeIdSet]);
  const canvasDisplayEdges = useMemo<CanvasDisplayEdge[]>(() => {
    const editableEdges: CanvasDisplayEdge[] = canvasEdges.map((edge) => ({
      edge,
      edgeKey: getGraphEdgeKey(edge),
      readOnly: false,
    }));
    if (!SIMPLE_WORKFLOW_UI) {
      return editableEdges;
    }

    const editablePairSet = new Set(
      editableEdges.map((row) => `${row.edge.from.nodeId}->${row.edge.to.nodeId}`),
    );
    const readonlyPairs = buildSimpleReadonlyTurnEdges(graph, canvasNodeIdSet).filter(
      (pair) => !editablePairSet.has(`${pair.fromId}->${pair.toId}`),
    );
    const readonlyEdges: CanvasDisplayEdge[] = readonlyPairs.map((pair) => ({
      edge: {
        from: { nodeId: pair.fromId, port: "out" },
        to: { nodeId: pair.toId, port: "in" },
      },
      edgeKey: `readonly:${pair.fromId}->${pair.toId}`,
      readOnly: true,
    }));

    return [...editableEdges, ...readonlyEdges];
  }, [canvasEdges, canvasNodeIdSet, graph]);
  const selectedNode = canvasNodes.find((node) => node.id === selectedNodeId) ?? null;
  const questionDirectInputNodeIds = useMemo(() => {
    const incomingNodeIds = new Set(graph.edges.map((edge) => edge.to.nodeId));
    return new Set(graph.nodes.filter((node) => !incomingNodeIds.has(node.id)).map((node) => node.id));
  }, [graph.edges, graph.nodes]);
  const graphKnowledge = normalizeKnowledgeConfig(graph.knowledge);
  const enabledKnowledgeFiles = graphKnowledge.files.filter((row) => row.enabled);
  const selectedKnowledgeMaxCharsOption = closestNumericOptionValue(
    KNOWLEDGE_MAX_CHARS_OPTIONS,
    graphKnowledge.maxChars,
    KNOWLEDGE_DEFAULT_MAX_CHARS,
  );

  function setError(next: string) {
    setErrorState(next);
    const trimmed = next.trim();
    if (!trimmed) {
      return;
    }
    const at = new Date().toISOString();
    setErrorLogs((prev) => [`[${at}] ${trimmed}`, ...prev].slice(0, 600));
  }

  function getNodeVisualSize(nodeId: string): NodeVisualSize {
    return nodeSizeMapRef.current[nodeId] ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
  }

  function setNodeSelection(nextIds: string[], primaryId?: string) {
    const deduped = nextIds.filter((id, index, arr) => arr.indexOf(id) === index);
    setSelectedNodeIds(deduped);
    if (deduped.length === 0) {
      setSelectedNodeId("");
      return;
    }
    if (primaryId && deduped.includes(primaryId)) {
      setSelectedNodeId(primaryId);
      return;
    }
    if (selectedNodeId && deduped.includes(selectedNodeId)) {
      return;
    }
    setSelectedNodeId(deduped[deduped.length - 1]);
  }

  function addNodeLog(nodeId: string, message: string) {
    if (collectingRunRef.current) {
      const current = runLogCollectorRef.current[nodeId] ?? [];
      runLogCollectorRef.current[nodeId] = [...current, message].slice(-500);
    }
    setNodeStates((prev) => {
      const current = prev[nodeId] ?? { status: "idle", logs: [] };
      const nextLogs = [...current.logs, message].slice(-300);
      return {
        ...prev,
        [nodeId]: {
          ...current,
          logs: nextLogs,
        },
      };
    });
  }

  function setNodeStatus(nodeId: string, statusValue: NodeExecutionStatus, message?: string) {
    setNodeStates((prev) => {
      const current = prev[nodeId] ?? { status: "idle", logs: [] };
      const nextLogs = message ? [...current.logs, message].slice(-300) : current.logs;
      return {
        ...prev,
        [nodeId]: {
          ...current,
          status: statusValue,
          logs: nextLogs,
        },
      };
    });
  }

  function setNodeRuntimeFields(nodeId: string, patch: Partial<NodeRunState>) {
    setNodeStates((prev) => {
      const current = prev[nodeId] ?? { status: "idle", logs: [] };
      return {
        ...prev,
        [nodeId]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function enqueueNodeRequest(nodeId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const next = [...(pendingNodeRequestsRef.current[nodeId] ?? []), trimmed];
    pendingNodeRequestsRef.current = {
      ...pendingNodeRequestsRef.current,
      [nodeId]: next,
    };
    setPendingNodeRequests((prev) => ({
      ...prev,
      [nodeId]: next,
    }));
    addNodeLog(nodeId, `[사용자 추가 요청] ${trimmed}`);
  }

  function consumeNodeRequests(nodeId: string): string[] {
    const queued = [...(pendingNodeRequestsRef.current[nodeId] ?? [])];
    pendingNodeRequestsRef.current = {
      ...pendingNodeRequestsRef.current,
      [nodeId]: [],
    };
    setPendingNodeRequests((prev) => ({
      ...prev,
      [nodeId]: [],
    }));
    return queued;
  }

  function markCodexNodesStatusOnEngineIssue(
    nextStatus: "failed" | "cancelled",
    message: string,
    includeIdle = false,
  ) {
    const now = Date.now();
    const finishedAt = new Date(now).toISOString();
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    const isTerminal = (status: NodeExecutionStatus) =>
      status === "done" || status === "failed" || status === "skipped" || status === "cancelled";

    setNodeStates((prev) => {
      const next: Record<string, NodeRunState> = { ...prev };
      let changed = false;

      for (const [nodeId, current] of Object.entries(prev)) {
        const node = nodeById.get(nodeId);
        if (!node || node.type !== "turn") {
          continue;
        }
        if (getTurnExecutor(node.config as TurnConfig) !== "codex") {
          continue;
        }
        if (isTerminal(current.status)) {
          continue;
        }
        if (!includeIdle && current.status === "idle") {
          continue;
        }

        changed = true;
        next[nodeId] = {
          ...current,
          status: nextStatus,
          error: nextStatus === "failed" ? message : current.error,
          finishedAt,
          durationMs: current.startedAt
            ? Math.max(0, now - new Date(current.startedAt).getTime())
            : current.durationMs,
          logs: [...current.logs, message].slice(-300),
        };
      }

      return changed ? next : prev;
    });
  }

  function applyGraphChange(
    updater: (prev: GraphData) => GraphData,
    options?: { autoLayout?: boolean },
  ) {
    setGraph((prev) => {
      const rawNext = updater(prev);
      const next = options?.autoLayout ? autoArrangeGraphLayout(rawNext) : rawNext;
      if (graphEquals(prev, next)) {
        return prev;
      }
      setUndoStack((stack) => [...stack.slice(-79), cloneGraph(prev)]);
      setRedoStack([]);
      return next;
    });
  }

  function onUndoGraph() {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) {
        return prevUndo;
      }
      const snapshot = prevUndo[prevUndo.length - 1];
      setGraph((current) => {
        setRedoStack((redo) => [...redo.slice(-79), cloneGraph(current)]);
        return cloneGraph(snapshot);
      });
      return prevUndo.slice(0, -1);
    });
  }

  function onRedoGraph() {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) {
        return prevRedo;
      }
      const snapshot = prevRedo[prevRedo.length - 1];
      setGraph((current) => {
        setUndoStack((undo) => [...undo.slice(-79), cloneGraph(current)]);
        return cloneGraph(snapshot);
      });
      return prevRedo.slice(0, -1);
    });
  }

  function reportSoftError(prefix: string, error: unknown) {
    const message = `${prefix}: ${toErrorText(error)}`;
    console.error(message, error);
    setError(message);
  }

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      reportSoftError("unhandled rejection", event.reason);
    };
    const onWindowError = (event: ErrorEvent) => {
      reportSoftError("runtime error", event.error ?? event.message);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrapWorker = async () => {
      try {
        await invoke("web_worker_start");
      } catch {
        // non-fatal: fallback path handles worker unavailable
      }
      try {
        const health = await invoke<WebWorkerHealth>("web_provider_health");
        if (!cancelled) {
          setWebWorkerHealth(health);
          if (health.bridge) {
            setWebBridgeStatus(toWebBridgeStatus(health.bridge));
          }
        }
      } catch {
        // silent: settings panel refresh button shows latest state on demand
      }
      if (!cancelled) {
        void refreshWebBridgeStatus(true);
      }
    };
    void bootstrapWorker();
    return () => {
      cancelled = true;
      void invoke("web_worker_stop").catch(() => {
        // noop: app shutdown/unmount path
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!hasTauriRuntime) {
      return () => {
        cancelled = true;
      };
    }

    const attach = async () => {
      const unlistenNotification = await listen<EngineNotificationEvent>(
        "engine://notification",
        (event) => {
          try {
            const payload = event.payload;

            if (payload.method === "item/agentMessage/delta") {
              const delta = extractDeltaText(payload.params);
              const activeNodeId = activeTurnNodeIdRef.current;
              if (activeNodeId && delta) {
                activeRunDeltaRef.current[activeNodeId] =
                  (activeRunDeltaRef.current[activeNodeId] ?? "") + delta;
              }
            }

            if (payload.method === "account/login/completed") {
              authLoginRequiredProbeCountRef.current = 0;
              lastAuthenticatedAtRef.current = Date.now();
              setLoginCompleted(true);
              setStatus("로그인 완료 이벤트 수신");
              void refreshAuthStateFromEngine(true);
            }

            if (payload.method === "account/updated") {
              const mode = extractAuthMode(payload.params);
              if (mode) {
                authLoginRequiredProbeCountRef.current = 0;
                lastAuthenticatedAtRef.current = Date.now();
                setAuthMode(mode);
                setLoginCompleted(true);
                setStatus(`계정 상태 갱신 수신 (인증 모드=${mode})`);
              } else {
                setStatus("계정 상태 갱신 수신 (인증 모드 미확인)");
              }
            }

            if (payload.method === "web/progress") {
              const message = extractStringByPaths(payload.params, ["message", "stage", "error"]);
              const activeWebNodeId = activeWebNodeIdRef.current;
              if (activeWebNodeId && message) {
                addNodeLog(activeWebNodeId, `[WEB] ${message}`);
              }
              const stage = extractStringByPaths(payload.params, ["stage"]);
              const provider = extractStringByPaths(payload.params, ["provider"])?.toLowerCase() ?? "";
              if (stage?.startsWith("bridge_")) {
                const prefix = provider && WEB_PROVIDER_OPTIONS.includes(provider as WebProvider)
                  ? `[${provider.toUpperCase()}] `
                  : "";
                const line = `${prefix}${message ?? stage}`;
                setWebBridgeLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 120));
                if (stage === "bridge_waiting_user_send" && provider) {
                  setStatus(`${webProviderLabel(provider as WebProvider)} 탭에서 전송 1회가 필요합니다.`);
                } else if (stage === "bridge_claimed" && provider) {
                  setStatus(`${webProviderLabel(provider as WebProvider)} 탭 연결됨, 프롬프트 주입 중`);
                } else if (stage === "bridge_done" && provider) {
                  setStatus(`${webProviderLabel(provider as WebProvider)} 응답 수집 완료`);
                }
                void refreshWebBridgeStatus(true);
              }
            }

            if (payload.method === "web/worker/ready") {
              setWebWorkerHealth((prev) => ({ ...prev, running: true }));
            }

            if (payload.method === "web/worker/stopped") {
              setWebWorkerHealth((prev) => ({ ...prev, running: false, activeProvider: null }));
            }

            const terminal = isTurnTerminalEvent(payload.method, payload.params);
            if (terminal && turnTerminalResolverRef.current) {
              const resolve = turnTerminalResolverRef.current;
              turnTerminalResolverRef.current = null;
              resolve(terminal);
            }
          } catch (handlerError) {
            reportSoftError("notification handler failed", handlerError);
          }
        },
      );

      const unlistenApprovalRequest = await listen<EngineApprovalRequestEvent>(
        "engine://approval_request",
        (event) => {
          try {
            const payload = event.payload;
            setPendingApprovals((prev) => {
              if (prev.some((item) => item.requestId === payload.requestId)) {
                return prev;
              }
              return [
                ...prev,
                {
                  requestId: payload.requestId,
                  source: "remote",
                  method: payload.method,
                  params: payload.params,
                },
              ];
            });
            setStatus(`승인 요청 수신 (${payload.method})`);
          } catch (handlerError) {
            reportSoftError("approval handler failed", handlerError);
          }
        },
      );

      const unlistenLifecycle = await listen<EngineLifecycleEvent>(
        "engine://lifecycle",
        (event) => {
          try {
            const payload = event.payload;
            const msg = payload.message ? ` (${payload.message})` : "";
            setStatus(`${lifecycleStateLabel(payload.state)}${msg}`);

            if (payload.state === "ready") {
              setEngineStarted(true);
              void refreshAuthStateFromEngine(true);
            }
            if (payload.state === "stopped" || payload.state === "disconnected") {
              setEngineStarted(false);
              markCodexNodesStatusOnEngineIssue("cancelled", "엔진 중지 또는 연결 끊김");
              setUsageInfoText("");
              setPendingApprovals([]);
              setApprovalSubmitting(false);
            }
            if (payload.state === "parseError" || payload.state === "readError" || payload.state === "stderrError") {
              markCodexNodesStatusOnEngineIssue("failed", "엔진/프로토콜 오류");
            }
          } catch (handlerError) {
            reportSoftError("lifecycle handler failed", handlerError);
          }
        },
      );

      if (cancelled) {
        unlistenNotification();
        unlistenApprovalRequest();
        unlistenLifecycle();
      }

      return () => {
        unlistenNotification();
        unlistenApprovalRequest();
        unlistenLifecycle();
      };
    };

    let detach: (() => void) | undefined;
    attach()
      .then((fn) => {
        detach = fn;
      })
      .catch((e) => {
        reportSoftError("event listen failed", e);
      });

    return () => {
      cancelled = true;
      if (detach) {
        detach();
      }
    };
  }, [hasTauriRuntime]);

  async function refreshGraphFiles() {
    if (!hasTauriRuntime) {
      setGraphFiles([]);
      return;
    }
    try {
      const files = await invoke<string[]>("graph_list");
      setGraphFiles(files);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshRunFiles() {
    if (!hasTauriRuntime) {
      setRunFiles([]);
      return;
    }
    try {
      const files = await invoke<string[]>("run_list");
      setRunFiles(files);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshFeedTimeline() {
    if (!hasTauriRuntime) {
      setFeedPosts([]);
      setFeedLoading(false);
      return;
    }
    setFeedLoading(true);
    try {
      const files = await invoke<string[]>("run_list");
      const sorted = [...files].sort((a, b) => b.localeCompare(a)).slice(0, 120);
      const loaded = await Promise.all(
        sorted.map(async (file) => {
          try {
            const rawRun = await invoke<RunRecord>("run_load", { name: file });
            return { file, run: normalizeRunRecord(rawRun) };
          } catch {
            return null;
          }
        }),
      );
      const nextCache: Record<string, RunRecord> = {};
      const mergedPosts: FeedViewPost[] = [];
      for (const row of loaded) {
        if (!row) {
          continue;
        }
        nextCache[row.file] = row.run;
        const runQuestion = row.run.question;
        const posts = row.run.feedPosts ?? [];
        for (const post of posts) {
          mergedPosts.push({
            ...post,
            sourceFile: row.file,
            question: runQuestion,
          });
        }
      }
      mergedPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      feedRunCacheRef.current = nextCache;
      setFeedPosts(mergedPosts);
    } catch (e) {
      setError(`피드 로드 실패: ${String(e)}`);
    } finally {
      setFeedLoading(false);
    }
  }

  async function onOpenRunsFolder() {
    setError("");
    try {
      const runsDir = await invoke<string>("run_directory");
      await revealItemInDir(runsDir);
      setStatus("실행 기록 폴더 열림");
    } catch (e) {
      setError(toOpenRunsFolderErrorMessage(e));
    }
  }

  async function loadRunDetail(name: string) {
    const target = name.trim();
    if (!target) {
      return;
    }

    try {
      const run = await invoke<RunRecord>("run_load", { name: target });
      setSelectedRunFile(target);
      setSelectedRunDetail(normalizeRunRecord(run));
    } catch (e) {
      setError(String(e));
    }
  }

  async function onDeleteSelectedRun() {
    const target = selectedRunFile.trim();
    if (!target) {
      return;
    }

    setError("");
    try {
      await invoke("run_delete", { name: target });
      const files = await invoke<string[]>("run_list");
      setRunFiles(files);
      setSelectedRunFile("");
      setSelectedRunDetail(null);
      setStatus(`실행 기록 삭제: ${target}`);
      await refreshFeedTimeline();
    } catch (e) {
      setError(`실행 기록 삭제 실패: ${String(e)}`);
    }
  }

  async function ensureFeedRunRecord(sourceFile: string): Promise<RunRecord | null> {
    const target = sourceFile.trim();
    if (!target) {
      return null;
    }
    const cached = feedRunCacheRef.current[target];
    if (cached) {
      return cached;
    }
    try {
      const loaded = await invoke<RunRecord>("run_load", { name: target });
      const normalized = normalizeRunRecord(loaded);
      feedRunCacheRef.current[target] = normalized;
      return normalized;
    } catch {
      return null;
    }
  }

  function buildFeedShareText(post: FeedViewPost, run: RunRecord | null): string {
    const markdownAttachment = post.attachments.find((attachment) => attachment.kind === "markdown");
    const rawContent = markdownAttachment?.content?.trim() ?? "";
    const visibleSteps = normalizeFeedSteps(post.steps);
    const lines: string[] = [
      `# ${post.agentName}`,
      `- 상태: ${feedPostStatusLabel(post.status)}`,
      `- 역할: ${post.roleLabel}`,
      `- 생성 시간: ${formatRunDateTime(post.createdAt)}`,
    ];
    if (run?.runId) {
      lines.push(`- 실행 ID: ${run.runId}`);
    }
    if (post.sourceFile) {
      lines.push(`- 기록 파일: ${formatRunFileLabel(post.sourceFile)}`);
    }
    if (post.question?.trim()) {
      lines.push("", "## 질문", post.question.trim());
    }
    lines.push("", "## 요약", post.summary?.trim() || "(요약 없음)");
    if (visibleSteps.length > 0) {
      lines.push("", "## 단계", ...visibleSteps.map((step) => `- ${step}`));
    }
    if (rawContent) {
      lines.push("", "## 상세", rawContent);
    }
    return lines.join("\n");
  }

  async function onShareFeedPost(post: FeedViewPost, mode: "clipboard" | "email" | "obsidian" | "json") {
    setError("");
    setFeedShareMenuPostId(null);
    const run = await ensureFeedRunRecord(post.sourceFile);
    const shareText = buildFeedShareText(post, run);
    const title = sanitizeShareTitle(`${post.agentName}-${new Date(post.createdAt).toISOString().slice(0, 10)}`);
    try {
      if (mode === "clipboard") {
        await navigator.clipboard.writeText(shareText);
        setStatus("공유 텍스트 복사 완료");
        return;
      }
      if (mode === "json") {
        const payload = {
          post,
          runId: run?.runId ?? null,
          sourceFile: post.sourceFile || null,
          exportedAt: new Date().toISOString(),
        };
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setStatus("공유 JSON 복사 완료");
        return;
      }
      if (mode === "email") {
        const subject = `[RAIL] ${post.agentName} 실행 결과 공유`;
        const body = shareText.slice(0, 1800);
        await openUrl(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
        setStatus("이메일 공유 창 열림");
        return;
      }
      const obsidianUri = `obsidian://new?name=${encodeURIComponent(title)}&content=${encodeURIComponent(
        shareText.slice(0, 7000),
      )}`;
      await openUrl(obsidianUri);
      setStatus("옵시디언 공유 창 열림");
    } catch (e) {
      setError(`공유 실패: ${String(e)}`);
    }
  }

  async function onDeleteFeedPost(post: FeedViewPost) {
    setError("");
    setFeedShareMenuPostId(null);
    const sourceFile = post.sourceFile.trim();
    if (!sourceFile) {
      return;
    }
    try {
      const run = await ensureFeedRunRecord(sourceFile);
      if (!run) {
        throw new Error("실행 기록을 불러오지 못했습니다.");
      }
      const beforePosts = run.feedPosts ?? [];
      const nextPosts = beforePosts.filter((item) => item.id !== post.id);
      if (nextPosts.length === beforePosts.length) {
        setStatus("삭제할 포스트를 찾지 못했습니다.");
        return;
      }

      const nextRun: RunRecord = {
        ...run,
        feedPosts: nextPosts,
      };

      await invoke("run_save", { name: sourceFile, run: nextRun });
      feedRunCacheRef.current[sourceFile] = nextRun;
      setFeedPosts((prev) => prev.filter((item) => !(item.sourceFile === sourceFile && item.id === post.id)));
      if (selectedRunFile === sourceFile) {
        setSelectedRunDetail(nextRun);
      }
      setStatus(`포스트 삭제 완료: ${post.agentName}`);
    } catch (e) {
      setError(`포스트 삭제 실패: ${String(e)}`);
    }
  }

  async function onSubmitFeedAgentRequest(post: FeedViewPost) {
    const draft = (feedReplyDraftByPost[post.id] ?? "").trim();
    if (!draft) {
      return;
    }
    const node = graph.nodes.find((row) => row.id === post.nodeId);
    if (!node || node.type !== "turn") {
      setError("이 포스트는 추가 요청을 받을 수 없는 노드입니다.");
      return;
    }

    enqueueNodeRequest(node.id, draft);
    setFeedReplyDraftByPost((prev) => ({
      ...prev,
      [post.id]: "",
    }));

    if (isGraphRunning) {
      setStatus(`${turnModelLabel(node)} 에이전트 요청을 큐에 추가했습니다.`);
      return;
    }

    const oneOffRunId = `manual-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const followupInput = [
      post.question ? `[원래 질문]\n${post.question}` : "",
      post.summary ? `[이전 결과 요약]\n${post.summary}` : "",
      `[사용자 추가 요청]\n${draft}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    setNodeStatus(node.id, "running", "피드 추가 요청 실행 시작");
    setNodeRuntimeFields(node.id, {
      status: "running",
      startedAt,
      finishedAt: undefined,
      durationMs: undefined,
      error: undefined,
    });
    try {
      const startedAtMs = Date.now();
      const result = await executeTurnNode(node, followupInput);
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - startedAtMs;
      if (!result.ok) {
        setNodeStatus(node.id, "failed", result.error ?? "피드 추가 요청 실행 실패");
        setNodeRuntimeFields(node.id, {
          status: "failed",
          error: result.error,
          finishedAt,
          durationMs,
          threadId: result.threadId,
          turnId: result.turnId,
          usage: result.usage,
        });
        const failed = buildFeedPost({
          runId: oneOffRunId,
          node,
          status: "failed",
          createdAt: finishedAt,
          summary: result.error ?? "피드 추가 요청 실행 실패",
          logs: nodeStates[node.id]?.logs ?? [],
          output: result.output,
          error: result.error,
          durationMs,
          usage: result.usage,
        });
        feedRawAttachmentRef.current[feedAttachmentRawKey(failed.post.id, "markdown")] =
          failed.rawAttachments.markdown;
        feedRawAttachmentRef.current[feedAttachmentRawKey(failed.post.id, "json")] = failed.rawAttachments.json;
        setFeedPosts((prev) => [
          {
            ...failed.post,
            sourceFile: "",
            question: post.question,
          },
          ...prev,
        ]);
        setStatus("피드 추가 요청 실행 실패");
        return;
      }

      setNodeStatus(node.id, "done", "피드 추가 요청 실행 완료");
      setNodeRuntimeFields(node.id, {
        status: "done",
        output: result.output,
        finishedAt,
        durationMs,
        threadId: result.threadId,
        turnId: result.turnId,
        usage: result.usage,
      });
      const done = buildFeedPost({
        runId: oneOffRunId,
        node,
        status: "done",
        createdAt: finishedAt,
        summary: "피드 추가 요청 실행 완료",
        logs: nodeStates[node.id]?.logs ?? [],
        output: result.output,
        durationMs,
        usage: result.usage,
      });
      feedRawAttachmentRef.current[feedAttachmentRawKey(done.post.id, "markdown")] = done.rawAttachments.markdown;
      feedRawAttachmentRef.current[feedAttachmentRawKey(done.post.id, "json")] = done.rawAttachments.json;
      setFeedPosts((prev) => [
        {
          ...done.post,
          sourceFile: "",
          question: post.question,
        },
        ...prev,
      ]);
      setStatus("피드 추가 요청 실행 완료");
    } catch (error) {
      setError(`피드 추가 요청 실행 실패: ${String(error)}`);
    }
  }

  useEffect(() => {
    refreshGraphFiles();
    refreshRunFiles();
    refreshFeedTimeline();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await ensureEngineStarted();
        await refreshAuthStateFromEngine(true);
        if (!cancelled) {
          setStatus("준비됨");
        }
      } catch (e) {
        if (isEngineAlreadyStartedError(e)) {
          if (!cancelled) {
            setEngineStarted(true);
            setStatus("준비됨");
          }
          return;
        }
        const message = toErrorText(e);
        if (!cancelled) {
          setStatus(`자동 시작 실패 (${message})`);
        }
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function ensureEngineStarted() {
    if (engineStarted) {
      return;
    }
    try {
      await invoke("engine_start", { cwd });
      setEngineStarted(true);
    } catch (error) {
      if (isEngineAlreadyStartedError(error)) {
        setEngineStarted(true);
        return;
      }
      throw error;
    }
  }

  async function onStartEngine() {
    setError("");
    try {
      await ensureEngineStarted();
      await refreshAuthStateFromEngine(true);
      setStatus("준비됨");
    } catch (e) {
      if (isEngineAlreadyStartedError(e)) {
        setEngineStarted(true);
        setStatus("준비됨");
        return;
      }
      setError(toErrorText(e));
    }
  }

  async function onStopEngine() {
    setError("");
    try {
      await invoke("engine_stop");
      setEngineStarted(false);
      markCodexNodesStatusOnEngineIssue("cancelled", "엔진 정지");
      setStatus("중지됨");
      setRunning(false);
      setIsGraphRunning(false);
      setUsageInfoText("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshAuthStateFromEngine(silent = true): Promise<AuthProbeResult | null> {
    try {
      const result = await invoke<AuthProbeResult>("auth_probe");
      const mode = extractAuthMode(result.authMode ?? null) ?? extractAuthMode(result.raw ?? null);
      if (mode) {
        setAuthMode(mode);
      }

      if (result.state === "authenticated") {
        authLoginRequiredProbeCountRef.current = 0;
        lastAuthenticatedAtRef.current = Date.now();
        setLoginCompleted(true);
        if (!silent) {
          setStatus(mode ? `로그인 상태 확인됨 (인증 모드=${mode})` : "로그인 상태 확인됨");
        }
      } else if (result.state === "login_required") {
        const now = Date.now();
        const nextProbeCount = authLoginRequiredProbeCountRef.current + 1;
        authLoginRequiredProbeCountRef.current = nextProbeCount;
        const withinGraceWindow =
          lastAuthenticatedAtRef.current > 0 &&
          now - lastAuthenticatedAtRef.current < AUTH_LOGIN_REQUIRED_GRACE_MS;
        const shouldKeepSession =
          loginCompleted && (withinGraceWindow || nextProbeCount < AUTH_LOGIN_REQUIRED_CONFIRM_COUNT);

        if (shouldKeepSession) {
          if (!silent) {
            setStatus(
              `로그인 상태 재확인 중 (${Math.min(nextProbeCount, AUTH_LOGIN_REQUIRED_CONFIRM_COUNT)}/${AUTH_LOGIN_REQUIRED_CONFIRM_COUNT})`,
            );
          }
        } else {
          setLoginCompleted(false);
          if (!silent) {
            setStatus("로그인 필요");
          }
        }
      } else {
        authLoginRequiredProbeCountRef.current = 0;
        if (!silent) {
          setStatus("계정 상태 확인됨 (상태 미확인)");
        }
      }

      return result;
    } catch (error) {
      if (!silent) {
        setError(`계정 상태 확인 실패: ${String(error)}`);
      }
      return null;
    }
  }

  async function onCheckUsage() {
    setError("");
    try {
      await ensureEngineStarted();
      const beforeProbe = await refreshAuthStateFromEngine(true);
      if (beforeProbe?.state === "login_required" && !loginCompleted) {
        setLoginCompleted(false);
        setUsageInfoText("");
        throw new Error("로그인이 완료되지 않아 사용량을 조회할 수 없습니다. 설정에서 로그인 후 다시 시도해주세요.");
      }
      const result = await invoke<UsageCheckResult>("usage_check");
      const mode = extractAuthMode(result.raw);
      if (mode) {
        setAuthMode(mode);
      }
      const probed = await refreshAuthStateFromEngine(true);
      if (probed?.state === "authenticated") {
        setLoginCompleted(true);
      } else if (probed?.state === "login_required" && !loginCompleted) {
        setLoginCompleted(false);
      } else if (mode) {
        setLoginCompleted(true);
      }
      setUsageInfoText(formatUsageInfoForDisplay(result.raw));
      setStatus("사용량 조회 완료");
    } catch (e) {
      setError(toUsageCheckErrorMessage(e));
      setStatus("사용량 조회 실패");
    }
  }

  async function onLoginCodex() {
    setError("");
    if (codexAuthBusy) {
      setStatus("Codex 인증 요청 처리 중입니다.");
      return;
    }
    try {
      if (!loginCompleted) {
        const now = Date.now();
        const elapsed = now - codexLoginLastAttemptAtRef.current;
        if (elapsed < CODEX_LOGIN_COOLDOWN_MS) {
          const remainSec = Math.ceil((CODEX_LOGIN_COOLDOWN_MS - elapsed) / 1000);
          setStatus(`Codex 로그인 재시도 대기 ${remainSec}초`);
          return;
        }
        codexLoginLastAttemptAtRef.current = now;
      }
      setCodexAuthBusy(true);
      await ensureEngineStarted();
      const probed = await refreshAuthStateFromEngine(true);
      const effectiveLoggedIn =
        probed?.state === "authenticated" || (probed?.state !== "login_required" && loginCompleted);
      const shouldLogout = loginCompleted && effectiveLoggedIn;

      if (!shouldLogout && effectiveLoggedIn) {
        setLoginCompleted(true);
        setStatus("이미 로그인 상태입니다.");
        return;
      }

      if (shouldLogout) {
        await invoke("logout_codex");
        await invoke("engine_stop");
        setEngineStarted(false);
        await invoke("engine_start", { cwd });
        setEngineStarted(true);
        authLoginRequiredProbeCountRef.current = 0;
        lastAuthenticatedAtRef.current = 0;
        setLoginCompleted(false);
        setAuthMode("unknown");
        setUsageInfoText("");
        setStatus("Codex 로그아웃 완료");
        return;
      }
      const result = await invoke<LoginChatgptResult>("login_chatgpt");
      const authUrl = typeof result?.authUrl === "string" ? result.authUrl.trim() : "";
      if (!authUrl) {
        throw new Error("로그인 URL을 받지 못했습니다.");
      }
      await openUrl(authUrl);
      setStatus("Codex 로그인 창 열림 (재시도 제한 45초)");
    } catch (e) {
      const shouldLogout = loginCompleted;
      if (shouldLogout) {
        setError(`Codex 로그아웃 실패: ${String(e)}`);
      } else {
        setError(`Codex 로그인 시작 실패: ${String(e)}`);
      }
    } finally {
      setCodexAuthBusy(false);
    }
  }

  async function onSelectCwdDirectory() {
    setError("");
    try {
      const selected = await invoke<string | null>("dialog_pick_directory");
      const selectedDirectory = typeof selected === "string" ? selected.trim() : "";
      if (!selectedDirectory) {
        return;
      }
      setCwd(selectedDirectory);
      setStatus(`작업 경로 선택됨: ${selectedDirectory.toLowerCase()}`);
    } catch (error) {
      setError(`작업 경로 선택 실패: ${String(error)}`);
    }
  }

  async function attachKnowledgeFiles(paths: string[]) {
    const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
    if (uniquePaths.length === 0) {
      setError("선택한 파일 경로를 읽지 못했습니다. 다시 선택해주세요.");
      return;
    }

    setError("");
    try {
      const probed = await invoke<KnowledgeFileRef[]>("knowledge_probe", { paths: uniquePaths });
      applyGraphChange((prev) => {
        const existingByPath = new Map(
          (prev.knowledge?.files ?? []).map((row) => [row.path, row] as const),
        );
        for (const row of probed) {
          const existing = existingByPath.get(row.path);
          existingByPath.set(row.path, {
            ...row,
            enabled: existing ? existing.enabled : row.enabled,
          });
        }
        return {
          ...prev,
          knowledge: {
            ...(prev.knowledge ?? defaultKnowledgeConfig()),
            files: Array.from(existingByPath.values()),
          },
        };
      });
      setStatus(`첨부 자료 ${uniquePaths.length}개 추가됨`);
    } catch (error) {
      setError(`첨부 자료 추가 실패: ${String(error)}`);
    }
  }

  async function onOpenKnowledgeFilePicker() {
    try {
      const selectedPaths = await invoke<string[]>("dialog_pick_knowledge_files");
      if (selectedPaths.length === 0) {
        return;
      }
      await attachKnowledgeFiles(selectedPaths);
    } catch (error) {
      setError(`첨부 파일 선택 실패: ${String(error)}`);
    }
  }

  function onRemoveKnowledgeFile(fileId: string) {
    applyGraphChange((prev) => ({
      ...prev,
      knowledge: {
        ...(prev.knowledge ?? defaultKnowledgeConfig()),
        files: (prev.knowledge?.files ?? []).filter((row) => row.id !== fileId),
      },
    }));
  }

  function onToggleKnowledgeFileEnabled(fileId: string) {
    applyGraphChange((prev) => ({
      ...prev,
      knowledge: {
        ...(prev.knowledge ?? defaultKnowledgeConfig()),
        files: (prev.knowledge?.files ?? []).map((row) =>
          row.id === fileId ? { ...row, enabled: !row.enabled } : row,
        ),
      },
    }));
  }

  async function onOpenPendingProviderWindow() {
    if (!pendingWebTurn) {
      return;
    }
    try {
      await openUrl(webProviderHomeUrl(pendingWebTurn.provider));
      setStatus(`${webProviderLabel(pendingWebTurn.provider)} 기본 브라우저 열림`);
    } catch (error) {
      setError(String(error));
    }
  }

  async function onCloseProviderChildView(provider: WebProvider) {
    try {
      await invoke("provider_child_view_hide", { provider });
    } catch (error) {
      const message = String(error);
      if (!message.includes("provider child view not found")) {
        setError(`${webProviderLabel(provider)} 세션 창 숨기기 실패: ${message}`);
        return;
      }
    }

    try {
      await invoke("provider_window_close", { provider });
    } catch {
      // noop: standalone window not opened
    }

    setProviderChildViewOpen((prev) => ({ ...prev, [provider]: false }));
    setStatus(`${webProviderLabel(provider)} 세션 창 숨김`);
    void refreshWebWorkerHealth(true);
  }

  useEffect(() => {
    if (workspaceTab === "workflow") {
      return;
    }
    const openProviders = WEB_PROVIDER_OPTIONS.filter((provider) => providerChildViewOpen[provider]);
    if (openProviders.length === 0) {
      return;
    }
    for (const provider of openProviders) {
      onCloseProviderChildView(provider);
    }
  }, [workspaceTab, providerChildViewOpen]);

  async function refreshWebWorkerHealth(silent = false) {
    try {
      const health = await invoke<WebWorkerHealth>("web_provider_health");
      setWebWorkerHealth(health);
      if (health.bridge) {
        setWebBridgeStatus(toWebBridgeStatus(health.bridge));
      }
      return health;
    } catch (error) {
      if (!silent) {
        setError(`웹 워커 상태 조회 실패: ${String(error)}`);
      }
      return null;
    }
  }

  function isBridgeMethodMissing(error: unknown): boolean {
    const message = String(error ?? "").toLowerCase();
    return message.includes("method not found") || message.includes("rpc error -32601");
  }

  async function invokeBridgeRpcWithRecovery(command: "web_bridge_status" | "web_bridge_rotate_token") {
    try {
      return await invoke<unknown>(command);
    } catch (error) {
      if (!isBridgeMethodMissing(error)) {
        throw error;
      }
      // Old worker may still be alive after hot-reload; restart and retry once.
      await invoke("web_worker_stop").catch(() => {
        // ignore
      });
      await invoke("web_worker_start");
      return await invoke<unknown>(command);
    }
  }

  async function refreshWebBridgeStatus(silent = false) {
    try {
      const raw = await invokeBridgeRpcWithRecovery("web_bridge_status");
      const next = toWebBridgeStatus(raw);
      setWebBridgeStatus(next);
      return next;
    } catch (error) {
      if (!silent) {
        setError(`브리지 상태 조회 실패: ${String(error)}`);
      }
      return null;
    }
  }

  async function onRotateWebBridgeToken() {
    setWebWorkerBusy(true);
    setError("");
    try {
      const raw = await invokeBridgeRpcWithRecovery("web_bridge_rotate_token");
      setWebBridgeStatus(toWebBridgeStatus(raw));
      setStatus("브리지 토큰을 재발급했습니다.");
    } catch (error) {
      setError(`브리지 토큰 재발급 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

  async function onCopyWebBridgeConnectCode() {
    try {
      const status = await refreshWebBridgeStatus(true);
      if (!status?.token) {
        throw new Error("연결 토큰을 읽을 수 없습니다.");
      }
      const code = JSON.stringify(
        {
          bridgeUrl: `http://127.0.0.1:${status.port}`,
          token: status.token,
        },
        null,
        2,
      );
      setWebBridgeConnectCode(code);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          copied = true;
        }
      } catch {
        // fallback below
      }

      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      if (copied) {
        setStatus("브리지 연결 코드 복사 완료");
        setError("");
      } else {
        setStatus("자동 복사 권한이 없어 코드 박스를 표시했습니다. 아래에서 수동 복사하세요.");
        setError("");
      }
    } catch (error) {
      setError(`브리지 연결 코드 준비 실패: ${String(error)}`);
    }
  }

  async function onOpenProviderSession(provider: WebProvider) {
    setWebWorkerBusy(true);
    setError("");
    try {
      const result = await invoke<{
        ok?: boolean;
        error?: string;
        errorCode?: string;
        sessionState?: string;
      }>(
        "web_provider_open_session",
        { provider },
      );
      if (result && result.ok === false) {
        throw new Error(result.error || result.errorCode || "세션 창을 열지 못했습니다.");
      }
      await refreshWebWorkerHealth(true);
      window.setTimeout(() => {
        void refreshWebWorkerHealth(true);
      }, 900);
      if (result?.sessionState === "active") {
        setStatus(`${webProviderLabel(provider)} 로그인 상태 확인됨`);
      } else if (result?.sessionState === "login_required") {
        setStatus(`${webProviderLabel(provider)} 로그인 필요`);
      } else {
        setStatus(`${webProviderLabel(provider)} 로그인 세션 창 열림`);
      }
    } catch (error) {
      setError(`${webProviderLabel(provider)} 로그인 세션 열기 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

  useEffect(() => {
    if (!pendingWebTurn) {
      pendingWebTurnAutoOpenKeyRef.current = "";
      return;
    }
    const key = `${pendingWebTurn.nodeId}:${pendingWebTurn.provider}:${pendingWebTurn.mode}:${pendingWebTurn.prompt.length}`;
    if (pendingWebTurnAutoOpenKeyRef.current === key) {
      return;
    }
    pendingWebTurnAutoOpenKeyRef.current = key;
    void openUrl(webProviderHomeUrl(pendingWebTurn.provider))
      .then(() => {
        setStatus(`${webProviderLabel(pendingWebTurn.provider)} 기본 브라우저 자동 열림`);
      })
      .catch((error) => {
        setError(`${webProviderLabel(pendingWebTurn.provider)} 브라우저 자동 열기 실패: ${String(error)}`);
      });
  }, [pendingWebTurn]);

  useEffect(() => {
    if (!pendingWebLogin) {
      pendingWebLoginAutoOpenKeyRef.current = "";
      return;
    }
    const key = `${pendingWebLogin.nodeId}:${pendingWebLogin.provider}:${pendingWebLogin.reason.length}`;
    if (pendingWebLoginAutoOpenKeyRef.current === key) {
      return;
    }
    pendingWebLoginAutoOpenKeyRef.current = key;
    void invoke<{ ok?: boolean; error?: string; errorCode?: string }>("web_provider_open_session", {
      provider: pendingWebLogin.provider,
    })
      .then(() => {
        setStatus(`${webProviderLabel(pendingWebLogin.provider)} 로그인 세션 자동 열림`);
        void refreshWebWorkerHealth(true);
      })
      .catch((error) => {
        setError(`${webProviderLabel(pendingWebLogin.provider)} 로그인 브라우저 열기 실패: ${String(error)}`);
      });
  }, [pendingWebLogin]);

  useEffect(() => {
    if (workspaceTab !== "settings") {
      return;
    }

    void refreshWebWorkerHealth(true);
    void refreshWebBridgeStatus(true);
    const intervalId = window.setInterval(() => {
      void refreshWebWorkerHealth(true);
      void refreshWebBridgeStatus(true);
    }, 1800);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [workspaceTab]);

  useEffect(() => {
    if (workspaceTab !== "bridge") {
      return;
    }
    void refreshWebBridgeStatus(true);
    const intervalId = window.setInterval(() => {
      void refreshWebBridgeStatus(true);
    }, 1400);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [workspaceTab]);

  useEffect(() => {
    if (workspaceTab !== "feed") {
      setFeedShareMenuPostId(null);
      return;
    }
    void refreshFeedTimeline();
  }, [workspaceTab]);

  const hasActiveNodeRuntime = useMemo(
    () =>
      Object.values(nodeStates).some(
        (row) =>
          Boolean(row.startedAt) &&
          !row.finishedAt &&
          (row.status === "queued" || row.status === "running" || row.status === "waiting_user"),
      ),
    [nodeStates],
  );

  useEffect(() => {
    if (!hasActiveNodeRuntime) {
      return;
    }
    setRuntimeNowMs(Date.now());
    const timer = window.setInterval(() => {
      setRuntimeNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveNodeRuntime]);

  async function ensureWebWorkerReady() {
    try {
      await invoke("web_worker_start");
      const health = await refreshWebWorkerHealth(true);
      if (!health?.running) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function resolvePendingWebLogin(retry: boolean) {
    const resolver = webLoginResolverRef.current;
    webLoginResolverRef.current = null;
    setPendingWebLogin(null);
    if (resolver) {
      resolver(retry);
    }
  }

  async function onCopyPendingWebPrompt() {
    if (!pendingWebTurn) {
      return;
    }
    try {
      await navigator.clipboard.writeText(pendingWebTurn.prompt);
      setStatus("웹 프롬프트 복사 완료");
    } catch (error) {
      setError(`clipboard copy failed: ${String(error)}`);
    }
  }

  function onSubmitPendingWebTurn() {
    if (!pendingWebTurn) {
      return;
    }
    const normalized = normalizeWebTurnOutput(
      pendingWebTurn.provider,
      pendingWebTurn.mode,
      webResponseDraft,
    );
    if (!normalized.ok) {
      setError(normalized.error ?? "웹 응답 처리 실패");
      return;
    }
    resolvePendingWebTurn({ ok: true, output: normalized.output });
  }

  function onCancelPendingWebTurn() {
    resolvePendingWebTurn({ ok: false, error: "사용자 취소" });
  }

  async function onRespondApproval(decision: ApprovalDecision) {
    if (!activeApproval) {
      return;
    }

    setError("");
    setApprovalSubmitting(true);
    try {
      await invoke("approval_respond", {
        requestId: activeApproval.requestId,
        result: {
          decision,
        },
      });
      setPendingApprovals((prev) => prev.slice(1));
      setStatus(`승인 응답 전송 (${approvalDecisionLabel(decision)})`);
    } catch (e) {
      setError(String(e));
    } finally {
      setApprovalSubmitting(false);
    }
  }

  function getCanvasViewportCenterLogical(): { x: number; y: number } | null {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return null;
    }
    return {
      x: (canvas.scrollLeft + canvas.clientWidth / 2 - GRAPH_STAGE_INSET_X) / canvasZoom,
      y: (canvas.scrollTop + canvas.clientHeight / 2 - GRAPH_STAGE_INSET_Y) / canvasZoom,
    };
  }

  function pickDefaultCanvasNodeId(nodes: GraphNode[]): string {
    if (!SIMPLE_WORKFLOW_UI) {
      return nodes[0]?.id ?? "";
    }
    return nodes.find((node) => node.type === "turn")?.id ?? "";
  }

  function addNode(type: NodeType) {
    const center = getCanvasViewportCenterLogical();
    const fallbackIndex = graph.nodes.length;
    const minPos = -NODE_DRAG_MARGIN;
    const maxX = Math.max(minPos, boundedStageWidth - NODE_WIDTH + NODE_DRAG_MARGIN);
    const maxY = Math.max(minPos, boundedStageHeight - NODE_HEIGHT + NODE_DRAG_MARGIN);
    const baseX = center
      ? Math.round(center.x - NODE_WIDTH / 2)
      : 40 + (fallbackIndex % 4) * 280;
    const baseY = center
      ? Math.round(center.y - NODE_HEIGHT / 2)
      : 40 + Math.floor(fallbackIndex / 4) * 180;
    const node: GraphNode = {
      id: makeNodeId(type),
      type,
      position: {
        x: Math.min(maxX, Math.max(minPos, baseX)),
        y: Math.min(maxY, Math.max(minPos, baseY)),
      },
      config: defaultNodeConfig(type),
    };

    applyGraphChange((prev) => {
      return {
        ...prev,
        nodes: [...prev.nodes, node],
      };
    }, { autoLayout: true });

    setNodeSelection([node.id], node.id);
    setSelectedEdgeKey("");
  }

  function applyPreset(kind: PresetKind) {
    const builtPreset = buildPresetGraphByKind(kind);
    const preset: GraphData = {
      ...builtPreset,
      nodes: applyPresetTurnPolicies(kind, builtPreset.nodes),
    };
    const nextPreset = autoArrangeGraphLayout({
      ...preset,
      knowledge: normalizeKnowledgeConfig(graph.knowledge),
    });
    setGraph(cloneGraph(nextPreset));
    setUndoStack([]);
    setRedoStack([]);
    const initialNodeId = pickDefaultCanvasNodeId(nextPreset.nodes);
    setNodeSelection(initialNodeId ? [initialNodeId] : [], initialNodeId || undefined);
    setSelectedEdgeKey("");
    setNodeStates({});
    setConnectFromNodeId("");
    setConnectFromSide(null);
    setConnectPreviewStartPoint(null);
    setConnectPreviewPoint(null);
    setIsConnectingDrag(false);
    setMarqueeSelection(null);
    const templateMeta = PRESET_TEMPLATE_META.find((row) => row.key === kind);
    setStatus(`${templateMeta?.statusLabel ?? "템플릿"} 로드됨`);
  }

  function applyCostPreset(preset: CostPreset) {
    const codexTurnNodes = graph.nodes.filter((node) => {
      if (node.type !== "turn") {
        return false;
      }
      const config = node.config as TurnConfig;
      return getTurnExecutor(config) === "codex";
    });

    setCostPreset(preset);
    setModel(COST_PRESET_DEFAULT_MODEL[preset]);

    if (codexTurnNodes.length === 0) {
      setStatus(`비용 프리셋(${costPresetLabel(preset)}) 적용 대상이 없습니다.`);
      return;
    }

    let changed = 0;
    const nextNodes = graph.nodes.map((node) => {
      if (node.type !== "turn") {
        return node;
      }
      const config = node.config as TurnConfig;
      if (getTurnExecutor(config) !== "codex") {
        return node;
      }
      const targetModel = getCostPresetTargetModel(preset, isCriticalTurnNode(node));
      const currentModel = toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL));
      if (currentModel === targetModel) {
        return node;
      }
      changed += 1;
      return {
        ...node,
        config: {
          ...config,
          model: targetModel,
        },
      };
    });

    if (changed === 0) {
      setStatus(`비용 프리셋(${costPresetLabel(preset)}) 이미 적용됨`);
      return;
    }

    applyGraphChange((prev) => ({ ...prev, nodes: nextNodes }));
    setStatus(`비용 프리셋(${costPresetLabel(preset)}) 적용: ${changed}/${codexTurnNodes.length}개 노드`);
  }

  function deleteNodes(nodeIds: string[]) {
    const targets = nodeIds.filter((id, index, arr) => arr.indexOf(id) === index);
    if (targets.length === 0) {
      return;
    }
    const targetSet = new Set(targets);
    applyGraphChange((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => !targetSet.has(n.id)),
      edges: prev.edges.filter((e) => !targetSet.has(e.from.nodeId) && !targetSet.has(e.to.nodeId)),
    }), { autoLayout: true });
    setNodeSelection(selectedNodeIds.filter((id) => !targetSet.has(id)));
    setSelectedEdgeKey("");
    setNodeStates((prev) => {
      const next = { ...prev };
      for (const nodeId of targetSet) {
        delete next[nodeId];
      }
      return next;
    });
    if (connectFromNodeId && targetSet.has(connectFromNodeId)) {
      setConnectFromNodeId("");
      setConnectFromSide(null);
      setConnectPreviewStartPoint(null);
      setConnectPreviewPoint(null);
      setIsConnectingDrag(false);
      setMarqueeSelection(null);
    }
  }

  function deleteNode(nodeId: string) {
    deleteNodes([nodeId]);
  }

  function createEdgeConnection(
    fromNodeId: string,
    toNodeId: string,
    fromSide?: NodeAnchorSide,
    toSide?: NodeAnchorSide,
  ) {
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      return;
    }

    const reverseExistsNow = graph.edges.some(
      (edge) => edge.from.nodeId === toNodeId && edge.to.nodeId === fromNodeId,
    );
    if (reverseExistsNow) {
      setStatus("양방향 연결은 허용되지 않습니다.");
      return;
    }

    const fromNode = graph.nodes.find((node) => node.id === fromNodeId);
    const toNode = graph.nodes.find((node) => node.id === toNodeId);
    if (!fromNode || !toNode) {
      return;
    }

    const auto = getAutoConnectionSides(fromNode, toNode);
    const resolvedFromSide = fromSide ?? auto.fromSide;
    const resolvedToSide = toSide ?? auto.toSide;

    applyGraphChange((prev) => {
      const exists = prev.edges.some(
        (edge) => edge.from.nodeId === fromNodeId && edge.to.nodeId === toNodeId,
      );
      if (exists) {
        return prev;
      }
      const reverseExists = prev.edges.some(
        (edge) => edge.from.nodeId === toNodeId && edge.to.nodeId === fromNodeId,
      );
      if (reverseExists) {
        return prev;
      }
      const edge: GraphEdge = {
        from: { nodeId: fromNodeId, port: "out", side: resolvedFromSide },
        to: { nodeId: toNodeId, port: "in", side: resolvedToSide },
      };
      return { ...prev, edges: [...prev.edges, edge] };
    }, { autoLayout: true });
  }

  function onNodeAnchorDragStart(
    e: ReactMouseEvent<HTMLButtonElement>,
    nodeId: string,
    side: NodeAnchorSide,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const sourceNode = graph.nodes.find((node) => node.id === nodeId);
    if (!sourceNode) {
      return;
    }
    const point = getNodeAnchorPoint(sourceNode, side, getNodeVisualSize(sourceNode.id));
    setConnectFromNodeId(nodeId);
    setConnectFromSide(side);
    setConnectPreviewStartPoint(point);
    setConnectPreviewPoint(point);
    setIsConnectingDrag(true);
  }

  function onNodeAnchorDrop(
    e: ReactMouseEvent<HTMLButtonElement>,
    targetNodeId: string,
    targetSide: NodeAnchorSide,
  ) {
    if (!connectFromNodeId) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    createEdgeConnection(connectFromNodeId, targetNodeId, connectFromSide ?? undefined, targetSide);
    setConnectFromNodeId("");
    setConnectFromSide(null);
    setConnectPreviewStartPoint(null);
    setConnectPreviewPoint(null);
    setIsConnectingDrag(false);
  }

  function onNodeConnectDrop(targetNodeId: string) {
    if (!connectFromNodeId || connectFromNodeId === targetNodeId) {
      return;
    }
    createEdgeConnection(connectFromNodeId, targetNodeId, connectFromSide ?? undefined);
    setConnectFromNodeId("");
    setConnectFromSide(null);
    setConnectPreviewStartPoint(null);
    setConnectPreviewPoint(null);
    setIsConnectingDrag(false);
  }

  function clampCanvasZoom(nextZoom: number): number {
    return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, nextZoom));
  }

  function scheduleZoomStatus(nextZoom: number) {
    if (zoomStatusTimerRef.current != null) {
      window.clearTimeout(zoomStatusTimerRef.current);
    }
    zoomStatusTimerRef.current = window.setTimeout(() => {
      setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
      zoomStatusTimerRef.current = null;
    }, 120);
  }

  function syncQuestionInputHeight() {
    const input = questionInputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "auto";
    const nextHeight = Math.min(QUESTION_INPUT_MAX_HEIGHT, input.scrollHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > QUESTION_INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }

  function syncCanvasLogicalViewport() {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    const visibleWidth = canvas.clientWidth / canvasZoom;
    const visibleHeight = canvas.clientHeight / canvasZoom;
    setCanvasLogicalViewport((prev) => {
      if (Math.abs(prev.width - visibleWidth) < 0.5 && Math.abs(prev.height - visibleHeight) < 0.5) {
        return prev;
      }
      return { width: visibleWidth, height: visibleHeight };
    });
  }

  function clientToLogicalPoint(clientX: number, clientY: number, zoomValue = canvasZoom): { x: number; y: number } | null {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const stageOffsetX = GRAPH_STAGE_INSET_X;
    const stageOffsetY = GRAPH_STAGE_INSET_Y;
    return {
      x: (clientX - rect.left + canvas.scrollLeft - stageOffsetX) / zoomValue,
      y: (clientY - rect.top + canvas.scrollTop - stageOffsetY) / zoomValue,
    };
  }

  function applyEdgeControlPosition(clientX: number, clientY: number) {
    if (!edgeDragRef.current) {
      return;
    }
    const logicalPoint = clientToLogicalPoint(clientX, clientY);
    if (!logicalPoint) {
      return;
    }

    const minPos = -NODE_DRAG_MARGIN;
    const maxX = Math.max(minPos, boundedStageWidth + NODE_DRAG_MARGIN);
    const maxY = Math.max(minPos, boundedStageHeight + NODE_DRAG_MARGIN);
    const { edgeKey, pointerStart, startControl } = edgeDragRef.current;
    const dx = logicalPoint.x - pointerStart.x;
    const dy = logicalPoint.y - pointerStart.y;
    const nextControl = {
      x: Math.min(maxX, Math.max(minPos, startControl.x + dx)),
      y: Math.min(maxY, Math.max(minPos, startControl.y + dy)),
    };

    setGraph((prev) => ({
      ...prev,
      edges: prev.edges.map((edge) =>
        getGraphEdgeKey(edge) === edgeKey
          ? {
              ...edge,
              control: nextControl,
            }
          : edge,
      ),
    }));
  }

  function onEdgeDragStart(
    event: ReactMouseEvent<SVGPathElement>,
    edgeKey: string,
    defaultControl: LogicalPoint,
  ) {
    if (panMode || isConnectingDrag) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const pointer = clientToLogicalPoint(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setNodeSelection([]);
    setSelectedEdgeKey(edgeKey);
    edgeDragStartSnapshotRef.current = cloneGraph(graph);
    edgeDragRef.current = {
      edgeKey,
      pointerStart: pointer,
      startControl: defaultControl,
    };

    if (!edgeDragWindowMoveHandlerRef.current) {
      edgeDragWindowMoveHandlerRef.current = (nextEvent: MouseEvent) => {
        if (!edgeDragRef.current) {
          return;
        }
        applyEdgeControlPosition(nextEvent.clientX, nextEvent.clientY);
      };
      window.addEventListener("mousemove", edgeDragWindowMoveHandlerRef.current);
    }
    if (!edgeDragWindowUpHandlerRef.current) {
      edgeDragWindowUpHandlerRef.current = () => {
        onCanvasMouseUp();
      };
      window.addEventListener("mouseup", edgeDragWindowUpHandlerRef.current);
    }
  }

  function zoomAtClientPoint(nextZoom: number, clientX: number, clientY: number) {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      setCanvasZoom(nextZoom);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const stageOffsetX = GRAPH_STAGE_INSET_X;
    const stageOffsetY = GRAPH_STAGE_INSET_Y;
    const pointerX = clientX - rect.left + canvas.scrollLeft;
    const pointerY = clientY - rect.top + canvas.scrollTop;
    const logicalX = (pointerX - stageOffsetX) / canvasZoom;
    const logicalY = (pointerY - stageOffsetY) / canvasZoom;

    setCanvasZoom(nextZoom);
    requestAnimationFrame(() => {
      const currentCanvas = graphCanvasRef.current;
      if (!currentCanvas) {
        return;
      }
      currentCanvas.scrollLeft = logicalX * nextZoom + stageOffsetX - (clientX - rect.left);
      currentCanvas.scrollTop = logicalY * nextZoom + stageOffsetY - (clientY - rect.top);
    });
  }

  function applyDragPosition(clientX: number, clientY: number) {
    if (!dragRef.current) {
      return;
    }
    const logicalPoint = clientToLogicalPoint(clientX, clientY);
    if (!logicalPoint) {
      return;
    }

    const { nodeIds, pointerStart, startPositions } = dragRef.current;
    if (nodeIds.length === 0) {
      return;
    }
    const dx = logicalPoint.x - pointerStart.x;
    const dy = logicalPoint.y - pointerStart.y;
    const minPos = -NODE_DRAG_MARGIN;
    const nodeIdSet = new Set(nodeIds);
    const dragSingleNode = nodeIds.length === 1;

    setGraph((prev) => ({
      ...prev,
      nodes: (() => {
        const stationaryNodes = prev.nodes.filter((node) => !nodeIdSet.has(node.id));
        return prev.nodes.map((node) => {
        if (!nodeIdSet.has(node.id)) {
          return node;
        }
        const start = startPositions[node.id];
        if (!start) {
          return node;
        }
        const size = getNodeVisualSize(node.id);
        const maxX = Math.max(minPos, boundedStageWidth - size.width + NODE_DRAG_MARGIN);
        const maxY = Math.max(minPos, boundedStageHeight - size.height + NODE_DRAG_MARGIN);
        const nextX = start.x + dx;
        const nextY = start.y + dy;
        let snappedX = snapToLayoutGrid(nextX, "x", AUTO_LAYOUT_DRAG_SNAP_THRESHOLD);
        let snappedY = snapToLayoutGrid(nextY, "y", AUTO_LAYOUT_DRAG_SNAP_THRESHOLD);
        if (dragSingleNode) {
          snappedX = snapToNearbyNodeAxis(snappedX, "x", stationaryNodes, AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD);
          snappedY = snapToNearbyNodeAxis(snappedY, "y", stationaryNodes, AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD);
        }
        return {
          ...node,
          position: {
            x: Math.min(maxX, Math.max(minPos, snappedX)),
            y: Math.min(maxY, Math.max(minPos, snappedY)),
          },
        };
      });
      })(),
    }));
  }

  function ensureDragAutoPanLoop() {
    if (dragAutoPanFrameRef.current != null) {
      return;
    }

    const tick = () => {
      if (!dragRef.current) {
        dragAutoPanFrameRef.current = null;
        return;
      }

      const pointer = dragPointerRef.current;
      const canvas = graphCanvasRef.current;
      if (pointer && canvas) {
        const rect = canvas.getBoundingClientRect();
        const edge = 30;
        const maxSpeed = 14;
        let dx = 0;
        let dy = 0;

        if (pointer.clientX < rect.left + edge) {
          dx = -Math.ceil(((rect.left + edge - pointer.clientX) / edge) * maxSpeed);
        } else if (pointer.clientX > rect.right - edge) {
          dx = Math.ceil(((pointer.clientX - (rect.right - edge)) / edge) * maxSpeed);
        }
        if (pointer.clientY < rect.top + edge) {
          dy = -Math.ceil(((rect.top + edge - pointer.clientY) / edge) * maxSpeed);
        } else if (pointer.clientY > rect.bottom - edge) {
          dy = Math.ceil(((pointer.clientY - (rect.bottom - edge)) / edge) * maxSpeed);
        }

        if (dx !== 0 || dy !== 0) {
          const maxLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
          const maxTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
          canvas.scrollLeft = Math.max(0, Math.min(maxLeft, canvas.scrollLeft + dx));
          canvas.scrollTop = Math.max(0, Math.min(maxTop, canvas.scrollTop + dy));
          applyDragPosition(pointer.clientX, pointer.clientY);
        }
      }

      dragAutoPanFrameRef.current = requestAnimationFrame(tick);
    };

    dragAutoPanFrameRef.current = requestAnimationFrame(tick);
  }

  function onNodeDragStart(e: ReactMouseEvent<HTMLDivElement>, nodeId: string) {
    if (panMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const node = canvasNodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    const canvasPoint = clientToLogicalPoint(e.clientX, e.clientY);
    if (!canvasPoint) {
      return;
    }

    const activeNodeIds = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
    if (!selectedNodeIds.includes(nodeId)) {
      setNodeSelection([nodeId], nodeId);
    }
    const startPositions = Object.fromEntries(
      canvasNodes
        .filter((item) => activeNodeIds.includes(item.id))
        .map((item) => [item.id, { x: item.position.x, y: item.position.y }]),
    );
    if (Object.keys(startPositions).length === 0) {
      return;
    }

    dragStartSnapshotRef.current = cloneGraph(graph);
    setDraggingNodeIds(activeNodeIds);
    setMarqueeSelection(null);
    dragPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    ensureDragAutoPanLoop();
    if (!dragWindowMoveHandlerRef.current) {
      dragWindowMoveHandlerRef.current = (event: MouseEvent) => {
        if (!dragRef.current) {
          return;
        }
        dragPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        applyDragPosition(event.clientX, event.clientY);
      };
      window.addEventListener("mousemove", dragWindowMoveHandlerRef.current);
    }
    if (!dragWindowUpHandlerRef.current) {
      dragWindowUpHandlerRef.current = () => {
        onCanvasMouseUp();
      };
      window.addEventListener("mouseup", dragWindowUpHandlerRef.current);
    }

    dragRef.current = {
      nodeIds: activeNodeIds,
      pointerStart: canvasPoint,
      startPositions,
    };
  }

  function onCanvasMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (panRef.current) {
      const canvas = graphCanvasRef.current;
      if (canvas) {
        canvas.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.startX);
        canvas.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.startY);
      }
      return;
    }

    if (edgeDragRef.current) {
      applyEdgeControlPosition(e.clientX, e.clientY);
      return;
    }

    if (isConnectingDrag && connectFromNodeId) {
      const point = clientToLogicalPoint(e.clientX, e.clientY);
      if (point) {
        setConnectPreviewPoint(point);
      }
      return;
    }

    if (marqueeSelection) {
      const point = clientToLogicalPoint(e.clientX, e.clientY);
      if (point) {
        setMarqueeSelection((prev) => (prev ? { ...prev, current: point } : prev));
      }
      return;
    }

    if (!dragRef.current) {
      return;
    }

    dragPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    applyDragPosition(e.clientX, e.clientY);
  }

  function onCanvasMouseUp() {
    panRef.current = null;

    if (edgeDragRef.current) {
      if (edgeDragWindowMoveHandlerRef.current) {
        window.removeEventListener("mousemove", edgeDragWindowMoveHandlerRef.current);
        edgeDragWindowMoveHandlerRef.current = null;
      }
      if (edgeDragWindowUpHandlerRef.current) {
        window.removeEventListener("mouseup", edgeDragWindowUpHandlerRef.current);
        edgeDragWindowUpHandlerRef.current = null;
      }

      const edgeSnapshot = edgeDragStartSnapshotRef.current;
      if (edgeSnapshot && !graphEquals(edgeSnapshot, graph)) {
        setUndoStack((stack) => [...stack.slice(-79), cloneGraph(edgeSnapshot)]);
        setRedoStack([]);
      }
      edgeDragRef.current = null;
      edgeDragStartSnapshotRef.current = null;
    }

    if (isConnectingDrag) {
      setIsConnectingDrag(false);
      setConnectPreviewStartPoint(null);
      setConnectPreviewPoint(null);
      setConnectFromNodeId("");
      setConnectFromSide(null);
    }

    if (marqueeSelection) {
      const minX = Math.min(marqueeSelection.start.x, marqueeSelection.current.x);
      const maxX = Math.max(marqueeSelection.start.x, marqueeSelection.current.x);
      const minY = Math.min(marqueeSelection.start.y, marqueeSelection.current.y);
      const maxY = Math.max(marqueeSelection.start.y, marqueeSelection.current.y);
      const selectedByBox = canvasNodes
        .filter((node) => {
          const size = getNodeVisualSize(node.id);
          const nodeLeft = node.position.x;
          const nodeTop = node.position.y;
          const nodeRight = node.position.x + size.width;
          const nodeBottom = node.position.y + size.height;
          return !(nodeRight < minX || nodeLeft > maxX || nodeBottom < minY || nodeTop > maxY);
        })
        .map((node) => node.id);
      const nextSelected = marqueeSelection.append
        ? Array.from(new Set([...selectedNodeIds, ...selectedByBox]))
        : selectedByBox;
      setNodeSelection(nextSelected, nextSelected[nextSelected.length - 1]);
      setMarqueeSelection(null);
      setSelectedEdgeKey("");
    }

    dragPointerRef.current = null;
    if (dragAutoPanFrameRef.current != null) {
      cancelAnimationFrame(dragAutoPanFrameRef.current);
      dragAutoPanFrameRef.current = null;
    }
    if (dragWindowMoveHandlerRef.current) {
      window.removeEventListener("mousemove", dragWindowMoveHandlerRef.current);
      dragWindowMoveHandlerRef.current = null;
    }
    if (dragWindowUpHandlerRef.current) {
      window.removeEventListener("mouseup", dragWindowUpHandlerRef.current);
      dragWindowUpHandlerRef.current = null;
    }
    const dragSnapshot = dragStartSnapshotRef.current;
    if (dragSnapshot && !graphEquals(dragSnapshot, graph)) {
      setUndoStack((stack) => [...stack.slice(-79), cloneGraph(dragSnapshot)]);
      setRedoStack([]);
    }
    const dragNodeIds = dragRef.current?.nodeIds ?? [];
    dragStartSnapshotRef.current = null;
    dragRef.current = null;
    setDraggingNodeIds([]);
    if (dragNodeIds.length > 0) {
      const draggedNodeIdSet = new Set(dragNodeIds);
      const dragSingleNode = dragNodeIds.length === 1;
      setGraph((prev) => ({
        ...prev,
        nodes: (() => {
          const stationaryNodes = prev.nodes.filter((node) => !draggedNodeIdSet.has(node.id));
          return prev.nodes.map((node) => {
          if (!draggedNodeIdSet.has(node.id)) {
            return node;
          }
          const size = getNodeVisualSize(node.id);
          const minPos = -NODE_DRAG_MARGIN;
          const maxX = Math.max(minPos, boundedStageWidth - size.width + NODE_DRAG_MARGIN);
          const maxY = Math.max(minPos, boundedStageHeight - size.height + NODE_DRAG_MARGIN);
          let snappedX = snapToLayoutGrid(node.position.x, "x", AUTO_LAYOUT_SNAP_THRESHOLD);
          let snappedY = snapToLayoutGrid(node.position.y, "y", AUTO_LAYOUT_SNAP_THRESHOLD);
          if (dragSingleNode) {
            snappedX = snapToNearbyNodeAxis(snappedX, "x", stationaryNodes, AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD);
            snappedY = snapToNearbyNodeAxis(snappedY, "y", stationaryNodes, AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD);
          }
          return {
            ...node,
            position: {
              x: Math.min(maxX, Math.max(minPos, snappedX)),
              y: Math.min(maxY, Math.max(minPos, snappedY)),
            },
          };
        });
        })(),
      }));
    }
  }

  function onCanvasMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const clickedNodeOrPorts = target.closest(".graph-node, .node-anchors");
    const clickedEdge = target.closest(".edge-path, .edge-path-hit");
    const clickedOverlay = target.closest(".canvas-overlay");
    const clickedControl = target.closest(".canvas-zoom-controls, .canvas-runbar");

    if (!clickedNodeOrPorts && !clickedEdge && !clickedOverlay) {
      if (!e.shiftKey) {
        setNodeSelection([]);
      }
      setSelectedEdgeKey("");
    }

    if (!panMode) {
      if (e.button !== 0 || clickedControl || clickedOverlay || clickedNodeOrPorts || clickedEdge) {
        return;
      }
      const point = clientToLogicalPoint(e.clientX, e.clientY);
      if (!point) {
        return;
      }
      e.preventDefault();
      setMarqueeSelection({
        start: point,
        current: point,
        append: e.shiftKey,
      });
      return;
    }
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    if (clickedControl) {
      return;
    }
    if (clickedEdge) {
      return;
    }
    e.preventDefault();
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
  }

  function onCanvasWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }
    e.preventDefault();
    const ratio = e.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = clampCanvasZoom(canvasZoom * ratio);
    if (nextZoom === canvasZoom) {
      return;
    }
    zoomAtClientPoint(nextZoom, e.clientX, e.clientY);
    scheduleZoomStatus(nextZoom);
  }

  function zoomAtCanvasCenter(nextZoom: number) {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      setCanvasZoom(nextZoom);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    zoomAtClientPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function onCanvasZoomIn() {
    const nextZoom = clampCanvasZoom(canvasZoom * 1.08);
    if (nextZoom === canvasZoom) {
      return;
    }
    zoomAtCanvasCenter(nextZoom);
    scheduleZoomStatus(nextZoom);
  }

  function onCanvasZoomOut() {
    const nextZoom = clampCanvasZoom(canvasZoom * 0.92);
    if (nextZoom === canvasZoom) {
      return;
    }
    zoomAtCanvasCenter(nextZoom);
    scheduleZoomStatus(nextZoom);
  }

  function onCanvasKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey)) {
      return;
    }

    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      const nextZoom = clampCanvasZoom(canvasZoom * 1.08);
      zoomAtClientPoint(nextZoom, centerX, centerY);
      scheduleZoomStatus(nextZoom);
      return;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      const nextZoom = clampCanvasZoom(canvasZoom * 0.92);
      zoomAtClientPoint(nextZoom, centerX, centerY);
      scheduleZoomStatus(nextZoom);
      return;
    }

    if (e.key === "0") {
      e.preventDefault();
      zoomAtClientPoint(1, centerX, centerY);
      scheduleZoomStatus(1);
    }
  }

  function updateNodeConfigById(nodeId: string, key: string, value: unknown) {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              config: {
                ...node.config,
                [key]: value,
              },
            }
          : node,
      ),
    }));
  }

  function updateSelectedNodeConfig(key: string, value: unknown) {
    if (!selectedNode) {
      return;
    }
    updateNodeConfigById(selectedNode.id, key, value);
  }

  async function saveGraph() {
    setError("");
    try {
      const saveTarget = graphFileName.trim() || "sample.json";
      await invoke("graph_save", {
        name: saveTarget,
        graph,
      });
      await refreshGraphFiles();
      setGraphFileName(saveTarget);
      setSelectedGraphFileName(saveTarget);
      setStatus(`그래프 저장 완료 (${saveTarget})`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function renameGraph() {
    const current = selectedGraphFileName.trim();
    if (!current) {
      setError("이름을 변경할 그래프 파일을 먼저 선택하세요.");
      return;
    }
    const nextName = graphRenameDraft.trim();
    if (!nextName) {
      setError("새 그래프 파일 이름을 입력하세요.");
      return;
    }

    setError("");
    try {
      const renamed = await invoke<string>("graph_rename", {
        fromName: current,
        toName: nextName,
      });
      await refreshGraphFiles();
      setGraphFileName(renamed);
      setSelectedGraphFileName(renamed);
      setGraphRenameDraft("");
      setGraphRenameOpen(false);
      setStatus(`그래프 이름 변경 완료 (${current} → ${renamed})`);
    } catch (e) {
      setError(`그래프 이름 변경 실패: ${String(e)}`);
    }
  }

  function onOpenRenameGraph() {
    const current = selectedGraphFileName.trim();
    if (!current) {
      setError("이름을 변경할 그래프 파일을 먼저 선택하세요.");
      return;
    }
    setError("");
    setGraphRenameDraft(current);
    setGraphRenameOpen(true);
  }

  function onCloseRenameGraph() {
    setGraphRenameOpen(false);
    setGraphRenameDraft("");
  }

  async function deleteGraph() {
    const target = selectedGraphFileName.trim();
    if (!target) {
      setError("삭제할 그래프 파일을 먼저 선택하세요.");
      return;
    }

    setError("");
    try {
      await invoke("graph_delete", { name: target });
      await refreshGraphFiles();
      setGraphFileName("");
      setSelectedGraphFileName("");
      onCloseRenameGraph();
      setStatus(`그래프 삭제 완료 (${target})`);
    } catch (e) {
      setError(`그래프 삭제 실패: ${String(e)}`);
    }
  }

  async function loadGraph(name?: string) {
    const target = (name ?? graphFileName).trim();
    if (!target) {
      return;
    }

    setError("");
    try {
      const loaded = await invoke<unknown>("graph_load", { name: target });
      const normalized = autoArrangeGraphLayout(normalizeGraph(loaded));
      setGraph(cloneGraph(normalized));
      setUndoStack([]);
      setRedoStack([]);
      const initialNodeId = pickDefaultCanvasNodeId(normalized.nodes);
      setNodeSelection(initialNodeId ? [initialNodeId] : [], initialNodeId || undefined);
      setSelectedEdgeKey("");
      setNodeStates({});
      setConnectFromNodeId("");
      setConnectFromSide(null);
      setConnectPreviewStartPoint(null);
      setConnectPreviewPoint(null);
      setIsConnectingDrag(false);
      setStatus(`그래프 불러오기 완료 (${target})`);
      setGraphFileName(target);
      setSelectedGraphFileName(target);
      onCloseRenameGraph();
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    const nodeIdSet = new Set(canvasNodes.map((node) => node.id));
    const filteredSelected = selectedNodeIds.filter((id) => nodeIdSet.has(id));
    if (filteredSelected.length !== selectedNodeIds.length) {
      setSelectedNodeIds(filteredSelected);
    }

    if (selectedNodeId && !nodeIdSet.has(selectedNodeId)) {
      setSelectedNodeId(filteredSelected[0] ?? "");
      return;
    }

    if (!selectedNodeId && filteredSelected.length > 0) {
      setSelectedNodeId(filteredSelected[0]);
      return;
    }

    if (selectedNodeId && !filteredSelected.includes(selectedNodeId)) {
      setSelectedNodeIds((prev) => [...prev, selectedNodeId]);
    }
  }, [canvasNodes, selectedNodeIds, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeKey) {
      return;
    }
    const exists = canvasDisplayEdges.some((row) => !row.readOnly && row.edgeKey === selectedEdgeKey);
    if (!exists) {
      setSelectedEdgeKey("");
    }
  }, [canvasDisplayEdges, selectedEdgeKey]);

  useEffect(() => {
    if (workspaceTab !== "workflow" && canvasFullscreen) {
      setCanvasFullscreen(false);
    }
  }, [workspaceTab, canvasFullscreen]);

  useEffect(() => {
    const onTabHotkey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key;
      let nextTab: WorkspaceTab | null = null;
      if (key === "1") {
        nextTab = "workflow";
      } else if (key === "2") {
        nextTab = "feed";
      } else if (key === "3") {
        nextTab = "history";
      } else if (key === "4") {
        nextTab = "settings";
      } else if (key === "5") {
        nextTab = "bridge";
      }

      if (!nextTab) {
        return;
      }

      event.preventDefault();
      setWorkspaceTab(nextTab);
      setStatus(
        nextTab === "workflow"
          ? "워크플로우 탭으로 이동"
          : nextTab === "feed"
            ? "피드 탭으로 이동"
            : nextTab === "history"
              ? "기록 탭으로 이동"
              : nextTab === "settings"
                ? "설정 탭으로 이동"
                : "브리지 탭으로 이동",
      );
    };

    window.addEventListener("keydown", onTabHotkey);
    return () => window.removeEventListener("keydown", onTabHotkey);
  }, []);

  useEffect(() => {
    if (!canvasFullscreen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCanvasFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasFullscreen]);

  useEffect(() => {
    if (workspaceTab !== "workflow") {
      return;
    }
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const keyLower = event.key.toLowerCase();
      const isPanToggleKey = keyLower === "h" || event.key === "ㅗ" || event.code === "KeyH";
      if (!isPanToggleKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setPanMode((prev) => {
        const next = !prev;
        setStatus(next ? "캔버스 이동 모드 켜짐 (H/ㅗ)" : "캔버스 이동 모드 꺼짐 (H/ㅗ)");
        return next;
      });
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [workspaceTab]);

  useEffect(() => {
    if (workspaceTab !== "workflow") {
      return;
    }

    const onShiftAlign = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "Shift") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!selectedNodeId) {
        return;
      }
      const current = canvasNodes.find((node) => node.id === selectedNodeId);
      if (!current) {
        return;
      }
      const others = canvasNodes.filter((node) => node.id !== selectedNodeId);
      if (others.length === 0) {
        return;
      }

      let nearest: GraphNode | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of others) {
        const dx = candidate.position.x - current.position.x;
        const dy = candidate.position.y - current.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = candidate;
        }
      }

      if (!nearest) {
        return;
      }

      event.preventDefault();
      const alignByX =
        Math.abs(nearest.position.x - current.position.x) <= Math.abs(nearest.position.y - current.position.y);
      applyGraphChange((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => {
          if (node.id !== selectedNodeId) {
            return node;
          }
          return {
            ...node,
            position: {
              x: alignByX ? nearest.position.x : node.position.x,
              y: alignByX ? node.position.y : nearest.position.y,
            },
          };
        }),
      }));
      setStatus(alignByX ? "노드 X축 자동 정렬됨 (Shift)" : "노드 Y축 자동 정렬됨 (Shift)");
    };

    window.addEventListener("keydown", onShiftAlign);
    return () => window.removeEventListener("keydown", onShiftAlign);
  }, [workspaceTab, selectedNodeId, canvasNodes]);

  useEffect(() => {
    if (workspaceTab !== "workflow") {
      return;
    }
    const onSelectAll = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== "a") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      const allNodeIds = canvasNodes.map((node) => node.id);
      setNodeSelection(allNodeIds, allNodeIds[0]);
      setSelectedEdgeKey("");
      setStatus(allNodeIds.length > 0 ? `노드 ${allNodeIds.length}개 선택됨` : "선택할 노드가 없습니다");
    };
    window.addEventListener("keydown", onSelectAll);
    return () => window.removeEventListener("keydown", onSelectAll);
  }, [workspaceTab, canvasNodes]);

  useEffect(() => {
    if (workspaceTab !== "workflow") {
      return;
    }

    const onDeleteSelection = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }

      if (selectedEdgeKey) {
        const hasEdge = canvasDisplayEdges.some(
          (row) => !row.readOnly && row.edgeKey === selectedEdgeKey,
        );
        if (!hasEdge) {
          setSelectedEdgeKey("");
          return;
        }
        event.preventDefault();
        applyGraphChange((prev) => ({
          ...prev,
          edges: prev.edges.filter((edge) => getGraphEdgeKey(edge) !== selectedEdgeKey),
        }));
        setSelectedEdgeKey("");
        setStatus("연결선 삭제됨");
        return;
      }

      if (selectedNodeIds.length > 0) {
        const targets = selectedNodeIds.filter((id) => canvasNodeIdSet.has(id));
        if (targets.length === 0) {
          setNodeSelection([]);
          return;
        }
        event.preventDefault();
        deleteNodes(targets);
        setStatus(targets.length > 1 ? "선택 노드 삭제됨" : "노드 삭제됨");
      }
    };

    window.addEventListener("keydown", onDeleteSelection);
    return () => window.removeEventListener("keydown", onDeleteSelection);
  }, [workspaceTab, selectedEdgeKey, selectedNodeIds, canvasDisplayEdges, canvasNodeIdSet]);

  useEffect(() => {
    try {
      const next = cwd.trim();
      if (!next) {
        window.localStorage.removeItem(WORKSPACE_CWD_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(WORKSPACE_CWD_STORAGE_KEY, next);
    } catch {
      // ignore persistence failures
    }
  }, [cwd]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOGIN_COMPLETED_STORAGE_KEY, loginCompleted ? "1" : "0");
    } catch {
      // ignore persistence failures
    }
  }, [loginCompleted]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, authMode);
    } catch {
      // ignore persistence failures
    }
  }, [authMode]);

  useEffect(() => {
    syncQuestionInputHeight();
  }, [workflowQuestion]);

  useEffect(() => {
    syncCanvasLogicalViewport();
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    const onScrollOrResize = () => syncCanvasLogicalViewport();
    canvas.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      canvas.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [canvasZoom, canvasFullscreen, workspaceTab]);

  useEffect(() => {
    syncCanvasLogicalViewport();
  }, [graph.nodes, canvasZoom]);

  useEffect(() => {
    if (workspaceTab !== "workflow") {
      return;
    }
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }

    const elements = Array.from(canvas.querySelectorAll<HTMLDivElement>(".graph-node[data-node-id]"));
    const seen = new Set<string>();
    let changed = false;

    for (const element of elements) {
      const nodeId = element.dataset.nodeId;
      if (!nodeId) {
        continue;
      }
      seen.add(nodeId);
      const nextSize: NodeVisualSize = { width: element.offsetWidth, height: element.offsetHeight };
      const prevSize = nodeSizeMapRef.current[nodeId];
      if (!prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height) {
        nodeSizeMapRef.current[nodeId] = nextSize;
        changed = true;
      }
    }

    for (const knownId of Object.keys(nodeSizeMapRef.current)) {
      if (!seen.has(knownId)) {
        delete nodeSizeMapRef.current[knownId];
        changed = true;
      }
    }

    if (changed) {
      setNodeSizeVersion((version) => version + 1);
    }
  });

  useEffect(() => {
    return () => {
      if (dragAutoPanFrameRef.current != null) {
        cancelAnimationFrame(dragAutoPanFrameRef.current);
      }
      if (dragWindowMoveHandlerRef.current) {
        window.removeEventListener("mousemove", dragWindowMoveHandlerRef.current);
      }
      if (dragWindowUpHandlerRef.current) {
        window.removeEventListener("mouseup", dragWindowUpHandlerRef.current);
      }
      if (edgeDragWindowMoveHandlerRef.current) {
        window.removeEventListener("mousemove", edgeDragWindowMoveHandlerRef.current);
      }
      if (edgeDragWindowUpHandlerRef.current) {
        window.removeEventListener("mouseup", edgeDragWindowUpHandlerRef.current);
      }
      if (zoomStatusTimerRef.current != null) {
        window.clearTimeout(zoomStatusTimerRef.current);
      }
      if (webTurnResolverRef.current) {
        webTurnResolverRef.current({ ok: false, error: "화면이 닫혀 실행이 취소되었습니다." });
        webTurnResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnectingDrag || !connectFromNodeId) {
      return;
    }
    const onWindowMove = (event: MouseEvent) => {
      const point = clientToLogicalPoint(event.clientX, event.clientY);
      if (point) {
        setConnectPreviewPoint(point);
      }
    };
    const onWindowUp = () => {
      setIsConnectingDrag(false);
      setConnectPreviewStartPoint(null);
      setConnectPreviewPoint(null);
      setConnectFromNodeId("");
      setConnectFromSide(null);
    };
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", onWindowUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMove);
      window.removeEventListener("mouseup", onWindowUp);
    };
  }, [isConnectingDrag, connectFromNodeId, canvasZoom]);

  async function saveRunRecord(runRecord: RunRecord) {
    const fileName = `run-${runRecord.runId}.json`;
    try {
      await invoke("run_save", {
        name: fileName,
        run: runRecord,
      });
      setLastSavedRunFile(fileName);
      await refreshRunFiles();
      await refreshFeedTimeline();
    } catch (e) {
      setError(String(e));
    }
  }

  function questionSignature(question?: string): string {
    return (question ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function graphSignature(graphData: GraphData): string {
    const nodeSig = graphData.nodes
      .map((node) => `${node.id}:${node.type}`)
      .sort()
      .join("|");
    const edgeSig = graphData.edges
      .map((edge) => `${edge.from.nodeId}->${edge.to.nodeId}`)
      .sort()
      .join("|");
    return `${nodeSig}::${edgeSig}`;
  }

  async function buildRegressionSummary(currentRun: RunRecord): Promise<RegressionSummary> {
    if (!currentRun.qualitySummary) {
      return { status: "unknown", note: "비교할 품질 요약이 없습니다." };
    }

    try {
      const files = await invoke<string[]>("run_list");
      const currentFile = `run-${currentRun.runId}.json`;
      const targetSignature = graphSignature(currentRun.graphSnapshot);
      const targetQuestion = questionSignature(currentRun.question);
      const sortedCandidates = files
        .filter((file) => file !== currentFile)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 30);

      for (const file of sortedCandidates) {
        const previous = await invoke<RunRecord>("run_load", { name: file });
        if (!previous.qualitySummary) {
          continue;
        }
        if (graphSignature(previous.graphSnapshot) !== targetSignature) {
          continue;
        }
        if (questionSignature(previous.question) !== targetQuestion) {
          continue;
        }

        const avgScoreDelta =
          Math.round((currentRun.qualitySummary.avgScore - previous.qualitySummary.avgScore) * 100) /
          100;
        const passRateDelta =
          Math.round((currentRun.qualitySummary.passRate - previous.qualitySummary.passRate) * 100) /
          100;

        let status: RegressionSummary["status"] = "stable";
        if (avgScoreDelta >= 3 || passRateDelta >= 8) {
          status = "improved";
        } else if (avgScoreDelta <= -5 || passRateDelta <= -12) {
          status = "degraded";
        }

        return {
          baselineRunId: previous.runId,
          avgScoreDelta,
          passRateDelta,
          status,
          note:
            status === "improved"
              ? "이전 실행 대비 품질이 개선되었습니다."
              : status === "degraded"
                ? "이전 실행 대비 품질이 악화되었습니다."
                : "이전 실행과 유사한 품질입니다.",
        };
      }
      return { status: "unknown", note: "비교 가능한 이전 실행이 없습니다." };
    } catch (error) {
      return { status: "unknown", note: `회귀 비교 실패: ${String(error)}` };
    }
  }

  function nodeInputFor(
    nodeId: string,
    outputs: Record<string, unknown>,
    rootInput: string,
  ): unknown {
    const incoming = graph.edges.filter((edge) => edge.to.nodeId === nodeId);
    if (incoming.length === 0) {
      return rootInput;
    }
    if (incoming.length === 1) {
      return outputs[incoming[0].from.nodeId] ?? null;
    }

    const merged: Record<string, unknown> = {};
    for (const edge of incoming) {
      merged[edge.from.nodeId] = outputs[edge.from.nodeId];
    }
    return merged;
  }

  function transition(runRecord: RunRecord, nodeId: string, state: NodeExecutionStatus, message?: string) {
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

  async function executeTransformNode(node: GraphNode, input: unknown): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const config = node.config as TransformConfig;
    const mode = (config.mode ?? "pick") as TransformMode;

    if (mode === "pick") {
      const path = String(config.pickPath ?? "");
      return { ok: true, output: getByPath(input, path) };
    }

    if (mode === "merge") {
      const rawMerge = String(config.mergeJson ?? "{}");
      let mergeValue: unknown = {};
      try {
        mergeValue = JSON.parse(rawMerge);
      } catch (e) {
        return { ok: false, error: `merge JSON 형식 오류: ${String(e)}` };
      }

      if (input && typeof input === "object" && !Array.isArray(input) && mergeValue && typeof mergeValue === "object") {
        return {
          ok: true,
          output: {
            ...(input as Record<string, unknown>),
            ...(mergeValue as Record<string, unknown>),
          },
        };
      }

      return {
        ok: true,
        output: {
          input,
          merge: mergeValue,
        },
      };
    }

    const template = String(config.template ?? "{{input}}");
    const rendered = replaceInputPlaceholder(template, stringifyInput(input));
    return {
      ok: true,
      output: {
        text: rendered,
      },
    };
  }

  function executeGateNode(
    node: GraphNode,
    input: unknown,
    skipSet: Set<string>,
  ): { ok: boolean; output?: unknown; error?: string; message?: string } {
    const config = node.config as GateConfig;
    let schemaFallbackNote = "";
    let decisionFallbackNote = "";
    const schemaRaw = String(config.schemaJson ?? "").trim();
    if (schemaRaw) {
      let parsedSchema: unknown;
      try {
        parsedSchema = JSON.parse(schemaRaw);
      } catch (e) {
        return { ok: false, error: `스키마 JSON 형식 오류: ${String(e)}` };
      }
      const schemaErrors = validateSimpleSchema(parsedSchema, input);
      if (schemaErrors.length > 0) {
        if (SIMPLE_WORKFLOW_UI) {
          schemaFallbackNote = `스키마 완화 적용 (${schemaErrors.join("; ")})`;
          addNodeLog(node.id, `[분기] ${schemaFallbackNote}`);
        } else {
          return {
            ok: false,
            error: `스키마 검증 실패: ${schemaErrors.join("; ")}`,
          };
        }
      }
    }

    const decisionPath = String(config.decisionPath ?? "DECISION");
    const decisionRaw =
      getByPath(input, decisionPath) ??
      (decisionPath === "DECISION" ? getByPath(input, "decision") : undefined) ??
      (decisionPath === "decision" ? getByPath(input, "DECISION") : undefined);
    let decision = String(decisionRaw ?? "").toUpperCase();
    if (decision !== "PASS" && decision !== "REJECT") {
      const text = stringifyInput(input).toUpperCase();
      const jsonMatch = text.match(/"DECISION"\s*:\s*"(PASS|REJECT)"/);
      if (jsonMatch?.[1]) {
        decision = jsonMatch[1];
        decisionFallbackNote = `JSON에서 DECISION=${decision} 추론`;
      } else if (/\bREJECT\b/.test(text)) {
        decision = "REJECT";
        decisionFallbackNote = "본문 키워드에서 REJECT 추론";
      } else if (/\bPASS\b/.test(text)) {
        decision = "PASS";
        decisionFallbackNote = "본문 키워드에서 PASS 추론";
      } else if (SIMPLE_WORKFLOW_UI) {
        decision = "PASS";
        decisionFallbackNote = "DECISION 누락으로 PASS 기본값 적용";
      }
      if (decisionFallbackNote) {
        addNodeLog(node.id, `[분기] ${decisionFallbackNote}`);
      }
    }

    if (decision !== "PASS" && decision !== "REJECT") {
      return {
        ok: false,
        error: `분기 값은 PASS 또는 REJECT 여야 합니다. 입력값=${String(decisionRaw)}`,
      };
    }

    const children = graph.edges
      .filter((edge) => edge.from.nodeId === node.id)
      .map((edge) => edge.to.nodeId)
      .filter((value, index, arr) => arr.indexOf(value) === index);

    const allowed = new Set<string>();
    if (decision === "PASS") {
      const target = String(config.passNodeId ?? "") || children[0] || "";
      if (target) {
        allowed.add(target);
      }
    } else {
      const target = String(config.rejectNodeId ?? "") || children[1] || "";
      if (target) {
        allowed.add(target);
      }
    }

    for (const child of children) {
      if (!allowed.has(child)) {
        skipSet.add(child);
      }
    }

    return {
      ok: true,
      output: {
        decision,
        fallback: {
          schema: schemaFallbackNote || undefined,
          decision: decisionFallbackNote || undefined,
        },
      },
      message: `분기 결과=${decision}, 실행 대상=${Array.from(allowed).join(",") || "없음"}${
        schemaFallbackNote || decisionFallbackNote ? " (내부 폴백 적용)" : ""
      }`,
    };
  }

  function normalizeWebTurnOutput(
    provider: WebProvider,
    mode: WebResultMode,
    rawInput: string,
  ): { ok: boolean; output?: unknown; error?: string } {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return { ok: false, error: "웹 응답 입력이 비어 있습니다." };
    }

    if (mode === "manualPasteJson") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        return { ok: false, error: `JSON 파싱 실패: ${String(error)}` };
      }
      return {
        ok: true,
        output: {
          provider,
          timestamp: new Date().toISOString(),
          data: parsed,
          text: extractFinalAnswer(parsed),
        },
      };
    }

    return {
      ok: true,
      output: {
        provider,
        timestamp: new Date().toISOString(),
        text: trimmed,
      },
    };
  }

  function resolvePendingWebTurn(result: { ok: boolean; output?: unknown; error?: string }) {
    const resolver = webTurnResolverRef.current;
    webTurnResolverRef.current = null;
    setPendingWebTurn(null);
    setWebResponseDraft("");
    if (resolver) {
      resolver(result);
    }
  }

  async function requestWebTurnResponse(
    nodeId: string,
    provider: WebProvider,
    prompt: string,
    mode: WebResultMode,
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    setWebResponseDraft("");
    setPendingWebTurn({
      nodeId,
      provider,
      prompt,
      mode,
    });
    return new Promise((resolve) => {
      webTurnResolverRef.current = resolve;
    });
  }

  async function loadAgentRuleDocs(nodeCwd: string): Promise<AgentRuleDoc[]> {
    const cwdKey = nodeCwd.trim();
    if (!cwdKey) {
      return [];
    }

    const cached = agentRulesCacheRef.current[cwdKey];
    if (cached && Date.now() - cached.loadedAt <= AGENT_RULE_CACHE_TTL_MS) {
      return cached.docs;
    }

    try {
      const result = await invoke<AgentRulesReadResult>("agent_rules_read", {
        cwd: cwdKey,
      });
      const docs = (result.docs ?? [])
        .filter((row) => row && typeof row.path === "string" && typeof row.content === "string")
        .slice(0, AGENT_RULE_MAX_DOCS)
        .map((row) => ({
          path: String(row.path).trim() || "unknown.md",
          content: String(row.content).slice(0, AGENT_RULE_MAX_DOC_CHARS).trim(),
        }))
        .filter((row) => row.content.length > 0);
      agentRulesCacheRef.current[cwdKey] = { loadedAt: Date.now(), docs };
      return docs;
    } catch {
      return [];
    }
  }

  async function injectKnowledgeContext(
    node: GraphNode,
    prompt: string,
    config: TurnConfig,
  ): Promise<{ prompt: string; trace: KnowledgeTraceEntry[] }> {
    const knowledgeEnabled = config.knowledgeEnabled !== false;
    if (!knowledgeEnabled) {
      return { prompt, trace: [] };
    }

    if (enabledKnowledgeFiles.length === 0) {
      return { prompt, trace: [] };
    }

    if (graphKnowledge.topK <= 0) {
      return { prompt, trace: [] };
    }

    try {
      const result = await invoke<KnowledgeRetrieveResult>("knowledge_retrieve", {
        files: enabledKnowledgeFiles,
        query: prompt,
        topK: graphKnowledge.topK,
        maxChars: graphKnowledge.maxChars,
      });

      for (const warning of result.warnings) {
        addNodeLog(node.id, `[첨부] ${warning}`);
      }

      if (result.snippets.length === 0) {
        addNodeLog(node.id, "[첨부] 관련 문단을 찾지 못해 기본 프롬프트로 실행합니다.");
        return { prompt, trace: [] };
      }

      const contextLines = result.snippets.map(
        (snippet) => `- [source: ${snippet.fileName}#${snippet.chunkIndex}] ${snippet.text}`,
      );
      const mergedPrompt = `[첨부 참고자료]
${contextLines.join("\n")}
[/첨부 참고자료]

[요청]
${prompt}`;

      addNodeLog(node.id, `[첨부] ${result.snippets.length}개 문단 반영`);

      const trace = result.snippets.map((snippet) => ({
        nodeId: node.id,
        fileId: snippet.fileId,
        fileName: snippet.fileName,
        chunkIndex: snippet.chunkIndex,
        score: snippet.score,
      }));

      return { prompt: mergedPrompt, trace };
    } catch (error) {
      addNodeLog(node.id, `[첨부] 검색 실패: ${String(error)}`);
      return { prompt, trace: [] };
    }
  }

  async function executeTurnNode(
    node: GraphNode,
    input: unknown,
  ): Promise<{
    ok: boolean;
    output?: unknown;
    error?: string;
    threadId?: string;
    turnId?: string;
    usage?: UsageStats;
    executor: TurnExecutor;
    provider: string;
    knowledgeTrace?: KnowledgeTraceEntry[];
  }> {
    const config = node.config as TurnConfig;
    const executor = getTurnExecutor(config);
    const nodeModel = toTurnModelDisplayName(String(config.model ?? model).trim() || model);
    const nodeModelEngine = toTurnModelEngineId(nodeModel);
    const nodeCwd = String(config.cwd ?? cwd).trim() || cwd;
    const promptTemplate = String(config.promptTemplate ?? "{{input}}");
    const nodeOllamaModel = String(config.ollamaModel ?? "llama3.1:8b").trim() || "llama3.1:8b";

    const inputText = stringifyInput(input);
    const queuedRequests = consumeNodeRequests(node.id);
    const queuedRequestBlock =
      queuedRequests.length > 0
        ? `\n\n[사용자 추가 요청]\n${queuedRequests.map((line, index) => `${index + 1}. ${line}`).join("\n")}`
        : "";
    if (queuedRequests.length > 0) {
      addNodeLog(node.id, `[요청 반영] ${queuedRequests.length}개 추가 요청을 이번 실행에 반영했습니다.`);
    }
    const basePrompt = promptTemplate.includes("{{input}}")
      ? replaceInputPlaceholder(promptTemplate, inputText)
      : `${promptTemplate}${inputText ? `\n${inputText}` : ""}`;
    const promptWithRequests = `${basePrompt}${queuedRequestBlock}`.trim();
    const agentRuleDocs = await loadAgentRuleDocs(nodeCwd);
    if (agentRuleDocs.length > 0) {
      addNodeLog(node.id, `[규칙] agent/skill 문서 ${agentRuleDocs.length}개 강제 적용`);
    }
    const forcedRuleBlock = buildForcedAgentRuleBlock(agentRuleDocs);
    const withKnowledge = await injectKnowledgeContext(node, promptWithRequests, config);
    const textToSend = forcedRuleBlock
      ? `${forcedRuleBlock}\n\n${withKnowledge.prompt}`.trim()
      : withKnowledge.prompt;
    const knowledgeTrace = withKnowledge.trace;

    if (executor === "ollama") {
      try {
        const raw = await invoke<unknown>("ollama_generate", {
          model: nodeOllamaModel,
          prompt: textToSend,
        });
        const text =
          extractStringByPaths(raw, ["response", "message.content", "content"]) ??
          stringifyInput(raw);
        return {
          ok: true,
          output: {
            provider: "ollama",
            timestamp: new Date().toISOString(),
            text,
            raw,
          },
          executor,
          provider: "ollama",
          knowledgeTrace,
        };
      } catch (error) {
        return {
          ok: false,
          error: `Ollama 실행 실패: ${String(error)}`,
          executor,
          provider: "ollama",
          knowledgeTrace,
        };
      }
    }

    const webProvider = getWebProviderFromExecutor(executor);
    if (webProvider) {
      const webResultMode = normalizeWebResultMode(config.webResultMode);
      const webTimeoutMs = Math.max(5_000, Number(config.webTimeoutMs ?? 90_000) || 90_000);

      if (webResultMode === "bridgeAssisted") {
        activeWebNodeIdRef.current = node.id;
        activeWebProviderRef.current = webProvider;
        addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 브리지 반자동 시작`);
        addNodeLog(node.id, "[WEB] 웹 서비스 탭에서 전송 버튼을 1회 눌러주세요.");
        setStatus(`${webProviderLabel(webProvider)} 브리지 대기 중 - 웹 탭에서 전송 1회 필요`);
        try {
          await openUrl(webProviderHomeUrl(webProvider));
          addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 웹 탭을 자동으로 열었습니다.`);
        } catch (error) {
          addNodeLog(node.id, `[WEB] 웹 탭 자동 열기 실패: ${String(error)}`);
        }
        const workerReady = await ensureWebWorkerReady();
        if (!workerReady) {
          addNodeLog(node.id, `[WEB] 브리지 워커 준비 실패, 수동 입력으로 전환`);
          activeWebNodeIdRef.current = "";
          activeWebProviderRef.current = null;
          setNodeStatus(node.id, "waiting_user", `${webProvider} 응답 입력 대기`);
          setNodeRuntimeFields(node.id, {
            status: "waiting_user",
          });
          return requestWebTurnResponse(
            node.id,
            webProvider,
            textToSend,
            "manualPasteText",
          ).then((result) => ({
            ...result,
            executor,
            provider: webProvider,
            knowledgeTrace,
          }));
        } else {
          const runBridgeAssisted = async () =>
            invoke<WebProviderRunResult>("web_provider_run", {
              provider: webProvider,
              prompt: textToSend,
              timeoutMs: webTimeoutMs,
              mode: "bridgeAssisted",
            });

          let result: WebProviderRunResult | null = null;
          try {
            result = await runBridgeAssisted();

            if (result.ok && result.text) {
              addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 브리지 응답 수집 완료`);
              return {
                ok: true,
                output: {
                  provider: webProvider,
                  timestamp: new Date().toISOString(),
                  text: result.text,
                  raw: result.raw,
                  meta: result.meta,
                },
                executor,
                provider: webProvider,
                knowledgeTrace,
              };
            }

            if (cancelRequestedRef.current || result?.errorCode === "CANCELLED") {
              return {
                ok: false,
                error: "사용자 취소",
                executor,
                provider: webProvider,
                knowledgeTrace,
              };
            }

            const fallbackReason = `[WEB] 브리지 수집 실패 (${result?.errorCode ?? "UNKNOWN"}): ${
              result?.error ?? "unknown error"
            }`;
            addNodeLog(node.id, fallbackReason);
            addNodeLog(node.id, "[WEB] 수동 입력 모달로 전환합니다.");
            setNodeStatus(node.id, "waiting_user", `${webProvider} 응답 입력 대기`);
            setNodeRuntimeFields(node.id, {
              status: "waiting_user",
            });
            return requestWebTurnResponse(
              node.id,
              webProvider,
              textToSend,
              "manualPasteText",
            ).then((fallback) => ({
              ...fallback,
              executor,
              provider: webProvider,
              knowledgeTrace,
            }));
          } catch (error) {
            if (cancelRequestedRef.current) {
              return {
                ok: false,
                error: "사용자 취소",
                executor,
                provider: webProvider,
                knowledgeTrace,
              };
            }
            addNodeLog(node.id, `[WEB] 브리지 예외: ${String(error)}`);
            addNodeLog(node.id, "[WEB] 수동 입력 모달로 전환합니다.");
            setNodeStatus(node.id, "waiting_user", `${webProvider} 응답 입력 대기`);
            setNodeRuntimeFields(node.id, {
              status: "waiting_user",
            });
            return requestWebTurnResponse(
              node.id,
              webProvider,
              textToSend,
              "manualPasteText",
            ).then((fallback) => ({
              ...fallback,
              executor,
              provider: webProvider,
              knowledgeTrace,
            }));
          } finally {
            activeWebNodeIdRef.current = "";
            activeWebProviderRef.current = null;
          }
        }
      }

      try {
        await openUrl(webProviderHomeUrl(webProvider));
      } catch (error) {
        return {
          ok: false,
          error: `웹 서비스 브라우저 열기 실패(${webProvider}): ${String(error)}`,
          executor,
          provider: webProvider,
          knowledgeTrace,
        };
      }
      setNodeStatus(node.id, "waiting_user", `${webProvider} 응답 입력 대기`);
      setNodeRuntimeFields(node.id, {
        status: "waiting_user",
      });
      return requestWebTurnResponse(
        node.id,
        webProvider,
        textToSend,
        webResultMode,
      ).then((result) => ({
        ...result,
        executor,
        provider: webProvider,
        knowledgeTrace,
      }));
    }

    let activeThreadId = extractStringByPaths(nodeStates[node.id], ["threadId"]);
    if (!activeThreadId) {
      const threadStart = await invoke<ThreadStartResult>("thread_start", {
        model: nodeModelEngine,
        cwd: nodeCwd,
      });
      activeThreadId = threadStart.threadId;
    }

    if (!activeThreadId) {
      return {
        ok: false,
        error: "threadId를 가져오지 못했습니다.",
        executor,
        provider: "codex",
        knowledgeTrace,
      };
    }

    setNodeRuntimeFields(node.id, { threadId: activeThreadId });

    activeTurnNodeIdRef.current = node.id;
    activeRunDeltaRef.current[node.id] = "";

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const terminalPromise = new Promise<TurnTerminal>((resolve) => {
      turnTerminalResolverRef.current = resolve;
      timeoutHandle = setTimeout(() => {
        if (turnTerminalResolverRef.current) {
          const resolver = turnTerminalResolverRef.current;
          turnTerminalResolverRef.current = null;
          resolver({ ok: false, status: "timeout", params: null });
        }
      }, 300000);
    });

    let turnStartResponse: unknown;
    try {
      turnStartResponse = await invoke<unknown>("turn_start", {
        threadId: activeThreadId,
        text: textToSend,
      });
    } catch (e) {
      if (turnTerminalResolverRef.current) {
        turnTerminalResolverRef.current = null;
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      activeTurnNodeIdRef.current = "";
      return {
        ok: false,
        error: String(e),
        threadId: activeThreadId,
        executor: "codex",
        provider: "codex",
        knowledgeTrace,
      };
    }

    const terminal = await terminalPromise;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    const turnId =
      extractStringByPaths(turnStartResponse, ["turnId", "turn_id", "id", "turn.id"]) ??
      extractStringByPaths(terminal.params, ["turnId", "turn_id", "id", "turn.id"]);
    const usage = extractUsageStats(terminal.params);

    activeTurnNodeIdRef.current = "";

    if (!terminal.ok) {
      return {
        ok: false,
        error: `턴 실행 실패 (${terminal.status})`,
        threadId: activeThreadId,
        turnId: turnId ?? undefined,
        usage,
        executor: "codex",
        provider: "codex",
        knowledgeTrace,
      };
    }

    return {
      ok: true,
      output: {
        text: activeRunDeltaRef.current[node.id] ?? "",
        completion: terminal.params,
      },
      threadId: activeThreadId,
      turnId: turnId ?? undefined,
      usage,
      executor: "codex",
      provider: "codex",
      knowledgeTrace,
    };
  }

  async function onRunGraph() {
    if (isGraphRunning || runStartGuardRef.current) {
      return;
    }

    const incomingNodeIds = new Set(graph.edges.map((edge) => edge.to.nodeId));
    const directInputNodeIds = graph.nodes.filter((node) => !incomingNodeIds.has(node.id)).map((node) => node.id);
    if (directInputNodeIds.length !== 1) {
      setError(
        `질문 직접 입력 노드는 1개여야 합니다. 현재 ${directInputNodeIds.length}개입니다. 노드 연결을 정리하세요.`,
      );
      setStatus("그래프 실행 대기");
      return;
    }

    runStartGuardRef.current = true;
    setIsRunStarting(true);
    setError("");
    setStatus("그래프 실행 시작");
    setIsGraphRunning(true);
    cancelRequestedRef.current = false;
    collectingRunRef.current = true;

    const initialState: Record<string, NodeRunState> = {};
    graph.nodes.forEach((node) => {
      initialState[node.id] = {
        status: "idle",
        logs: [],
      };
    });
    runLogCollectorRef.current = graph.nodes.reduce<Record<string, string[]>>((acc, node) => {
      acc[node.id] = [];
      return acc;
    }, {});
    setNodeStates(initialState);

    const runRecord: RunRecord = {
      runId: `${Date.now()}`,
      question: workflowQuestion,
      startedAt: new Date().toISOString(),
      graphSnapshot: graph,
      transitions: [],
      summaryLogs: [],
      nodeLogs: {},
      threadTurnMap: {},
      providerTrace: [],
      knowledgeTrace: [],
      nodeMetrics: {},
      feedPosts: [],
    };
    setActiveFeedRunMeta({
      runId: runRecord.runId,
      question: workflowQuestion,
      startedAt: runRecord.startedAt,
    });

    try {
      const requiresCodexEngine = graph.nodes.some((node) => {
        if (node.type !== "turn") {
          return false;
        }
        return getTurnExecutor(node.config as TurnConfig) === "codex";
      });
      if (requiresCodexEngine) {
        await ensureEngineStarted();
      }

      const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
      const indegree = new Map<string, number>();
      const adjacency = new Map<string, string[]>();

      for (const node of graph.nodes) {
        indegree.set(node.id, 0);
        adjacency.set(node.id, []);
      }

      for (const edge of graph.edges) {
        indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
        const children = adjacency.get(edge.from.nodeId) ?? [];
        children.push(edge.to.nodeId);
        adjacency.set(edge.from.nodeId, children);
      }

      const queue: string[] = [];
      indegree.forEach((degree, nodeId) => {
        if (degree === 0) {
          queue.push(nodeId);
          setNodeStatus(nodeId, "queued");
          transition(runRecord, nodeId, "queued");
        }
      });

      const outputs: Record<string, unknown> = {};
      const skipSet = new Set<string>();
      let lastDoneNodeId = "";

      while (queue.length > 0) {
        const nodeId = queue.shift() as string;
        const node = nodeMap.get(nodeId);
        if (!node) {
          continue;
        }

        if (cancelRequestedRef.current) {
          setNodeStatus(nodeId, "cancelled", "취소 요청됨");
          transition(runRecord, nodeId, "cancelled", "취소 요청됨");
          const cancelledAt = new Date().toISOString();
          const cancelledFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            status: "cancelled",
            createdAt: cancelledAt,
            summary: "사용자 중지 요청으로 실행이 취소되었습니다.",
            logs: runLogCollectorRef.current[nodeId] ?? [],
          });
          runRecord.feedPosts?.push(cancelledFeed.post);
          feedRawAttachmentRef.current[feedAttachmentRawKey(cancelledFeed.post.id, "markdown")] =
            cancelledFeed.rawAttachments.markdown;
          feedRawAttachmentRef.current[feedAttachmentRawKey(cancelledFeed.post.id, "json")] =
            cancelledFeed.rawAttachments.json;
          break;
        }

        if (skipSet.has(nodeId)) {
          setNodeStatus(nodeId, "skipped", "분기 결과로 건너뜀");
          setNodeRuntimeFields(nodeId, {
            status: "skipped",
            finishedAt: new Date().toISOString(),
          });
          transition(runRecord, nodeId, "skipped", "분기 결과로 건너뜀");
        } else {
          const startedAtMs = Date.now();
          const startedAtIso = new Date(startedAtMs).toISOString();
          setNodeStatus(nodeId, "running", "노드 실행 시작");
          setNodeRuntimeFields(nodeId, {
            status: "running",
            startedAt: startedAtIso,
            finishedAt: undefined,
            durationMs: undefined,
            usage: undefined,
          });
          transition(runRecord, nodeId, "running");

          const input = nodeInputFor(nodeId, outputs, workflowQuestion);

          if (node.type === "turn") {
            const result = await executeTurnNode(node, input);
            if (result.knowledgeTrace && result.knowledgeTrace.length > 0) {
              runRecord.knowledgeTrace?.push(...result.knowledgeTrace);
            }
            if (!result.ok) {
              const finishedAtIso = new Date().toISOString();
              setNodeStatus(nodeId, "failed", result.error ?? "턴 실행 실패");
              setNodeRuntimeFields(nodeId, {
                error: result.error,
                status: "failed",
                threadId: result.threadId,
                turnId: result.turnId,
                usage: result.usage,
                finishedAt: finishedAtIso,
                durationMs: Date.now() - startedAtMs,
              });
              runRecord.providerTrace?.push({
                nodeId,
                executor: result.executor,
                provider: result.provider,
                status: cancelRequestedRef.current ? "cancelled" : "failed",
                startedAt: startedAtIso,
                finishedAt: finishedAtIso,
                summary: result.error ?? "턴 실행 실패",
              });
              transition(runRecord, nodeId, "failed", result.error ?? "턴 실행 실패");
              const failedFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                status: "failed",
                createdAt: finishedAtIso,
                summary: result.error ?? "턴 실행 실패",
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: result.output,
                error: result.error,
                durationMs: Date.now() - startedAtMs,
                usage: result.usage,
              });
              runRecord.feedPosts?.push(failedFeed.post);
              feedRawAttachmentRef.current[feedAttachmentRawKey(failedFeed.post.id, "markdown")] =
                failedFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(failedFeed.post.id, "json")] =
                failedFeed.rawAttachments.json;
              break;
            }

            const config = node.config as TurnConfig;
            const artifactType = toArtifactType(config.artifactType);
            const normalizedArtifact = normalizeArtifactOutput(nodeId, artifactType, result.output);
            for (const warning of normalizedArtifact.warnings) {
              addNodeLog(nodeId, `[아티팩트] ${warning}`);
            }
            const normalizedOutput = normalizedArtifact.output;
            const qualityReport = await buildQualityReport({
              node,
              config,
              output: normalizedOutput,
              cwd: String(config.cwd ?? cwd).trim() || cwd,
            });
            const nodeMetric: NodeMetric = {
              nodeId,
              profile: qualityReport.profile,
              score: qualityReport.score,
              decision: qualityReport.decision,
              threshold: qualityReport.threshold,
              failedChecks: qualityReport.failures.length,
              warningCount: qualityReport.warnings.length,
            };
            runRecord.nodeMetrics = {
              ...(runRecord.nodeMetrics ?? {}),
              [nodeId]: nodeMetric,
            };
            for (const warning of qualityReport.warnings) {
              addNodeLog(nodeId, `[품질] ${warning}`);
            }

            if (qualityReport.decision !== "PASS") {
              const finishedAtIso = new Date().toISOString();
              setNodeStatus(nodeId, "failed", "품질 게이트 REJECT");
              setNodeRuntimeFields(nodeId, {
                status: "failed",
                output: normalizedOutput,
                qualityReport,
                error: `품질 게이트 REJECT (점수 ${qualityReport.score}/${qualityReport.threshold})`,
                threadId: result.threadId,
                turnId: result.turnId,
                usage: result.usage,
                finishedAt: finishedAtIso,
                durationMs: Date.now() - startedAtMs,
              });
              runRecord.threadTurnMap[nodeId] = {
                threadId: result.threadId,
                turnId: result.turnId,
              };
              runRecord.providerTrace?.push({
                nodeId,
                executor: result.executor,
                provider: result.provider,
                status: "failed",
                startedAt: startedAtIso,
                finishedAt: finishedAtIso,
                summary: `품질 REJECT (${qualityReport.score}/${qualityReport.threshold})`,
              });
              transition(
                runRecord,
                nodeId,
                "failed",
                `품질 REJECT (${qualityReport.score}/${qualityReport.threshold})`,
              );
              const rejectedFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                status: "failed",
                createdAt: finishedAtIso,
                summary: `품질 REJECT (${qualityReport.score}/${qualityReport.threshold})`,
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: normalizedOutput,
                error: `품질 게이트 REJECT (점수 ${qualityReport.score}/${qualityReport.threshold})`,
                durationMs: Date.now() - startedAtMs,
                usage: result.usage,
                qualityReport,
              });
              runRecord.feedPosts?.push(rejectedFeed.post);
              feedRawAttachmentRef.current[feedAttachmentRawKey(rejectedFeed.post.id, "markdown")] =
                rejectedFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(rejectedFeed.post.id, "json")] =
                rejectedFeed.rawAttachments.json;
              break;
            }

            const finishedAtIso = new Date().toISOString();
            outputs[nodeId] = normalizedOutput;
            addNodeLog(nodeId, `[품질] PASS (${qualityReport.score}/${qualityReport.threshold})`);
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: normalizedOutput,
              qualityReport,
              threadId: result.threadId,
              turnId: result.turnId,
              usage: result.usage,
              finishedAt: finishedAtIso,
              durationMs: Date.now() - startedAtMs,
            });
            setNodeStatus(nodeId, "done", "턴 실행 완료");
            runRecord.threadTurnMap[nodeId] = {
              threadId: result.threadId,
              turnId: result.turnId,
            };
            runRecord.providerTrace?.push({
              nodeId,
              executor: result.executor,
              provider: result.provider,
              status: "done",
              startedAt: startedAtIso,
              finishedAt: finishedAtIso,
              summary: "턴 실행 완료",
            });
            transition(runRecord, nodeId, "done", "턴 실행 완료");
            const doneFeed = buildFeedPost({
              runId: runRecord.runId,
              node,
              status: "done",
              createdAt: finishedAtIso,
              summary: "턴 실행 완료",
              logs: runLogCollectorRef.current[nodeId] ?? [],
              output: normalizedOutput,
              durationMs: Date.now() - startedAtMs,
              usage: result.usage,
              qualityReport,
            });
            runRecord.feedPosts?.push(doneFeed.post);
            feedRawAttachmentRef.current[feedAttachmentRawKey(doneFeed.post.id, "markdown")] =
              doneFeed.rawAttachments.markdown;
            feedRawAttachmentRef.current[feedAttachmentRawKey(doneFeed.post.id, "json")] =
              doneFeed.rawAttachments.json;
            lastDoneNodeId = nodeId;
          } else if (node.type === "transform") {
            const result = await executeTransformNode(node, input);
            if (!result.ok) {
              const finishedAtIso = new Date().toISOString();
              setNodeStatus(nodeId, "failed", result.error ?? "변환 실패");
              setNodeRuntimeFields(nodeId, {
                status: "failed",
                error: result.error,
                finishedAt: finishedAtIso,
                durationMs: Date.now() - startedAtMs,
              });
              transition(runRecord, nodeId, "failed", result.error ?? "변환 실패");
              const transformFailedFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                status: "failed",
                createdAt: finishedAtIso,
                summary: result.error ?? "변환 실패",
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: result.output,
                error: result.error ?? "변환 실패",
                durationMs: Date.now() - startedAtMs,
              });
              runRecord.feedPosts?.push(transformFailedFeed.post);
              feedRawAttachmentRef.current[
                feedAttachmentRawKey(transformFailedFeed.post.id, "markdown")
              ] = transformFailedFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(transformFailedFeed.post.id, "json")] =
                transformFailedFeed.rawAttachments.json;
              break;
            }

            const finishedAtIso = new Date().toISOString();
            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
              finishedAt: finishedAtIso,
              durationMs: Date.now() - startedAtMs,
            });
            setNodeStatus(nodeId, "done", "변환 완료");
            transition(runRecord, nodeId, "done", "변환 완료");
            const transformDoneFeed = buildFeedPost({
              runId: runRecord.runId,
              node,
              status: "done",
              createdAt: finishedAtIso,
              summary: "변환 완료",
              logs: runLogCollectorRef.current[nodeId] ?? [],
              output: result.output,
              durationMs: Date.now() - startedAtMs,
            });
            runRecord.feedPosts?.push(transformDoneFeed.post);
            feedRawAttachmentRef.current[feedAttachmentRawKey(transformDoneFeed.post.id, "markdown")] =
              transformDoneFeed.rawAttachments.markdown;
            feedRawAttachmentRef.current[feedAttachmentRawKey(transformDoneFeed.post.id, "json")] =
              transformDoneFeed.rawAttachments.json;
            lastDoneNodeId = nodeId;
          } else {
            const result = executeGateNode(node, input, skipSet);
            if (!result.ok) {
              const finishedAtIso = new Date().toISOString();
              setNodeStatus(nodeId, "failed", result.error ?? "분기 실패");
              setNodeRuntimeFields(nodeId, {
                status: "failed",
                error: result.error,
                finishedAt: finishedAtIso,
                durationMs: Date.now() - startedAtMs,
              });
              transition(runRecord, nodeId, "failed", result.error ?? "분기 실패");
              const gateFailedFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                status: "failed",
                createdAt: finishedAtIso,
                summary: result.error ?? "분기 실패",
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: result.output,
                error: result.error ?? "분기 실패",
                durationMs: Date.now() - startedAtMs,
              });
              runRecord.feedPosts?.push(gateFailedFeed.post);
              feedRawAttachmentRef.current[feedAttachmentRawKey(gateFailedFeed.post.id, "markdown")] =
                gateFailedFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(gateFailedFeed.post.id, "json")] =
                gateFailedFeed.rawAttachments.json;
              break;
            }

            const finishedAtIso = new Date().toISOString();
            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
              finishedAt: finishedAtIso,
              durationMs: Date.now() - startedAtMs,
            });
            setNodeStatus(nodeId, "done", result.message ?? "분기 완료");
            transition(runRecord, nodeId, "done", result.message ?? "분기 완료");
            const gateDoneFeed = buildFeedPost({
              runId: runRecord.runId,
              node,
              status: "done",
              createdAt: finishedAtIso,
              summary: result.message ?? "분기 완료",
              logs: runLogCollectorRef.current[nodeId] ?? [],
              output: result.output,
              durationMs: Date.now() - startedAtMs,
            });
            runRecord.feedPosts?.push(gateDoneFeed.post);
            feedRawAttachmentRef.current[feedAttachmentRawKey(gateDoneFeed.post.id, "markdown")] =
              gateDoneFeed.rawAttachments.markdown;
            feedRawAttachmentRef.current[feedAttachmentRawKey(gateDoneFeed.post.id, "json")] =
              gateDoneFeed.rawAttachments.json;
            lastDoneNodeId = nodeId;
          }
        }

        const children = adjacency.get(nodeId) ?? [];
        for (const childId of children) {
          const next = (indegree.get(childId) ?? 0) - 1;
          indegree.set(childId, next);
          if (next === 0) {
            queue.push(childId);
            setNodeStatus(childId, "queued");
            transition(runRecord, childId, "queued");
          }
        }
      }

      if (cancelRequestedRef.current) {
        graph.nodes.forEach((node) => {
          setNodeStates((prev) => {
            const current = prev[node.id];
            if (!current || ["done", "failed", "skipped", "cancelled"].includes(current.status)) {
              return prev;
            }
            return {
              ...prev,
              [node.id]: {
                ...current,
                status: "cancelled",
              },
            };
          });
        });
      }

      runRecord.nodeLogs = runLogCollectorRef.current;
      if (runRecord.nodeMetrics && Object.keys(runRecord.nodeMetrics).length > 0) {
        runRecord.qualitySummary = summarizeQualityMetrics(runRecord.nodeMetrics);
      }
      if (lastDoneNodeId && lastDoneNodeId in outputs) {
        runRecord.finalAnswer = extractFinalAnswer(outputs[lastDoneNodeId]);
      }
      runRecord.finishedAt = new Date().toISOString();
      runRecord.regression = await buildRegressionSummary(runRecord);
      await saveRunRecord(runRecord);
      const normalizedRunRecord = normalizeRunRecord(runRecord);
      const runFileName = `run-${runRecord.runId}.json`;
      feedRunCacheRef.current[runFileName] = normalizedRunRecord;
      setSelectedRunDetail(normalizedRunRecord);
      setSelectedRunFile(runFileName);
      setStatus("그래프 실행 완료");
    } catch (e) {
      markCodexNodesStatusOnEngineIssue("failed", `그래프 실행 실패: ${String(e)}`, true);
      setError(String(e));
      setStatus("그래프 실행 실패");
    } finally {
      turnTerminalResolverRef.current = null;
      webTurnResolverRef.current = null;
      webLoginResolverRef.current = null;
      setPendingWebTurn(null);
      setPendingWebLogin(null);
      setWebResponseDraft("");
      activeTurnNodeIdRef.current = "";
      activeWebNodeIdRef.current = "";
      activeWebProviderRef.current = null;
      setIsGraphRunning(false);
      setIsRunStarting(false);
      runStartGuardRef.current = false;
      cancelRequestedRef.current = false;
      collectingRunRef.current = false;
      setActiveFeedRunMeta(null);
    }
  }

  async function onCancelGraphRun() {
    cancelRequestedRef.current = true;
    setStatus("취소 요청됨");

    if (pendingWebLogin) {
      resolvePendingWebLogin(false);
      return;
    }

    const activeWebNodeId = activeWebNodeIdRef.current;
    const activeWebProvider = activeWebProviderRef.current;
    if (activeWebNodeId && activeWebProvider) {
      try {
        await invoke("web_provider_cancel", { provider: activeWebProvider });
        addNodeLog(activeWebNodeId, "[WEB] 취소 요청 전송");
      } catch (e) {
        setError(String(e));
      }
    }

    if (pendingWebTurn) {
      resolvePendingWebTurn({ ok: false, error: "사용자 취소" });
      return;
    }

    const activeNodeId = activeTurnNodeIdRef.current;
    if (!activeNodeId) {
      return;
    }

    const active = nodeStates[activeNodeId];
    if (!active?.threadId) {
      return;
    }

    try {
      await invoke("turn_interrupt", { threadId: active.threadId });
      addNodeLog(activeNodeId, "turn_interrupt 요청 전송");
    } catch (e) {
      setError(String(e));
    }
  }

  function onOpenFeedFromNode(nodeId: string) {
    setWorkspaceTab("feed");
    setFeedCategory("all_posts");
    setFeedStatusFilter("all");
    setFeedKeyword("");
    setStatus(`피드에서 ${nodeId} 노드 결과를 확인하세요.`);
  }

  function onSelectFeedInspectorPost(post: FeedViewPost) {
    setFeedInspectorPostId(post.id);
    const graphNode = graph.nodes.find((node) => node.id === post.nodeId);
    if (graphNode) {
      setNodeSelection([graphNode.id], graphNode.id);
    }
  }

  function renderSettingsPanel(compact = false) {
    return (
      <section className={`controls ${compact ? "settings-compact" : ""}`}>
        <h2>엔진 및 계정</h2>
        {!compact && (
          <div className="settings-badges">
            <span className={`status-tag ${engineStarted ? "on" : "off"}`}>
              {engineStarted ? "엔진 연결됨" : "엔진 대기"}
            </span>
            <span className={`status-tag ${loginCompleted ? "on" : "off"}`}>
              {loginCompleted ? "로그인 완료" : "로그인 필요"}
            </span>
            <span className="status-tag neutral">인증: {authModeLabel(authMode)}</span>
          </div>
        )}
        <label>
          작업 경로(CWD)
          <div className="settings-cwd-row">
            <input className="lowercase-path-input" readOnly value={cwd} />
            <button className="settings-cwd-picker" onClick={onSelectCwdDirectory} type="button">
              폴더 선택
            </button>
          </div>
        </label>
        <label>
          기본 모델
          <FancySelect
            ariaLabel="기본 모델"
            className="modern-select"
            onChange={setModel}
            options={TURN_MODEL_OPTIONS.map((option) => ({ value: option, label: option }))}
            value={model}
          />
        </label>
        {!compact && (
          <div className="button-row">
            <button
              className="settings-engine-button settings-account-button"
              onClick={engineStarted ? onStopEngine : onStartEngine}
              disabled={running || isGraphRunning}
              type="button"
            >
              <span className="settings-button-label">{engineStarted ? "엔진 중지" : "엔진 시작"}</span>
            </button>
            <button
              className="settings-usage-button settings-account-button"
              onClick={onCheckUsage}
              disabled={running || isGraphRunning}
              type="button"
            >
              <span className="settings-button-label">사용량 확인</span>
            </button>
            <button
              className="settings-usage-button settings-account-button"
              onClick={onLoginCodex}
              disabled={running || isGraphRunning || codexAuthBusy}
              type="button"
            >
              <span className="settings-button-label">
                {codexAuthBusy ? "처리 중..." : loginCompleted ? "CODEX 로그아웃" : "CODEX 로그인"}
              </span>
            </button>
          </div>
        )}
        <div className="usage-method">최근 상태: {status}</div>
        {usageInfoText && (
          <div className="usage-result">
            <h3>사용량 조회 결과</h3>
            <pre>{usageInfoText}</pre>
          </div>
        )}
      </section>
    );
  }

  function renderBridgePanel() {
    const providerSeenMap = new Map(
      webBridgeStatus.connectedProviders.map((row) => [row.provider, row] as const),
    );
    const bridgeUrl = `http://127.0.0.1:${webBridgeStatus.port}`;
    return (
      <section className="panel-card settings-view bridge-view workspace-tab-panel">
        <section className="controls bridge-head-panel">
          <div className="web-automation-head">
            <h2>브리지</h2>
            <button
              aria-label="브리지 상태 동기화"
              className="settings-refresh-button settings-refresh-icon-button"
              disabled={webWorkerBusy}
              onClick={() => void refreshWebBridgeStatus()}
              title="브리지 상태 동기화"
              type="button"
            >
              <img alt="" aria-hidden="true" className="settings-refresh-icon" src="/reload.svg" />
            </button>
          </div>
          <div className="settings-badges">
            <span className={`status-tag ${webBridgeStatus.running ? "on" : "off"}`}>
              {webBridgeStatus.running ? "브리지 준비됨" : "브리지 중지됨"}
            </span>
            <span className="status-tag neutral">엔드포인트: {bridgeUrl}</span>
          </div>
          <div className="button-row bridge-action-row">
            <button
              className="settings-account-button"
              disabled={webWorkerBusy}
              onClick={() => void onCopyWebBridgeConnectCode()}
              type="button"
            >
              <span className="settings-button-label">연결 코드 복사</span>
            </button>
            <button
              className="settings-account-button"
              disabled={webWorkerBusy}
              onClick={() => void onRotateWebBridgeToken()}
              type="button"
            >
              <span className="settings-button-label">토큰 재발급</span>
            </button>
          </div>
          <div className="usage-method">
            확장과의 통신은 127.0.0.1 로컬 루프백 + Bearer 토큰으로만 허용됩니다.
          </div>
          <div className="usage-method">
            토큰 저장 위치: {webBridgeStatus.tokenStorage === "memory" ? "메모리 세션(앱 종료 시 폐기)" : "확인 필요"}
          </div>
          <div className="usage-method">
            실행 후 해당 웹 탭에서 전송 버튼을 1회 눌러야 답변 수집이 시작됩니다.
          </div>
          {webBridgeConnectCode && (
            <div className="bridge-code-card">
              <div className="bridge-code-head">
                <span>연결 코드</span>
                <button
                  className="settings-account-button"
                  disabled={webWorkerBusy}
                  onClick={() => void onCopyWebBridgeConnectCode()}
                  type="button"
                >
                  <span className="settings-button-label">다시 복사</span>
                </button>
              </div>
              <textarea
                className="bridge-code-textarea"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                rows={6}
                value={webBridgeConnectCode}
              />
            </div>
          )}
        </section>

        <section className="controls bridge-provider-panel">
          <h2>서비스 감지 상태</h2>
          <div className="provider-hub-list">
            {WEB_PROVIDER_OPTIONS.map((provider) => {
              const row = providerSeenMap.get(provider);
              const seenLabel = row?.lastSeenAt ? formatRunDateTime(row.lastSeenAt) : "미감지";
              return (
                <div className="provider-hub-row" key={`bridge-provider-${provider}`}>
                  <div className="provider-hub-meta">
                    <span className={`provider-session-pill ${row ? "connected" : "unknown"}`}>
                      <span className="provider-session-label">{row ? "연결됨" : "대기"}</span>
                    </span>
                    <span className="provider-hub-name">{webProviderLabel(provider)}</span>
                  </div>
                  <div className="bridge-provider-meta">
                    <span>{seenLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="usage-method">
            큐: {webBridgeStatus.queuedTasks} · 진행 중: {webBridgeStatus.activeTasks}
          </div>
        </section>

        <section className="controls bridge-log-panel">
          <h2>최근 수집 이벤트</h2>
          <div className="bridge-log-list">
            {webBridgeLogs.length === 0 && <div className="log-empty">최근 이벤트 없음</div>}
            {webBridgeLogs.map((line, index) => (
              <div className="bridge-log-line" key={`bridge-log-${index}`}>
                {line}
              </div>
            ))}
          </div>
        </section>
      </section>
    );
  }

  const edgeLines = canvasDisplayEdges
    .map((entry, index) => {
      const edge = entry.edge;
      const fromNode = canvasNodeMap.get(edge.from.nodeId);
      const toNode = canvasNodeMap.get(edge.to.nodeId);
      if (!fromNode || !toNode) {
        return null;
      }

      const fromSize = getNodeVisualSize(fromNode.id);
      const toSize = getNodeVisualSize(toNode.id);
      const auto = getAutoConnectionSides(fromNode, toNode, fromSize, toSize);
      const hasManualControl =
        !entry.readOnly && typeof edge.control?.x === "number" && typeof edge.control?.y === "number";
      const resolvedFromSide = hasManualControl ? (edge.from.side ?? auto.fromSide) : auto.fromSide;
      const resolvedToSide = hasManualControl ? (edge.to.side ?? auto.toSide) : auto.toSide;
      let fromPoint = getNodeAnchorPoint(fromNode, resolvedFromSide, fromSize);
      let toPoint = getNodeAnchorPoint(toNode, resolvedToSide, toSize);
      if (!hasManualControl) {
        const aligned = alignAutoEdgePoints(
          fromNode,
          toNode,
          fromPoint,
          toPoint,
          resolvedFromSide,
          resolvedToSide,
          fromSize,
          toSize,
        );
        fromPoint = aligned.fromPoint;
        toPoint = aligned.toPoint;
      }
      const edgeKey = entry.edgeKey;
      const defaultControl = edgeMidPoint(fromPoint, toPoint);
      const control = edge.control ?? defaultControl;

      return {
        key: `${edgeKey}-${index}`,
        edgeKey,
        startPoint: fromPoint,
        endPoint: toPoint,
        controlPoint: control,
        hasManualControl,
        readOnly: entry.readOnly,
        path: hasManualControl
          ? buildManualEdgePath(fromPoint.x, fromPoint.y, control.x, control.y, toPoint.x, toPoint.y)
          : buildRoundedEdgePath(
              fromPoint.x,
              fromPoint.y,
              toPoint.x,
              toPoint.y,
              true,
              resolvedFromSide,
              resolvedToSide,
            ),
      };
    })
    .filter(Boolean) as Array<{
      key: string;
      edgeKey: string;
      path: string;
      startPoint: LogicalPoint;
      endPoint: LogicalPoint;
      controlPoint: LogicalPoint;
      hasManualControl: boolean;
      readOnly: boolean;
    }>;
  const connectPreviewLine = (() => {
    if (!connectFromNodeId || !connectPreviewPoint) {
      return null;
    }
    const startPoint = (() => {
      if (connectPreviewStartPoint) {
        return connectPreviewStartPoint;
      }
      const fromNode = canvasNodeMap.get(connectFromNodeId);
      if (!fromNode) {
        return null;
      }
      return getNodeAnchorPoint(
        fromNode,
        connectFromSide ?? "right",
        getNodeVisualSize(fromNode.id),
      );
    })();
    if (!startPoint) {
      return null;
    }
    const dx = connectPreviewPoint.x - startPoint.x;
    const dy = connectPreviewPoint.y - startPoint.y;
    const guessedToSide: NodeAnchorSide =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? "left"
          : "right"
        : dy >= 0
          ? "top"
          : "bottom";
    return buildRoundedEdgePath(
      startPoint.x,
      startPoint.y,
      connectPreviewPoint.x,
      connectPreviewPoint.y,
      false,
      connectFromSide ?? "right",
      guessedToSide,
    );
  })();

  const selectedTurnConfig: TurnConfig | null =
    selectedNode?.type === "turn" ? (selectedNode.config as TurnConfig) : null;
  const selectedTurnExecutor: TurnExecutor =
    selectedTurnConfig ? getTurnExecutor(selectedTurnConfig) : "codex";
  const selectedQualityProfile: QualityProfileId =
    selectedNode?.type === "turn" && selectedTurnConfig
      ? inferQualityProfile(selectedNode, selectedTurnConfig)
      : "generic";
  const selectedQualityThresholdOption = String(
    normalizeQualityThreshold(selectedTurnConfig?.qualityThreshold ?? QUALITY_DEFAULT_THRESHOLD),
  );
  const selectedArtifactType: ArtifactType = toArtifactType(selectedTurnConfig?.artifactType);
  const outgoingFromSelected = selectedNode
    ? graph.edges
        .filter((edge) => edge.from.nodeId === selectedNode.id)
        .map((edge) => edge.to.nodeId)
        .filter((value, index, arr) => arr.indexOf(value) === index)
    : [];
  const outgoingNodeOptions = outgoingFromSelected.map((nodeId) => {
    const target = graph.nodes.find((node) => node.id === nodeId);
    return {
      value: nodeId,
      label: target ? nodeSelectionLabel(target) : "연결된 노드",
    };
  });
  const isActiveTab = (tab: WorkspaceTab): boolean => workspaceTab === tab;
  const isWorkflowBusy = isGraphRunning || isRunStarting;
  const canRunGraphNow = !isWorkflowBusy && graph.nodes.length > 0 && workflowQuestion.trim().length > 0;
  const liveFeedPosts: FeedViewPost[] = (() => {
    if (!activeFeedRunMeta) {
      return [];
    }
    const now = Date.now();
    const posts: FeedViewPost[] = [];
    for (const node of graph.nodes) {
      const runState = nodeStates[node.id];
      if (!runState) {
        continue;
      }
      if (!["queued", "running", "waiting_user"].includes(runState.status)) {
        continue;
      }

      const logs = runState.logs.slice(-60);
      const lastLog = logs[logs.length - 1] ?? "";
      const roleLabel = node.type === "turn" ? turnRoleLabel(node) : nodeTypeLabel(node.type);
      const agentName =
        node.type === "turn"
          ? turnModelLabel(node)
          : node.type === "transform"
            ? "데이터 변환"
            : "결정 분기";
      const summary =
        runState.status === "queued"
          ? "실행 대기 중입니다."
          : runState.status === "running"
            ? (lastLog || "에이전트가 작업 중입니다.")
            : "사용자 입력 또는 후속 작업을 기다리는 중입니다.";
      const liveText = logs.join("\n").trim() || summary;
      const clip = clipTextByChars(liveText);
      const masked = redactSensitiveText(clip.text);
      const startedAtMs = runState.startedAt ? new Date(runState.startedAt).getTime() : Number.NaN;
      const durationMs = Number.isNaN(startedAtMs) ? undefined : Math.max(0, now - startedAtMs);
      const executor = node.type === "turn" ? getTurnExecutor(node.config as TurnConfig) : undefined;

      posts.push({
        id: `${activeFeedRunMeta.runId}:${node.id}:draft`,
        runId: activeFeedRunMeta.runId,
        nodeId: node.id,
        nodeType: node.type,
        executor,
        agentName,
        roleLabel,
        status: "draft",
        createdAt: runState.startedAt ?? activeFeedRunMeta.startedAt,
        summary,
        steps: summarizeFeedSteps(logs),
        evidence: {
          durationMs,
          usage: runState.usage,
          qualityScore: runState.qualityReport?.score,
          qualityDecision: runState.qualityReport?.decision,
        },
        attachments: [
          {
            kind: "markdown",
            title: "실시간 작업 로그",
            content: masked,
            truncated: clip.truncated,
            charCount: clip.charCount,
          },
        ],
        redaction: {
          masked: true,
          ruleVersion: FEED_REDACTION_RULE_VERSION,
        },
        sourceFile: `run-${activeFeedRunMeta.runId}.json`,
        question: activeFeedRunMeta.question,
      });
    }
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return posts;
  })();
  const liveFeedNodeKeys = new Set(liveFeedPosts.map((post) => `${post.runId}:${post.nodeId}`));
  const mergedFeedPosts = [
    ...liveFeedPosts,
    ...feedPosts.filter((post) => !liveFeedNodeKeys.has(`${post.runId}:${post.nodeId}`)),
  ];
  const filteredFeedPosts = mergedFeedPosts
    .filter((post) => {
      if (feedStatusFilter !== "all" && post.status !== feedStatusFilter) {
        return false;
      }
      if (feedExecutorFilter !== "all") {
        const normalizedExecutor =
          post.executor === "codex"
            ? "codex"
            : post.executor === "ollama"
              ? "ollama"
              : post.executor
                ? "web"
                : "";
        if (normalizedExecutor !== feedExecutorFilter) {
          return false;
        }
      }
      if (feedPeriodFilter !== "all") {
        const createdAtMs = new Date(post.createdAt).getTime();
        const now = Date.now();
        if (Number.isNaN(createdAtMs)) {
          return false;
        }
        if (feedPeriodFilter === "today" && now - createdAtMs > 24 * 60 * 60 * 1000) {
          return false;
        }
        if (feedPeriodFilter === "7d" && now - createdAtMs > 7 * 24 * 60 * 60 * 1000) {
          return false;
        }
      }
      const keyword = feedKeyword.trim().toLowerCase();
      if (!keyword) {
        return true;
      }
      const haystack = `${post.question ?? ""} ${post.agentName} ${post.roleLabel} ${post.summary}`.toLowerCase();
      return haystack.includes(keyword);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const feedCategoryPosts: Record<FeedCategory, FeedViewPost[]> = {
    all_posts: filteredFeedPosts,
    completed_posts: filteredFeedPosts.filter((post) => post.status === "done"),
    web_posts: filteredFeedPosts.filter((post) =>
      String(post.executor ?? "").toLowerCase().startsWith("web_"),
    ),
    error_posts: filteredFeedPosts.filter(
      (post) => post.status === "failed" || post.status === "cancelled",
    ),
  };
  const currentFeedPosts = feedCategoryPosts[feedCategory] ?? filteredFeedPosts;
  const feedCategoryMeta: Array<{ key: FeedCategory; label: string }> = [
    { key: "all_posts", label: "전체포스트" },
    { key: "completed_posts", label: "완료 답변" },
    { key: "web_posts", label: "웹 리서치" },
    { key: "error_posts", label: "오류/취소" },
  ];
  const feedInspectorAgentPosts = currentFeedPosts
    .filter((post) => post.nodeType === "turn")
    .filter((post, index, rows) => rows.findIndex((row) => row.nodeId === post.nodeId) === index);
  const feedInspectorPost =
    currentFeedPosts.find((post) => post.id === feedInspectorPostId) ?? currentFeedPosts[0] ?? null;
  const feedInspectorPostKey = feedInspectorPost?.id ?? "";
  const feedInspectorPostNodeId = feedInspectorPost?.nodeId ?? "";
  const feedInspectorPostSourceFile = feedInspectorPost?.sourceFile ?? "";
  const feedInspectorGraphNode = feedInspectorPost
    ? graph.nodes.find((node) => node.id === feedInspectorPost.nodeId) ?? null
    : null;
  const feedInspectorNode = feedInspectorGraphNode ?? feedInspectorSnapshotNode;
  const feedInspectorTurnNode =
    feedInspectorNode?.type === "turn" ? (feedInspectorNode as GraphNode) : null;
  const feedInspectorTurnConfig: TurnConfig | null =
    feedInspectorTurnNode?.type === "turn" ? (feedInspectorTurnNode.config as TurnConfig) : null;
  const feedInspectorTurnExecutor: TurnExecutor =
    feedInspectorTurnConfig ? getTurnExecutor(feedInspectorTurnConfig) : "codex";
  const feedInspectorQualityProfile: QualityProfileId =
    feedInspectorTurnNode && feedInspectorTurnConfig
      ? inferQualityProfile(feedInspectorTurnNode, feedInspectorTurnConfig)
      : "generic";
  const feedInspectorQualityThresholdOption = String(
    normalizeQualityThreshold(feedInspectorTurnConfig?.qualityThreshold ?? QUALITY_DEFAULT_THRESHOLD),
  );
  const feedInspectorPromptTemplate = String(feedInspectorTurnConfig?.promptTemplate ?? "{{input}}");
  const feedInspectorRuleCwd = String(feedInspectorTurnConfig?.cwd ?? "").trim();
  const feedInspectorEditable =
    feedInspectorGraphNode !== null &&
    feedInspectorGraphNode.type === "turn" &&
    feedInspectorTurnNode !== null &&
    feedInspectorTurnNode.type === "turn";
  const feedInspectorEditableNodeId =
    feedInspectorEditable && feedInspectorTurnNode ? feedInspectorTurnNode.id : "";

  useEffect(() => {
    if (workspaceTab !== "feed") {
      return;
    }
    setFeedInspectorPostId((prev) => {
      if (currentFeedPosts.length === 0) {
        return "";
      }
      if (prev && currentFeedPosts.some((post) => post.id === prev)) {
        return prev;
      }
      return currentFeedPosts[0].id;
    });
  }, [currentFeedPosts, workspaceTab]);

  useEffect(() => {
    let cancelled = false;
    if (!feedInspectorPost) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }
    if (feedInspectorGraphNode) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }
    if (!feedInspectorPostSourceFile) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }

    const loadSnapshotNode = async () => {
      const run = await ensureFeedRunRecord(feedInspectorPostSourceFile);
      if (cancelled) {
        return;
      }
      const snapshotNode = run?.graphSnapshot.nodes.find((node) => node.id === feedInspectorPostNodeId) ?? null;
      setFeedInspectorSnapshotNode(snapshotNode);
    };
    void loadSnapshotNode();

    return () => {
      cancelled = true;
    };
  }, [feedInspectorGraphNode, feedInspectorPostKey, feedInspectorPostNodeId, feedInspectorPostSourceFile]);

  useEffect(() => {
    let cancelled = false;
    if (workspaceTab !== "feed" || !feedInspectorRuleCwd) {
      setFeedInspectorRuleDocs([]);
      setFeedInspectorRuleLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setFeedInspectorRuleLoading(true);
    const loadDocs = async () => {
      try {
        const docs = await loadAgentRuleDocs(feedInspectorRuleCwd);
        if (!cancelled) {
          setFeedInspectorRuleDocs(docs);
        }
      } finally {
        if (!cancelled) {
          setFeedInspectorRuleLoading(false);
        }
      }
    };
    void loadDocs();
    return () => {
      cancelled = true;
    };
  }, [feedInspectorRuleCwd, workspaceTab, feedInspectorPostKey]);

  const viewportWidth = Math.ceil(canvasLogicalViewport.width);
  const viewportHeight = Math.ceil(canvasLogicalViewport.height);
  const stagePadding = canvasNodes.length > 0 ? STAGE_GROW_MARGIN : 0;
  const maxNodeRight = canvasNodes.reduce((max, node) => Math.max(max, node.position.x + NODE_WIDTH), 0);
  const maxNodeBottom = canvasNodes.reduce((max, node) => Math.max(max, node.position.y + NODE_HEIGHT), 0);
  const softMaxWidth = viewportWidth + STAGE_GROW_LIMIT;
  const softMaxHeight = viewportHeight + STAGE_GROW_LIMIT;
  const stageWidth = Math.max(
    viewportWidth,
    Math.min(softMaxWidth, Math.max(viewportWidth, maxNodeRight + stagePadding)),
  );
  const stageHeight = Math.max(
    viewportHeight,
    Math.min(softMaxHeight, Math.max(viewportHeight, maxNodeBottom + stagePadding)),
  );
  const boundedStageWidth = Math.min(stageWidth, MAX_STAGE_WIDTH);
  const boundedStageHeight = Math.min(stageHeight, MAX_STAGE_HEIGHT);
  return (
    <main className={`app-shell ${canvasFullscreen ? "canvas-fullscreen-mode" : ""}`}>
      <aside className="left-nav">
        <nav
          className="nav-list"
          style={{
            // alignContent: "center",
            height: "100%",
            display: "grid",
          }}
        >
          <button
            className={isActiveTab("workflow") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("workflow")}
            aria-label="워크플로우"
            title="워크플로우"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="workflow" active={isActiveTab("workflow")} /></span>
            <span className="nav-label">워크</span>
          </button>
          <button
            className={isActiveTab("feed") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("feed")}
            aria-label="피드"
            title="피드"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="feed" active={isActiveTab("feed")} /></span>
            <span className="nav-label">피드</span>
          </button>
          <button
            className={isActiveTab("history") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("history")}
            aria-label="기록"
            title="기록"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="history" active={isActiveTab("history")} /></span>
            <span className="nav-label">기록</span>
          </button>
          <button
            className={isActiveTab("settings") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("settings")}
            aria-label="설정"
            title="설정"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="settings" active={isActiveTab("settings")} /></span>
            <span className="nav-label">설정</span>
          </button>
          <button
            className={isActiveTab("bridge") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("bridge")}
            aria-label="브리지"
            title="브리지"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="bridge" active={isActiveTab("bridge")} /></span>
            <span className="nav-label">브리지</span>
          </button>
        </nav>
      </aside>

      <section className={`workspace ${canvasFullscreen ? "canvas-fullscreen-active" : ""}`}>
        {!canvasFullscreen && <header className="workspace-header workspace-header-spacer" />}

        {error && (
          <div className="error">
            <span>오류: {error}</span>
            <button
              aria-label="오류 닫기"
              className="error-close"
              onClick={() => setError("")}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {workspaceTab === "workflow" && (
          <div className={`workflow-layout workspace-tab-panel ${canvasFullscreen ? "canvas-only-layout" : ""}`}>
            <section className="canvas-pane">
              <div className="graph-canvas-shell">
                <div
                  className={`graph-canvas ${panMode ? "pan-mode" : ""}`}
                  onKeyDown={onCanvasKeyDown}
                  onMouseDown={onCanvasMouseDown}
                  onMouseMove={onCanvasMouseMove}
                  onMouseUp={onCanvasMouseUp}
                  onWheel={onCanvasWheel}
                  ref={graphCanvasRef}
                  tabIndex={-1}
                >
                <div
                  className="graph-stage-shell"
                  style={{
                    width: Math.round(boundedStageWidth * canvasZoom + GRAPH_STAGE_INSET_X * 2),
                    height: Math.round(boundedStageHeight * canvasZoom + GRAPH_STAGE_INSET_Y * 2),
                  }}
                >
                  <div
                    className="graph-stage"
                    style={{
                      left: GRAPH_STAGE_INSET_X,
                      top: GRAPH_STAGE_INSET_Y,
                      transform: `scale(${canvasZoom})`,
                      width: boundedStageWidth,
                      height: boundedStageHeight,
                    }}
                  >
                    <svg className="edge-layer">
                      <defs>
                        <marker
                          id="edge-arrow"
                          markerHeight="7"
                          markerUnits="userSpaceOnUse"
                          markerWidth="7"
                          orient="auto"
                          refX="6"
                          refY="3.5"
                        >
                          <path d="M0 0 L7 3.5 L0 7 Z" fill="#70848a" />
                        </marker>
                        <marker
                          id="edge-arrow-readonly"
                          markerHeight="7"
                          markerUnits="userSpaceOnUse"
                          markerWidth="7"
                          orient="auto"
                          refX="6"
                          refY="3.5"
                        >
                          <path d="M0 0 L7 3.5 L0 7 Z" fill="#c07a2f" />
                        </marker>
                      </defs>
                      {edgeLines.map((line) => (
                        <g key={line.key}>
                          {!line.readOnly && (
                            <path
                              className="edge-path-hit"
                              d={line.path}
                              fill="none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNodeSelection([]);
                                setSelectedEdgeKey(line.edgeKey);
                              }}
                              onMouseDown={(e) => onEdgeDragStart(e, line.edgeKey, line.controlPoint)}
                              pointerEvents="stroke"
                              stroke="transparent"
                              strokeWidth={(selectedEdgeKey === line.edgeKey ? 3 : 2) + 2}
                            />
                          )}
                          <path
                            className={`${selectedEdgeKey === line.edgeKey ? "edge-path selected" : "edge-path"} ${
                              line.readOnly ? "readonly" : ""
                            }`.trim()}
                            d={line.path}
                            fill="none"
                            markerEnd={line.readOnly ? "url(#edge-arrow-readonly)" : "url(#edge-arrow)"}
                            pointerEvents="none"
                            stroke={line.readOnly ? "#c07a2f" : selectedEdgeKey === line.edgeKey ? "#4f83ff" : "#4f6271"}
                            strokeDasharray={line.readOnly ? "7 4" : undefined}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            strokeWidth={selectedEdgeKey === line.edgeKey ? 3 : 2}
                          />
                          {!line.readOnly && selectedEdgeKey === line.edgeKey && (
                            <circle
                              className="edge-control-point"
                              cx={line.controlPoint.x}
                              cy={line.controlPoint.y}
                              fill="#ffffff"
                              r={5}
                              stroke="#4f83ff"
                              strokeWidth={1.4}
                            />
                          )}
                        </g>
                      ))}
                      {connectPreviewLine && (
                        <path
                          d={connectPreviewLine}
                          fill="none"
                          pointerEvents="none"
                          stroke="#5b8cff"
                          strokeDasharray="5 4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      )}
                    </svg>

                    {canvasNodes.map((node) => {
                      const runState = nodeStates[node.id];
                      const nodeStatus = runState?.status ?? "idle";
                      const nodeSummary = nodeCardSummary(node);
                      const isNodeSelected = selectedNodeIds.includes(node.id);
                      const isNodeDragging = draggingNodeIds.includes(node.id);
                      const showNodeAnchors = isNodeSelected || isConnectingDrag;
                      const receivesQuestionDirectly = questionDirectInputNodeIds.has(node.id);
                      return (
                        <div
                          className={`graph-node node-${node.type} ${isNodeSelected ? "selected" : ""} ${
                            isNodeDragging ? "is-dragging" : ""
                          }`.trim()}
                          data-node-id={node.id}
                          key={node.id}
                          onClick={(event) => {
                            if (event.shiftKey) {
                              const toggled = selectedNodeIds.includes(node.id)
                                ? selectedNodeIds.filter((id) => id !== node.id)
                                : [...selectedNodeIds, node.id];
                              setNodeSelection(toggled, node.id);
                            } else {
                              setNodeSelection([node.id], node.id);
                            }
                            setSelectedEdgeKey("");
                          }}
                          onMouseUp={(e) => {
                            if (!isConnectingDrag) {
                              return;
                            }
                            e.stopPropagation();
                            onNodeConnectDrop(node.id);
                          }}
                          onMouseDown={(event) => {
                            if (!isNodeDragAllowedTarget(event.target)) {
                              return;
                            }
                            if (event.button !== 0 || isConnectingDrag) {
                              return;
                            }
                            onNodeDragStart(event, node.id);
                          }}
                          style={{
                            left: node.position.x,
                            top: node.position.y,
                            transition: isNodeDragging
                              ? "none"
                              : "left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        >
                          <div className="node-head">
                            <div className="node-head-main">
                              {node.type === "turn" ? (
                                <>
                                  <div className="node-head-title-row">
                                    <strong>{turnModelLabel(node)}</strong>
                                  </div>
                                  <span className="node-head-subtitle">{turnRoleLabel(node)}</span>
                                </>
                              ) : (
                                <div className="node-head-title-row">
                                  <strong className={node.type === "gate" ? "gate-node-title" : undefined}>
                                    {nodeTypeLabel(node.type)}
                                  </strong>
                                </div>
                              )}
                            </div>
                            <button onClick={() => deleteNode(node.id)} type="button">
                              삭제
                            </button>
                          </div>
                          <div className="node-body">
                            {nodeSummary ? (
                              <div className="node-summary-row">
                                <div>{nodeSummary}</div>
                              </div>
                            ) : null}
                            <div className="node-runtime-meta">
                              <div>
                                완료 여부:{" "}
                                {nodeStatus === "done"
                                  ? "완료"
                                  : nodeStatus === "failed"
                                    ? "오류"
                                    : nodeStatus === "cancelled"
                                      ? "정지"
                                      : "대기"}
                              </div>
                              <div>생성 시간: {formatNodeElapsedTime(runState, runtimeNowMs)}</div>
                              <div>사용량: {formatUsage(runState?.usage)}</div>
                            </div>
                            <button
                              className="node-feed-link"
                              onClick={() => onOpenFeedFromNode(node.id)}
                              type="button"
                            >
                              출력/로그는 피드에서 보기
                            </button>
                          </div>
                          <div className="node-wait-slot">
                            <span className={`status-pill status-${nodeStatus}`}>{nodeStatusLabel(nodeStatus)}</span>
                            {receivesQuestionDirectly && (
                              <span className="node-input-chip">
                                <span className="node-input-chip-text">질문 직접 입력</span>
                              </span>
                            )}
                          </div>
                          {showNodeAnchors && (
                            <div className="node-anchors">
                              {NODE_ANCHOR_SIDES.map((side) => (
                                <button
                                  aria-label={`연결 ${side}`}
                                  className={`node-anchor node-anchor-${side}`}
                                  key={`${node.id}-${side}`}
                                  onMouseDown={(e) => onNodeAnchorDragStart(e, node.id, side)}
                                  onMouseUp={(e) => onNodeAnchorDrop(e, node.id, side)}
                                  type="button"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {marqueeSelection && (
                      <div
                        className="marquee-selection"
                        style={{
                          left: Math.min(marqueeSelection.start.x, marqueeSelection.current.x),
                          top: Math.min(marqueeSelection.start.y, marqueeSelection.current.y),
                          width: Math.abs(marqueeSelection.current.x - marqueeSelection.start.x),
                          height: Math.abs(marqueeSelection.current.y - marqueeSelection.start.y),
                        }}
                      />
                    )}
                  </div>
                </div>
                </div>

                <div className="canvas-overlay">
                  <div className="canvas-zoom-controls">
                    <div className="canvas-zoom-group">
                      <button onClick={onCanvasZoomIn} title="확대" type="button">
                        <img alt="" aria-hidden="true" className="canvas-control-icon" src="/plus.svg" />
                      </button>
                      <button onClick={onCanvasZoomOut} title="축소" type="button">
                        <img alt="" aria-hidden="true" className="canvas-control-icon" src="/minus.svg" />
                      </button>
                    </div>
                    <button
                      className="canvas-zoom-single"
                      onClick={() => setCanvasFullscreen((prev) => !prev)}
                      title={canvasFullscreen ? "캔버스 기본 보기" : "캔버스 전체 보기"}
                      type="button"
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        className="canvas-control-icon"
                        src="/canvas-fullscreen.svg"
                      />
                    </button>
                    <button
                      aria-label="이동"
                      className={`canvas-zoom-single ${panMode ? "is-active" : ""}`}
                      onClick={() => setPanMode((prev) => !prev)}
                      title="캔버스 이동"
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="canvas-control-icon" src="/scroll.svg" />
                    </button>
                  </div>

                  <div className="canvas-runbar">
                    <button
                      aria-label="실행"
                      className={`canvas-icon-btn play ${canRunGraphNow ? "is-ready" : "is-disabled"}`}
                      disabled={!canRunGraphNow}
                      onClick={onRunGraph}
                      title="실행"
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-play.svg" />
                    </button>
                    <button
                      aria-label="중지"
                      className="canvas-icon-btn stop"
                      disabled={!isGraphRunning}
                      onClick={onCancelGraphRun}
                      title="중지"
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-stop.svg" />
                    </button>
                    <button
                      aria-label="되돌리기"
                      className="canvas-icon-btn"
                      disabled={undoStack.length === 0}
                      onClick={onUndoGraph}
                      title="되돌리기"
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-undo.svg" />
                    </button>
                    <button
                      aria-label="다시하기"
                      className="canvas-icon-btn"
                      disabled={redoStack.length === 0}
                      onClick={onRedoGraph}
                      title="다시하기"
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-replay.svg" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="canvas-topbar">
                <div className="question-input">
                  <textarea
                    disabled={isWorkflowBusy}
                    onChange={(e) => {
                      setWorkflowQuestion(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!canRunGraphNow) {
                          return;
                        }
                        void onRunGraph();
                      }
                    }}
                    placeholder="질문 입력"
                    ref={questionInputRef}
                    rows={1}
                    value={workflowQuestion}
                  />
                  <div className="question-input-footer">
                    <button
                      className="primary-action question-create-button"
                      disabled={!canRunGraphNow}
                      onClick={onRunGraph}
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className="question-create-icon" src="/up.svg" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {!canvasFullscreen && <aside className="inspector-pane">
              <div className="inspector-head">
                <div className="inspector-title-chip">노드 설정</div>
              </div>
              <div className="inspector-content">
                <div className="inspector-section">
                  <section className="inspector-block">
                    <InspectorSectionTitle
                      help="노드 추가, 템플릿 불러오기, 비용 프리셋 적용, 그래프 저장/불러오기를 관리합니다."
                      title="그래프 도구"
                    />
                    <div className="tool-dropdown-group">
                      <h4>노드 선택</h4>
                      <FancySelect
                        ariaLabel="노드 선택"
                        className="modern-select"
                        emptyMessage="선택 가능한 노드가 없습니다."
                        onChange={(value) => {
                          if (value === "turn") {
                            addNode("turn");
                          } else if (!SIMPLE_WORKFLOW_UI && value === "transform") {
                            addNode("transform");
                          } else if (!SIMPLE_WORKFLOW_UI && value === "gate") {
                            addNode("gate");
                          }
                        }}
                        options={
                          SIMPLE_WORKFLOW_UI
                            ? [{ value: "turn", label: "응답 에이전트" }]
                            : [
                                { value: "turn", label: "응답 에이전트" },
                                { value: "transform", label: "데이터 변환" },
                                { value: "gate", label: "분기" },
                              ]
                        }
                        placeholder="노드 선택"
                        value=""
                      />
                    </div>

                    <div className="tool-dropdown-group">
                      <h4>템플릿</h4>
                      <FancySelect
                        ariaLabel="템플릿 선택"
                        className="modern-select template-select"
                        emptyMessage="선택 가능한 템플릿이 없습니다."
                        onChange={(value) => {
                          if (isPresetKind(value)) {
                            applyPreset(value);
                          }
                        }}
                        options={PRESET_TEMPLATE_OPTIONS}
                        placeholder="템플릿 선택"
                        value=""
                      />
                    </div>

                    <div className="tool-dropdown-group">
                      <h4>비용 프리셋</h4>
                      <FancySelect
                        ariaLabel="비용 프리셋"
                        className="modern-select"
                        emptyMessage="선택 가능한 프리셋이 없습니다."
                        onChange={(value) => {
                          if (isCostPreset(value)) {
                            applyCostPreset(value);
                          }
                        }}
                        options={COST_PRESET_OPTIONS}
                        value={costPreset}
                      />
                    </div>

                    <div className="tool-dropdown-group">
                      <h4>그래프 파일</h4>
                      <FancySelect
                        ariaLabel="그래프 파일 선택"
                        className="graph-file-select modern-select"
                        emptyMessage="저장된 그래프가 없습니다."
                        onChange={(value) => {
                          if (value) {
                            setSelectedGraphFileName(value);
                            setGraphFileName(value);
                            loadGraph(value);
                          }
                        }}
                        options={graphFiles.map((file) => ({ value: file, label: file }))}
                        placeholder="그래프 파일 선택"
                        value={graphFiles.includes(selectedGraphFileName) ? selectedGraphFileName : ""}
                      />
                      <div className="graph-file-actions">
                        <button className="mini-action-button" onClick={saveGraph} type="button">
                          <span className="mini-action-button-label">저장</span>
                        </button>
                        <button className="mini-action-button" onClick={onOpenRenameGraph} type="button">
                          <span className="mini-action-button-label">이름 변경</span>
                        </button>
                        <button className="mini-action-button" onClick={deleteGraph} type="button">
                          <span className="mini-action-button-label">삭제</span>
                        </button>
                        <button className="mini-action-button" onClick={refreshGraphFiles} type="button">
                          <span className="mini-action-button-label">새로고침</span>
                        </button>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateRows: graphRenameOpen ? "1fr" : "0fr",
                          opacity: graphRenameOpen ? 1 : 0,
                          transform: graphRenameOpen ? "translateY(0)" : "translateY(-4px)",
                          transition:
                            "grid-template-rows 180ms ease, opacity 180ms ease, transform 180ms ease, margin-top 180ms ease",
                          marginTop: graphRenameOpen ? "6px" : "0",
                          pointerEvents: graphRenameOpen ? "auto" : "none",
                        }}
                      >
                        <div style={{ minHeight: 0, overflow: "hidden", display: "grid", gap: "6px" }}>
                          <input
                            onChange={(event) => setGraphRenameDraft(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void renameGraph();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                onCloseRenameGraph();
                              }
                            }}
                            placeholder="이름 변경 파일명"
                            style={{
                              height: "36px",
                              minHeight: "36px",
                              maxHeight: "36px",
                              borderRadius: "6px",
                              padding: "0 12px",
                            }}
                            value={graphRenameDraft}
                          />
                          <div className="graph-file-actions">
                            <button className="mini-action-button" onClick={() => void renameGraph()} type="button">
                              <span className="mini-action-button-label">변경 적용</span>
                            </button>
                            <button className="mini-action-button" onClick={onCloseRenameGraph} type="button">
                              <span className="mini-action-button-label">취소</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="tool-dropdown-group">
                      <h4>첨부 자료</h4>
                      <div className="graph-file-actions">
                        <button className="mini-action-button" onClick={onOpenKnowledgeFilePicker} type="button">
                          <span className="mini-action-button-label">파일 추가</span>
                        </button>
                      </div>
                      <div className="knowledge-file-list">
                        {graphKnowledge.files.length === 0 && (
                          <div className="knowledge-file-empty">첨부된 자료가 없습니다.</div>
                        )}
                        {graphKnowledge.files.map((file) => {
                          const statusMeta = knowledgeStatusMeta(file.status);
                          return (
                            <div className="knowledge-file-item" key={file.id}>
                              <div className="knowledge-file-main">
                                <span className="knowledge-file-name" title={file.path}>
                                  {file.name}
                                </span>
                                <span className={`knowledge-status-pill ${statusMeta.tone}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <div className="knowledge-file-actions">
                                <button
                                  className={`mini-action-button ${file.enabled ? "is-enabled" : ""}`}
                                  onClick={() => onToggleKnowledgeFileEnabled(file.id)}
                                  type="button"
                                >
                                  <span className="mini-action-button-label">
                                    {file.enabled ? "사용 중" : "제외"}
                                  </span>
                                </button>
                                <button
                                  className="mini-action-button"
                                  onClick={() => onRemoveKnowledgeFile(file.id)}
                                  type="button"
                                >
                                  <span className="mini-action-button-label">삭제</span>
                                </button>
                              </div>
                              {file.statusMessage && <div className="knowledge-file-message">{file.statusMessage}</div>}
                            </div>
                          );
                        })}
                      </div>
                      <label>
                        참고할 자료 개수
                        <FancySelect
                          ariaLabel="참고할 자료 개수"
                          className="modern-select"
                              onChange={(next) => {
                                const parsed = Number(next) || KNOWLEDGE_DEFAULT_TOP_K;
                                applyGraphChange((prev) => ({
                                  ...prev,
                                  knowledge: {
                                    ...(prev.knowledge ?? defaultKnowledgeConfig()),
                                    topK: Math.max(0, Math.min(5, parsed)),
                                  },
                                }));
                              }}
                          options={KNOWLEDGE_TOP_K_OPTIONS}
                          value={String(graphKnowledge.topK)}
                        />
                      </label>
                      <div className="inspector-empty">
                        질문과 가장 관련 있는 참고 자료를 몇 개까지 붙일지 정합니다.
                      </div>
                      <label>
                        참고 내용 길이
                        <FancySelect
                          ariaLabel="참고 내용 길이"
                          className="modern-select"
                          onChange={(next) => {
                            const parsed = Number(next) || KNOWLEDGE_DEFAULT_MAX_CHARS;
                            applyGraphChange((prev) => ({
                              ...prev,
                              knowledge: {
                                ...(prev.knowledge ?? defaultKnowledgeConfig()),
                                maxChars: Math.max(300, Math.min(20_000, parsed)),
                              },
                            }));
                          }}
                          options={KNOWLEDGE_MAX_CHARS_OPTIONS}
                          value={selectedKnowledgeMaxCharsOption}
                        />
                      </label>
                      <div className="inspector-empty">
                        길이를 길게 할수록 근거는 늘고, 응답 속도와 사용량은 증가할 수 있습니다.
                      </div>
                    </div>
                  </section>

                  {/* {!selectedNode && <div className="inspector-empty">노드를 선택하세요.</div>} */}
                  {selectedNode && (
                    <>
                      {selectedNode.type === "turn" && (
                        <section className="inspector-block form-grid">
                          <InspectorSectionTitle
                            help="실행기, 모델, 역할, 프롬프트를 설정해 해당 에이전트의 동작을 정의합니다."
                            title="에이전트 설정"
                          />
                          <label>
                            에이전트
                            <FancySelect
                              ariaLabel="Turn 에이전트"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("executor", next)}
                              options={TURN_EXECUTOR_OPTIONS.map((option) => ({
                                value: option,
                                label: turnExecutorLabel(option),
                              }))}
                              value={selectedTurnExecutor}
                            />
                          </label>
                          {selectedTurnExecutor === "codex" && (
                            <label>
                              모델
                              <FancySelect
                                ariaLabel="노드 모델"
                                className="modern-select"
                                onChange={(next) => updateSelectedNodeConfig("model", next)}
                                options={TURN_MODEL_OPTIONS.map((option) => ({ value: option, label: option }))}
                                value={toTurnModelDisplayName(
                                  String((selectedNode.config as TurnConfig).model ?? model),
                                )}
                              />
                            </label>
                          )}
                          {selectedTurnExecutor === "ollama" && (
                            <label>
                              Ollama 모델
                              <input
                                onChange={(e) => updateSelectedNodeConfig("ollamaModel", e.currentTarget.value)}
                                placeholder="예: llama3.1:8b"
                                value={String((selectedNode.config as TurnConfig).ollamaModel ?? "llama3.1:8b")}
                              />
                            </label>
                          )}
                          {selectedTurnExecutor === "codex" && (
                            <label>
                              작업 경로
                              <input
                                className="lowercase-path-input"
                                onChange={(e) => updateSelectedNodeConfig("cwd", e.currentTarget.value)}
                                value={String((selectedNode.config as TurnConfig).cwd ?? cwd)}
                              />
                            </label>
                          )}
                          {getWebProviderFromExecutor(selectedTurnExecutor) && (
                            <>
                              <label>
                                웹 결과 모드
                                <FancySelect
                                  ariaLabel="웹 결과 모드"
                                  className="modern-select"
                                  onChange={(next) => updateSelectedNodeConfig("webResultMode", next)}
                                  options={[
                                    { value: "bridgeAssisted", label: "브리지 반자동 (권장)" },
                                    { value: "manualPasteText", label: "텍스트 붙여넣기" },
                                    { value: "manualPasteJson", label: "JSON 붙여넣기" },
                                  ]}
                                  value={String(
                                    normalizeWebResultMode((selectedNode.config as TurnConfig).webResultMode),
                                  )}
                                />
                              </label>
                              <label>
                                자동화 타임아웃(ms)
                                <input
                                  onChange={(e) =>
                                    updateSelectedNodeConfig(
                                      "webTimeoutMs",
                                      Number(e.currentTarget.value) || 90_000,
                                    )
                                  }
                                  type="number"
                                  value={String((selectedNode.config as TurnConfig).webTimeoutMs ?? 90_000)}
                                />
                              </label>
                              <div className="inspector-empty">
                                브리지 반자동은 질문 자동 주입/답변 자동 수집을 시도하고, 실패 시 수동 입력으로 폴백합니다.
                              </div>
                            </>
                          )}
                          <label>
                            역할
                            <input
                              onChange={(e) => updateSelectedNodeConfig("role", e.currentTarget.value)}
                              placeholder={turnRoleLabel(selectedNode)}
                              value={String((selectedNode.config as TurnConfig).role ?? "")}
                            />
                          </label>
                          <label>
                            첨부 참고 사용
                            <FancySelect
                              ariaLabel="첨부 참고 사용"
                              className="modern-select"
                              onChange={(next) =>
                                updateSelectedNodeConfig("knowledgeEnabled", next === "true")
                              }
                              options={[
                                { value: "true", label: "사용" },
                                { value: "false", label: "미사용" },
                              ]}
                              value={String(
                                (selectedNode.config as TurnConfig).knowledgeEnabled !== false,
                              )}
                            />
                          </label>
                          <label>
                            품질 프로필
                            <FancySelect
                              ariaLabel="품질 프로필"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("qualityProfile", next)}
                              options={QUALITY_PROFILE_OPTIONS}
                              value={selectedQualityProfile}
                            />
                          </label>
                          <label>
                            품질 통과 기준 점수
                            <FancySelect
                              ariaLabel="품질 통과 기준 점수"
                              className="modern-select"
                                onChange={(next) =>
                                  updateSelectedNodeConfig(
                                    "qualityThreshold",
                                    normalizeQualityThreshold(next),
                                  )
                                }
                              options={QUALITY_THRESHOLD_OPTIONS}
                              value={selectedQualityThresholdOption}
                            />
                          </label>
                          {selectedQualityProfile === "code_implementation" && (
                            <>
                              <label>
                                로컬 품질 명령 실행
                                <FancySelect
                                  ariaLabel="로컬 품질 명령 실행"
                                  className="modern-select"
                                  onChange={(next) =>
                                    updateSelectedNodeConfig("qualityCommandEnabled", next === "true")
                                  }
                                  options={[
                                    { value: "false", label: "미사용" },
                                    { value: "true", label: "사용" },
                                  ]}
                                  value={String(selectedTurnConfig?.qualityCommandEnabled === true)}
                                />
                              </label>
                              <label>
                                품질 명령 목록(줄바꿈 구분)
                                <textarea
                                  className="prompt-template-textarea"
                                  onChange={(e) =>
                                    updateSelectedNodeConfig("qualityCommands", e.currentTarget.value)
                                  }
                                  rows={3}
                                  value={String(selectedTurnConfig?.qualityCommands ?? "npm run build")}
                                />
                              </label>
                            </>
                          )}
                          {!SIMPLE_WORKFLOW_UI && (
                            <label>
                              출력 형식(아티팩트)
                              <FancySelect
                                ariaLabel="출력 형식(아티팩트)"
                                className="modern-select"
                                onChange={(next) => updateSelectedNodeConfig("artifactType", next)}
                                options={ARTIFACT_TYPE_OPTIONS}
                                value={selectedArtifactType}
                              />
                            </label>
                          )}
                          <label>
                            프롬프트 템플릿
                            <textarea
                              className="prompt-template-textarea"
                              onChange={(e) =>
                                updateSelectedNodeConfig("promptTemplate", e.currentTarget.value)
                              }
                              rows={6}
                              value={String((selectedNode.config as TurnConfig).promptTemplate ?? "{{input}}")}
                            />
                          </label>
                        </section>
                      )}

                      {!SIMPLE_WORKFLOW_UI && selectedNode.type === "transform" && (
                        <section className="inspector-block form-grid">
                          <InspectorSectionTitle
                            help="앞 노드 결과를 읽기 쉬운 형태로 다시 정리하는 설정입니다. 쉽게 말해, 필요한 것만 꺼내거나, 고정 정보를 붙이거나, 문장 틀에 맞춰 다시 쓰는 역할입니다."
                            title="결과 정리 설정"
                          />
                          <label>
                            정리 방식
                            <FancySelect
                              ariaLabel="정리 방식"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("mode", next)}
                              options={[
                                { value: "pick", label: "필요한 값만 꺼내기" },
                                { value: "merge", label: "고정 정보 덧붙이기" },
                                { value: "template", label: "문장 틀로 다시 쓰기" },
                              ]}
                              value={String((selectedNode.config as TransformConfig).mode ?? "pick")}
                            />
                          </label>
                          <label>
                            꺼낼 값 위치
                            <input
                              onChange={(e) => updateSelectedNodeConfig("pickPath", e.currentTarget.value)}
                              placeholder="예: text 또는 result.finalDraft"
                              value={String((selectedNode.config as TransformConfig).pickPath ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            예를 들어 `text`를 쓰면 결과에서 text 부분만 가져옵니다.
                          </div>
                          <label>
                            덧붙일 고정 정보(JSON)
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("mergeJson", e.currentTarget.value)}
                              placeholder='예: {"source":"web","priority":"high"}'
                              rows={3}
                              value={String((selectedNode.config as TransformConfig).mergeJson ?? "{}")}
                            />
                          </label>
                          <div className="inspector-empty">
                            예: {"`{\"출처\":\"웹조사\"}`"}를 넣으면 모든 결과에 같은 정보를 붙입니다.
                          </div>
                          <label>
                            문장 틀
                            <textarea
                              className="transform-template-textarea"
                              onChange={(e) => updateSelectedNodeConfig("template", e.currentTarget.value)}
                              rows={5}
                              value={String((selectedNode.config as TransformConfig).template ?? "{{input}}")}
                            />
                          </label>
                          <div className="inspector-empty">
                            {"`{{input}}`"} 자리에 이전 결과가 들어갑니다. 원하는 문장 형태로 바꿀 때 사용합니다.
                          </div>
                        </section>
                      )}

                      {!SIMPLE_WORKFLOW_UI && selectedNode.type === "gate" && (
                        <section className="inspector-block form-grid">
                          <InspectorSectionTitle
                            help="이 노드는 결과를 보고 길을 나눕니다. DECISION 값이 PASS면 통과 경로로, REJECT면 재검토 경로로 보냅니다."
                            title="결정 나누기 설정"
                          />
                          <label>
                            판단값 위치(DECISION)
                            <input
                              onChange={(e) => updateSelectedNodeConfig("decisionPath", e.currentTarget.value)}
                              value={String((selectedNode.config as GateConfig).decisionPath ?? "DECISION")}
                            />
                          </label>
                          <div className="inspector-empty">
                            보통 `DECISION`을 사용합니다. 값은 PASS 또는 REJECT(대문자)여야 합니다.
                          </div>
                          <label>
                            통과(PASS) 다음 노드
                            <FancySelect
                              ariaLabel="통과 다음 노드"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("passNodeId", next)}
                              options={[
                                { value: "", label: "(없음)" },
                                ...outgoingNodeOptions,
                              ]}
                              value={String((selectedNode.config as GateConfig).passNodeId ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            결과가 좋으면(통과) 어디로 보낼지 선택합니다.
                          </div>
                          <label>
                            재검토(REJECT) 다음 노드
                            <FancySelect
                              ariaLabel="재검토 다음 노드"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("rejectNodeId", next)}
                              options={[
                                { value: "", label: "(없음)" },
                                ...outgoingNodeOptions,
                              ]}
                              value={String((selectedNode.config as GateConfig).rejectNodeId ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            결과가 부족하면(재검토) 어디로 보낼지 선택합니다.
                          </div>
                          <label>
                            결과 형식 검사(선택)
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("schemaJson", e.currentTarget.value)}
                              rows={4}
                              value={String((selectedNode.config as GateConfig).schemaJson ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            고급 옵션입니다. 결과가 원하는 형식인지 자동 검사할 때만 사용하세요.
                          </div>
                        </section>
                      )}
                      {SIMPLE_WORKFLOW_UI && selectedNode.type !== "turn" && (
                        <section className="inspector-block form-grid">
                          <InspectorSectionTitle
                            help="이 노드는 시스템이 내부적으로 사용하는 자동 처리 노드입니다."
                            title="내부 처리 노드"
                          />
                          <div className="inspector-empty">
                            단순 모드에서는 이 노드 설정을 직접 편집하지 않습니다.
                          </div>
                        </section>
                      )}

                    </>
                  )}

                </div>
              </div>
            </aside>}
          </div>
        )}

        {workspaceTab === "feed" && (
          <section className="feed-layout workspace-tab-panel">
            <article className="panel-card feed-agent-panel">
              <div className="feed-agent-panel-head">
                <h3>에이전트 상세설정</h3>
                {/* <span>{feedInspectorAgentPosts.length}개</span> */}
              </div>
              {feedInspectorAgentPosts.length === 0 && (
                <div className="inspector-empty">표시할 에이전트 포스트가 없습니다.</div>
              )}
              {feedInspectorAgentPosts.length > 0 && (
                <div className="feed-agent-list">
                  {feedInspectorAgentPosts.map((post) => (
                    <button
                      className={feedInspectorPost?.id === post.id ? "is-active" : ""}
                      key={`${post.nodeId}:${post.id}`}
                      onClick={() => onSelectFeedInspectorPost(post)}
                      type="button"
                    >
                      <span className="feed-agent-list-name">{post.agentName}</span>
                      <span className="feed-agent-list-sub">{post.roleLabel}</span>
                    </button>
                  ))}
                </div>
              )}
              {feedInspectorTurnNode && (
                <section className="feed-agent-settings">
                  <div className="feed-agent-settings-header">
                    <strong>{feedInspectorPost?.agentName ?? turnModelLabel(feedInspectorTurnNode)}</strong>
                    {!feedInspectorEditable && <span className="feed-agent-readonly-badge">기록 스냅샷</span>}
                  </div>
                  <div className="feed-agent-settings-grid">
                    <label>
                      에이전트
                      <FancySelect
                        ariaLabel="피드 에이전트 실행기"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "executor", next);
                        }}
                        options={TURN_EXECUTOR_OPTIONS.map((option) => ({
                          value: option,
                          label: turnExecutorLabel(option),
                        }))}
                        value={feedInspectorTurnExecutor}
                      />
                    </label>
                    {feedInspectorTurnExecutor === "codex" && (
                      <label>
                        모델
                        <FancySelect
                          ariaLabel="피드 에이전트 모델"
                          className="modern-select"
                          disabled={!feedInspectorEditable}
                          onChange={(next) => {
                            if (!feedInspectorEditableNodeId) {
                              return;
                            }
                            updateNodeConfigById(feedInspectorEditableNodeId, "model", next);
                          }}
                          options={TURN_MODEL_OPTIONS.map((option) => ({ value: option, label: option }))}
                          value={toTurnModelDisplayName(
                            String(feedInspectorTurnConfig?.model ?? DEFAULT_TURN_MODEL),
                          )}
                        />
                      </label>
                    )}
                    {feedInspectorTurnExecutor === "ollama" && (
                      <label>
                        Ollama 모델
                        <input
                          disabled={!feedInspectorEditable}
                          onChange={(event) => {
                            if (!feedInspectorEditableNodeId) {
                              return;
                            }
                            updateNodeConfigById(
                              feedInspectorEditableNodeId,
                              "ollamaModel",
                              event.currentTarget.value,
                            );
                          }}
                          placeholder="예: llama3.1:8b"
                          value={String(feedInspectorTurnConfig?.ollamaModel ?? "llama3.1:8b")}
                        />
                      </label>
                    )}
                    {getWebProviderFromExecutor(feedInspectorTurnExecutor) && (
                      <>
                        <label>
                          웹 결과 모드
                          <FancySelect
                            ariaLabel="피드 에이전트 웹 결과 모드"
                            className="modern-select"
                            disabled={!feedInspectorEditable}
                            onChange={(next) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(feedInspectorEditableNodeId, "webResultMode", next);
                            }}
                            options={[
                              { value: "bridgeAssisted", label: "브리지 반자동 (권장)" },
                              { value: "manualPasteText", label: "텍스트 붙여넣기" },
                              { value: "manualPasteJson", label: "JSON 붙여넣기" },
                            ]}
                            value={String(
                              normalizeWebResultMode(feedInspectorTurnConfig?.webResultMode),
                            )}
                          />
                        </label>
                        <label>
                          자동화 타임아웃(ms)
                          <input
                            disabled={!feedInspectorEditable}
                            onChange={(event) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "webTimeoutMs",
                                Number(event.currentTarget.value) || 90_000,
                              );
                            }}
                            type="number"
                            value={String(feedInspectorTurnConfig?.webTimeoutMs ?? 90_000)}
                          />
                        </label>
                      </>
                    )}
                    <label>
                      역할
                      <input
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "role", event.currentTarget.value);
                        }}
                        placeholder={turnRoleLabel(feedInspectorTurnNode)}
                        value={String(feedInspectorTurnConfig?.role ?? "")}
                      />
                    </label>
                    <label>
                      작업 경로
                      <input
                        className="lowercase-path-input"
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "cwd", event.currentTarget.value);
                        }}
                        value={String(feedInspectorTurnConfig?.cwd ?? cwd)}
                      />
                    </label>
                    <label>
                      품질 프로필
                      <FancySelect
                        ariaLabel="피드 에이전트 품질 프로필"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "qualityProfile", next);
                        }}
                        options={QUALITY_PROFILE_OPTIONS}
                        value={feedInspectorQualityProfile}
                      />
                    </label>
                    <label>
                      통과 기준 점수
                      <FancySelect
                        ariaLabel="피드 에이전트 품질 통과 기준 점수"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(
                            feedInspectorEditableNodeId,
                            "qualityThreshold",
                            normalizeQualityThreshold(next),
                          );
                        }}
                        options={QUALITY_THRESHOLD_OPTIONS}
                        value={feedInspectorQualityThresholdOption}
                      />
                    </label>
                    <label>
                      출력 아티팩트
                      <FancySelect
                        ariaLabel="피드 에이전트 출력 아티팩트"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "artifactType", next);
                        }}
                        options={ARTIFACT_TYPE_OPTIONS}
                        value={toArtifactType(feedInspectorTurnConfig?.artifactType)}
                      />
                    </label>
                    {feedInspectorQualityProfile === "code_implementation" && (
                      <>
                        <label>
                          로컬 품질 명령 실행
                          <FancySelect
                            ariaLabel="피드 에이전트 로컬 품질 명령 실행"
                            className="modern-select"
                            disabled={!feedInspectorEditable}
                            onChange={(next) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "qualityCommandEnabled",
                                next === "true",
                              );
                            }}
                            options={[
                              { value: "false", label: "미사용" },
                              { value: "true", label: "사용" },
                            ]}
                            value={String(feedInspectorTurnConfig?.qualityCommandEnabled === true)}
                          />
                        </label>
                        <label>
                          품질 명령 목록
                          <textarea
                            className="prompt-template-textarea"
                            disabled={!feedInspectorEditable}
                            onChange={(event) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "qualityCommands",
                                event.currentTarget.value,
                              );
                            }}
                            rows={3}
                            value={String(feedInspectorTurnConfig?.qualityCommands ?? "npm run build")}
                          />
                        </label>
                      </>
                    )}
                    <label>
                      프롬프트 템플릿
                      <textarea
                        className="prompt-template-textarea"
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(
                            feedInspectorEditableNodeId,
                            "promptTemplate",
                            event.currentTarget.value,
                          );
                        }}
                        rows={8}
                        value={feedInspectorPromptTemplate}
                      />
                    </label>
                  </div>
                </section>
              )}
              {!feedInspectorTurnNode && (
                <div className="inspector-empty">선택된 포스트의 에이전트 설정을 찾을 수 없습니다.</div>
              )}
              <section className="feed-agent-rules">
                <div className="feed-agent-rules-head">
                  <h4>적용 규칙 문서</h4>
                  {/* <span>{feedInspectorRuleDocs.length}개</span> */}
                </div>
                {!feedInspectorRuleCwd && (
                  <div className="inspector-empty">작업 경로가 없어 agent.md / skill.md를 조회할 수 없습니다.</div>
                )}
                {feedInspectorRuleLoading && <div className="inspector-empty">규칙 문서 로딩 중...</div>}
                {!feedInspectorRuleLoading && feedInspectorRuleCwd && feedInspectorRuleDocs.length === 0 && (
                  <div className="inspector-empty">적용된 agent.md / skill.md 없음</div>
                )}
                {!feedInspectorRuleLoading && feedInspectorRuleDocs.length > 0 && (
                  <div className="feed-agent-rule-list">
                    {feedInspectorRuleDocs.map((doc) => (
                      <article className="feed-agent-rule-doc" key={`${doc.path}:${doc.content.length}`}>
                        <header>{doc.path}</header>
                        <pre>{doc.content}</pre>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </article>
            <article className="panel-card feed-main">
              <div className="feed-topbar">
                <h2>피드</h2>
                <button
                  className={`feed-filter-toggle ${feedFilterOpen ? "is-open" : ""}`}
                  onClick={() => setFeedFilterOpen((prev) => !prev)}
                  type="button"
                >
                  <span className="feed-filter-toggle-label">필터</span>
                </button>
              </div>
              <div className={`feed-filter-inline-wrap ${feedFilterOpen ? "is-open" : ""}`}>
                <div className="feed-filter-inline">
                  <label>
                    상태
                    <FancySelect
                      ariaLabel="피드 상태 필터"
                      className="modern-select"
                      onChange={(next) => setFeedStatusFilter(next as FeedStatusFilter)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "draft", label: "작업중" },
                        { value: "done", label: "완료" },
                        { value: "failed", label: "오류" },
                        { value: "cancelled", label: "취소" },
                      ]}
                      value={feedStatusFilter}
                    />
                  </label>
                  <label>
                    실행기
                    <FancySelect
                      ariaLabel="피드 실행기 필터"
                      className="modern-select"
                      onChange={(next) => setFeedExecutorFilter(next as FeedExecutorFilter)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "codex", label: "Codex" },
                        { value: "web", label: "WEB" },
                        { value: "ollama", label: "Ollama" },
                      ]}
                      value={feedExecutorFilter}
                    />
                  </label>
                  <label>
                    기간
                    <FancySelect
                      ariaLabel="피드 기간 필터"
                      className="modern-select"
                      onChange={(next) => setFeedPeriodFilter(next as FeedPeriodFilter)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "today", label: "오늘" },
                        { value: "7d", label: "최근 7일" },
                      ]}
                      value={feedPeriodFilter}
                    />
                  </label>
                  <label>
                    키워드
                    <input
                      onChange={(e) => setFeedKeyword(e.currentTarget.value)}
                      placeholder="질문/역할/모델 검색"
                      value={feedKeyword}
                    />
                  </label>
                </div>
              </div>
              <div className="feed-topic-tabs">
                {feedCategoryMeta.map((row) => {
                  const count = feedCategoryPosts[row.key].length;
                  return (
                    <button
                      className={`${feedCategory === row.key ? "is-active" : ""} ${
                        row.key === "all_posts" ? "is-all-posts" : ""
                      }`.trim()}
                      key={row.key}
                      onClick={() => setFeedCategory(row.key)}
                      type="button"
                    >
                      <span className="feed-topic-label">{row.label}</span>
                      {count > 0 && <span className="feed-topic-count">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <article
                className="feed-stream"
                onClick={() => {
                  if (feedShareMenuPostId) {
                    setFeedShareMenuPostId(null);
                  }
                }}
              >
                {feedLoading && <div className="log-empty">피드 로딩 중...</div>}
                {!feedLoading && currentFeedPosts.length === 0 && (
                  <div className="log-empty">표시할 포스트가 없습니다.</div>
                )}
                {!feedLoading &&
                  currentFeedPosts.map((post) => {
                    const markdownAttachment = post.attachments.find((attachment) => attachment.kind === "markdown");
                    const visibleContent = markdownAttachment?.content ?? post.summary ?? "(첨부 없음)";
                    const avatarHue = hashStringToHue(`${post.nodeId}:${post.agentName}:${post.roleLabel}`);
                    const avatarStyle = {
                      backgroundColor: `hsl(${avatarHue} 78% 92%)`,
                      color: `hsl(${avatarHue} 54% 28%)`,
                      borderColor: `hsl(${avatarHue} 36% 76%)`,
                    };
                    const avatarLabel = buildFeedAvatarLabel(post);
                    const score = Math.max(
                      1,
                      Math.min(99, Number(post.evidence.qualityScore ?? (post.status === "done" ? 95 : 55))),
                    );
                    const pendingRequestCount = (pendingNodeRequests[post.nodeId] ?? []).length;
                    const requestDraft = feedReplyDraftByPost[post.id] ?? "";
                    const isExpanded = feedExpandedByPost[post.id] === true;
                    const isDraftPost = post.status === "draft";
                    const canRequest = post.nodeType === "turn";
                    return (
                      <section
                        className={`feed-card feed-card-sns ${
                          feedInspectorPost?.id === post.id ? "is-selected" : ""
                        }`.trim()}
                        key={post.id}
                        onClick={() => onSelectFeedInspectorPost(post)}
                      >
                        <div className="feed-card-head">
                          <div className="feed-card-avatar" style={avatarStyle}>
                            <span>{avatarLabel}</span>
                          </div>
                          <div className="feed-card-title-wrap">
                            <h3>{post.agentName}</h3>
                            <div className="feed-card-sub">{post.roleLabel}</div>
                          </div>
                          <div className="feed-card-head-actions">
                            <span
                              className={`feed-score-badge ${
                                isDraftPost ? "live" : post.status === "done" ? "good" : "warn"
                              }`}
                              title={isDraftPost ? "에이전트 작업 중" : `품질 점수 ${score}`}
                            >
                              {isDraftPost ? "LIVE" : score}
                            </span>
                            <div
                              className="feed-share-menu-wrap feed-share-menu-wrap-head"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <button
                                aria-label="공유하기"
                                className="feed-share-icon-button"
                                onClick={() => setFeedShareMenuPostId((prev) => (prev === post.id ? null : post.id))}
                                type="button"
                              >
                                <img alt="" aria-hidden="true" className="feed-share-icon" src="/share-svgrepo-com.svg" />
                              </button>
                              {feedShareMenuPostId === post.id && (
                                <div className="feed-share-menu">
                                  <button onClick={() => void onShareFeedPost(post, "clipboard")} type="button">
                                    <span>텍스트 복사</span>
                                  </button>
                                  <button onClick={() => void onShareFeedPost(post, "email")} type="button">
                                    <span>이메일</span>
                                  </button>
                                  <button onClick={() => void onShareFeedPost(post, "obsidian")} type="button">
                                    <span>옵시디언</span>
                                  </button>
                                  <button onClick={() => void onShareFeedPost(post, "json")} type="button">
                                    <span>JSON 복사</span>
                                  </button>
                                  </div>
                                )}
                              </div>
                            <button
                              aria-label="포스트 삭제"
                              className="feed-delete-icon-button"
                              disabled={!post.sourceFile}
                              onClick={() => void onDeleteFeedPost(post)}
                              type="button"
                            >
                              <img alt="" aria-hidden="true" className="feed-delete-icon" src="/xmark.svg" />
                            </button>
                          </div>
                        </div>
                        <div className="feed-card-summary">{post.summary || "(요약 없음)"}</div>
                        <button
                          className="feed-more-button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setFeedExpandedByPost((prev) => ({
                              ...prev,
                              [post.id]: !prev[post.id],
                            }))
                          }
                          type="button"
                        >
                          {isExpanded ? "접기" : "더보기"}
                        </button>
                        <div className={`feed-card-details ${isExpanded ? "is-expanded" : ""}`} aria-hidden={!isExpanded}>
                          {post.question && <div className="feed-card-question">Q: {post.question}</div>}
                          <pre className="feed-sns-content">{visibleContent}</pre>
                          <div className="feed-evidence-row">
                            <span>{formatRelativeFeedTime(post.createdAt)}</span>
                            <span>생성 시간 {formatDuration(post.evidence.durationMs)}</span>
                            <span>사용량 {formatUsage(post.evidence.usage)}</span>
                            {pendingRequestCount > 0 && <span>추가 요청 대기 {pendingRequestCount}건</span>}
                          </div>
                          {canRequest && (
                            <div className="feed-reply-row">
                              <input
                                onChange={(event) =>
                                  setFeedReplyDraftByPost((prev) => ({
                                    ...prev,
                                    [post.id]: event.currentTarget.value,
                                  }))
                                }
                                placeholder="에이전트에게 추가 요청을 남기세요"
                                value={requestDraft}
                              />
                              <button
                                aria-label="요청 보내기"
                                className="primary-action question-create-button feed-reply-send-button"
                                onClick={() => onSubmitFeedAgentRequest(post)}
                                type="button"
                              >
                                <img alt="" aria-hidden="true" className="question-create-icon" src="/up.svg" />
                              </button>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
              </article>
            </article>
          </section>
        )}

        {workspaceTab === "history" && (
          <section className="history-layout workspace-tab-panel">
            <article className="panel-card history-list">
              <h2>실행 기록</h2>
              <div className="button-row history-list-actions">
                <button aria-label="새로고침" onClick={refreshRunFiles} title="새로고침" type="button">
                  <img alt="" aria-hidden="true" className="history-list-action-icon" src="/reload.svg" />
                </button>
                <button aria-label="Finder에서 열기" onClick={onOpenRunsFolder} title="Finder에서 열기" type="button">
                  <img alt="" aria-hidden="true" className="history-list-action-icon" src="/open2.svg" />
                </button>
              </div>
              {runFiles.length === 0 && <div className={"log-empty"}>실행 기록 파일 없음</div>}
              {runFiles.map((file) => (
                <button
                  className={selectedRunFile === file ? "is-active" : ""}
                  key={file}
                  onClick={() => loadRunDetail(file)}
                  type="button"
                >
                  {formatRunFileLabel(file)}
                </button>
              ))}
            </article>

            <article className="panel-card history-detail">
              {!selectedRunDetail && <div>실행 기록을 선택하세요.</div>}
              {selectedRunDetail && (
                <>
                  <div className="history-detail-head">
                    <h2>실행 상세</h2>
                    <button
                      aria-label="실행 기록 삭제"
                      className="history-delete-button"
                      onClick={onDeleteSelectedRun}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                  <div>실행 ID: {selectedRunDetail.runId}</div>
                  <div>시작 시간: {formatRunDateTime(selectedRunDetail.startedAt)}</div>
                  <div>종료 시간: {formatRunDateTime(selectedRunDetail.finishedAt)}</div>
                  <div className="history-detail-content">
                    <div className="history-detail-group">
                      <h3>질문</h3>
                      <pre>{selectedRunDetail.question || "(비어 있음)"}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>최종 답변</h3>
                      <pre>{selectedRunDetail.finalAnswer || "(없음)"}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>요약 로그</h3>
                      <pre>{selectedRunDetail.summaryLogs.join("\n") || "(없음)"}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>품질 요약</h3>
                      <pre>{formatUnknown(selectedRunDetail.qualitySummary ?? {})}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>회귀 비교</h3>
                      <pre>{formatUnknown(selectedRunDetail.regression ?? {})}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>상태 전이</h3>
                      <pre>{formatUnknown(selectedRunDetail.transitions)}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>Provider Trace</h3>
                      <pre>{formatUnknown(selectedRunDetail.providerTrace ?? [])}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>첨부 참조 Trace</h3>
                      <pre>{formatUnknown(selectedRunDetail.knowledgeTrace ?? [])}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>노드 로그</h3>
                      <pre>{formatUnknown(selectedRunDetail.nodeLogs ?? {})}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>노드 품질 지표</h3>
                      <pre>{formatUnknown(selectedRunDetail.nodeMetrics ?? {})}</pre>
                    </div>
                  </div>
                </>
              )}
            </article>
          </section>
        )}

        {workspaceTab === "settings" && (
          <section className="panel-card settings-view workspace-tab-panel">
            {renderSettingsPanel(false)}
            {lastSavedRunFile && <div>최근 실행 파일: {formatRunFileLabel(lastSavedRunFile)}</div>}
          </section>
        )}

        {workspaceTab === "bridge" && renderBridgePanel()}

      </section>

      {pendingWebLogin && (
        <div className="modal-backdrop">
          <section className="approval-modal web-turn-modal">
            <h2>로그인이 필요합니다</h2>
            <div>노드: {pendingWebLogin.nodeId}</div>
            <div>서비스: {webProviderLabel(pendingWebLogin.provider)}</div>
            <div>{pendingWebLogin.reason}</div>
            <div className="button-row">
              <button onClick={() => void onOpenProviderSession(pendingWebLogin.provider)} type="button">
                로그인 세션 열기
              </button>
              <button onClick={() => resolvePendingWebLogin(true)} type="button">
                로그인 완료 후 계속
              </button>
              <button onClick={() => resolvePendingWebLogin(false)} type="button">
                취소
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingWebTurn && (
        <div className="modal-backdrop">
          <section className="approval-modal web-turn-modal">
            <h2>웹 응답 입력 필요</h2>
            <div>노드: {pendingWebTurn.nodeId}</div>
            <div>서비스: {webProviderLabel(pendingWebTurn.provider)}</div>
            <div>수집 모드: {pendingWebTurn.mode === "manualPasteJson" ? "JSON" : "텍스트"}</div>
            <div className="button-row">
              <button onClick={onOpenPendingProviderWindow} type="button">
                서비스 창 열기
              </button>
              <button onClick={onCopyPendingWebPrompt} type="button">
                프롬프트 복사
              </button>
            </div>
            <div className="web-turn-prompt">{pendingWebTurn.prompt}</div>
            <label>
              응답 붙여넣기
              <textarea
                onChange={(e) => setWebResponseDraft(e.currentTarget.value)}
                rows={8}
                value={webResponseDraft}
              />
            </label>
            <div className="button-row">
              <button onClick={onSubmitPendingWebTurn} type="button">
                입력 완료
              </button>
              <button onClick={onCancelPendingWebTurn} type="button">
                취소
              </button>
            </div>
          </section>
        </div>
      )}

      {activeApproval && (
        <div className="modal-backdrop">
          <section className="approval-modal">
            <h2>승인 필요</h2>
            <div>요청 출처: {approvalSourceLabel(activeApproval.source)}</div>
            <div>메서드: {activeApproval.method}</div>
            <div>요청 ID: {activeApproval.requestId}</div>
            <pre>{formatUnknown(activeApproval.params)}</pre>
            <div className="button-row">
              {APPROVAL_DECISIONS.map((decision) => (
                <button
                  disabled={approvalSubmitting}
                  key={decision}
                  onClick={() => onRespondApproval(decision)}
                  type="button"
                >
                  {approvalDecisionLabel(decision)}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
