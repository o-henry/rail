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
import { openPath } from "@tauri-apps/plugin-opener";
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

type WorkspaceTab = "workflow" | "history" | "settings";
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
};

type GraphData = {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  | "web_grok"
  | "web_perplexity"
  | "web_claude"
  | "ollama";
type CostPreset = "conservative" | "balanced" | "aggressive";
type WebAutomationMode = "auto" | "manualPasteJson" | "manualPasteText";
type WebResultMode = WebAutomationMode;
type WebProvider = "gemini" | "gpt" | "grok" | "perplexity" | "claude";

type TurnConfig = {
  executor?: TurnExecutor;
  model?: string;
  role?: string;
  cwd?: string;
  promptTemplate?: string;
  webResultMode?: WebResultMode;
  webTimeoutMs?: number;
  ollamaModel?: string;
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
};

type WebProviderHealthEntry = {
  contextOpen?: boolean;
  profileDir?: string;
  url?: string | null;
  sessionState?: string | null;
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
const GRAPH_SCHEMA_VERSION = 2;
const TURN_EXECUTOR_OPTIONS = [
  "codex",
  "web_gemini",
  "web_grok",
  "web_perplexity",
  "web_claude",
  "ollama",
] as const;
const TURN_EXECUTOR_LABELS: Record<TurnExecutor, string> = {
  codex: "Codex",
  web_gemini: "WEB / GEMINI",
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
  return String(error);
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
      "button, input, textarea, select, a, .node-anchor, .node-ports, .node-port-btn, .fancy-select, .fancy-select-menu",
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
    if (input === "chatgpt" || input === "apikey") {
      return input;
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

function formatUsage(usage?: UsageStats): string {
  if (!usage) {
    return "-";
  }
  const total = usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
  const inputText = usage.inputTokens != null ? `${usage.inputTokens}` : "-";
  const outputText = usage.outputTokens != null ? `${usage.outputTokens}` : "-";
  return `${total}토큰 (입력 ${inputText} / 출력 ${outputText})`;
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
    })),
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
): string {
  const direction = x2 >= x1 ? 1 : -1;
  const arrowLeadX = withArrow ? x2 - 12 * direction : x2;
  const horizontalGap = Math.max(64, Math.min(180, Math.abs(arrowLeadX - x1) * 0.5));
  const bendX = x1 + horizontalGap * direction;
  const verticalDelta = y2 - y1;

  if (Math.abs(verticalDelta) < 1) {
    return withArrow
      ? `M ${x1} ${y1} L ${arrowLeadX} ${y1} L ${x2} ${y1}`
      : `M ${x1} ${y1} L ${x2} ${y1}`;
  }

  const verticalSign = verticalDelta >= 0 ? 1 : -1;
  const corner1 = Math.min(4, Math.abs(bendX - x1) / 2, Math.abs(verticalDelta) / 2);
  const corner2 = Math.min(4, Math.abs(arrowLeadX - bendX) / 2, Math.abs(verticalDelta) / 2);
  const pathParts = [
    `M ${x1} ${y1}`,
    `L ${bendX - direction * corner1} ${y1}`,
    `Q ${bendX} ${y1} ${bendX} ${y1 + verticalSign * corner1}`,
    `L ${bendX} ${y2 - verticalSign * corner2}`,
    `Q ${bendX} ${y2} ${bendX + direction * corner2} ${y2}`,
    `L ${arrowLeadX} ${y2}`,
  ];

  if (withArrow) {
    pathParts.push(`L ${x2} ${y2}`);
  }
  return pathParts.join(" ");
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

function getAutoConnectionSides(fromNode: GraphNode, toNode: GraphNode): {
  fromSide: NodeAnchorSide;
  toSide: NodeAnchorSide;
} {
  const fromCenterX = fromNode.position.x + NODE_WIDTH / 2;
  const fromCenterY = fromNode.position.y + NODE_HEIGHT / 2;
  const toCenterX = toNode.position.x + NODE_WIDTH / 2;
  const toCenterY = toNode.position.y + NODE_HEIGHT / 2;
  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { fromSide: "right", toSide: "left" };
    }
    return { fromSide: "left", toSide: "right" };
  }

  if (dy >= 0) {
    return { fromSide: "bottom", toSide: "top" };
  }
  return { fromSide: "top", toSide: "bottom" };
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
    decisionPath: "decision",
    passNodeId: "",
    rejectNodeId: "",
    schemaJson: "",
  };
}

function nodeCardSummary(node: GraphNode): string {
  if (node.type === "turn") {
    const config = node.config as TurnConfig;
    const executor = getTurnExecutor(config);
    if (executor !== "codex") {
      return `에이전트: ${turnExecutorLabel(executor)}`;
    }
    return `모델: ${toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL))}`;
  }
  if (node.type === "transform") {
    const config = node.config as TransformConfig;
    return `모드: ${String(config.mode ?? "pick")}`;
  }
  const config = node.config as GateConfig;
  return `분기 경로: ${String(config.decisionPath ?? "decision")}`;
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

function toWebProviderHealthMap(raw: unknown): Record<string, WebProviderHealthEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const entries = raw as Record<string, unknown>;
  const next: Record<string, WebProviderHealthEntry> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const row = value as Record<string, unknown>;
    next[key] = {
      contextOpen: typeof row.contextOpen === "boolean" ? row.contextOpen : undefined,
      profileDir: typeof row.profileDir === "string" ? row.profileDir : undefined,
      url: typeof row.url === "string" ? row.url : row.url == null ? null : undefined,
      sessionState: typeof row.sessionState === "string" ? row.sessionState : undefined,
    };
  }
  return next;
}

function providerSessionStateMeta(state?: string | null): {
  label: string;
  tone: "connected" | "required" | "unknown";
} {
  if (state === "active") {
    return { label: "연결됨", tone: "connected" };
  }
  if (state === "login_required") {
    return { label: "로그인 필요", tone: "required" };
  }
  return { label: "확인 필요", tone: "unknown" };
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
  if (type === "transform") {
    return "데이터 변환";
  }
  return "분기";
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

function NavIcon({ tab }: { tab: WorkspaceTab }) {
  if (tab === "workflow") {
    return (
      <img alt="" aria-hidden="true" className="nav-workflow-image" src="/workflow.svg" />
    );
  }
  if (tab === "history") {
    return (
      <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
        <path d="M4 12a8 8 0 1 0 2.4-5.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M4 4v4h4M12 8v4l2.8 1.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (tab === "settings") {
    return <img alt="" aria-hidden="true" className="nav-workflow-image" src="/setting.svg" />;
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
          {options.length === 0 && <div className="fancy-select-empty">{emptyMessage}</div>}
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

function loginStateLabel(engineStarted: boolean, loginCompleted: boolean, authMode: AuthMode): string {
  if (!engineStarted) {
    return "엔진 꺼짐";
  }
  if (loginCompleted) {
    return `로그인 완료 (${authModeLabel(authMode)})`;
  }
  if (authMode === "apikey") {
    return "API 키 모드";
  }
  if (authMode === "chatgpt") {
    return "세션 확인 중";
  }
  return "로그인 필요";
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

function buildValidationPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 분석하고 검증 계획을 3개 불릿으로 요약해줘. 입력 질문: {{input}}",
    }),
    makePresetNode("turn-search-a", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "SEARCH AGENT A",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 찬성 근거를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-search-b", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "SEARCH AGENT B",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 반대 근거/한계를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-judge", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "EVALUATION AGENT",
      cwd: ".",
      promptTemplate:
        "근거를 종합해 엄격한 JSON만 출력해라: {\"decision\":\"PASS|REJECT\",\"finalDraft\":\"...\",\"why\":\"...\"}. 입력: {{input}}",
    }),
    makePresetNode("gate-decision", "gate", 1020, 120, {
      decisionPath: "decision",
      passNodeId: "turn-final",
      rejectNodeId: "transform-reject",
      schemaJson: "{\"type\":\"object\",\"required\":[\"decision\"]}",
    }),
    makePresetNode("turn-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "decision=PASS로 가정하고 finalDraft와 근거를 정리해 최종 답변을 한국어로 작성해줘. {{input}}",
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

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges };
}

function buildDevelopmentPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-requirements", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "REQUIREMENTS AGENT",
      cwd: ".",
      promptTemplate:
        "요구사항을 기능/비기능으로 분해하고 우선순위를 매겨줘. 질문: {{input}}",
    }),
    makePresetNode("turn-architecture", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "ARCHITECTURE AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 풀스택 아키텍처를 제안해 JSON으로 출력해줘. {{input}}",
    }),
    makePresetNode("turn-implementation", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "IMPLEMENTATION AGENT",
      cwd: ".",
      promptTemplate:
        "구현 단계 계획(파일 단위 포함)을 작성해줘. 입력: {{input}}",
    }),
    makePresetNode("turn-evaluator", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "QUALITY AGENT",
      cwd: ".",
      promptTemplate:
        "계획을 검토하고 JSON만 출력: {\"decision\":\"PASS|REJECT\",\"finalDraft\":\"...\",\"risk\":\"...\"}. 입력: {{input}}",
    }),
    makePresetNode("gate-quality", "gate", 1020, 120, {
      decisionPath: "decision",
      passNodeId: "turn-final-dev",
      rejectNodeId: "transform-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"decision\"]}",
    }),
    makePresetNode("turn-final-dev", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "DEV SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "실행 가능한 최종 개발 가이드를 산출해줘. 코드/테스트/배포 체크리스트 포함. {{input}}",
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

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges };
}

function buildResearchPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-research-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "RESEARCH PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "입력 질문을 자료조사 관점으로 분해하고 조사 체크리스트(JSON)를 작성해줘. 질문: {{input}}",
    }),
    makePresetNode("turn-research-collector", "turn", 420, 120, {
      model: "GPT-5.2",
      role: "SOURCE COLLECTION AGENT",
      cwd: ".",
      promptTemplate:
        "체크리스트 기준으로 핵심 근거 후보를 수집해 JSON으로 정리해줘. 입력: {{input}}",
    }),
    makePresetNode("turn-research-factcheck", "turn", 720, 120, {
      model: "GPT-5.2-Codex",
      role: "FACT CHECK AGENT",
      cwd: ".",
      promptTemplate:
        "수집 근거의 신뢰도/한계/누락을 검토하고 JSON으로 출력해줘. 입력: {{input}}",
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
        "조사 결과를 기반으로 근거 중심 최종 답변을 한국어로 작성해줘. 불확실성은 명시해라. 입력: {{input}}",
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

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges };
}

function buildExpertPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-expert-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "DOMAIN INTAKE AGENT",
      cwd: ".",
      promptTemplate:
        "질문의 도메인/목표/제약을 구조화해줘. 출력은 JSON 우선. 입력: {{input}}",
    }),
    makePresetNode("turn-expert-analysis", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "DOMAIN EXPERT AGENT",
      cwd: ".",
      promptTemplate:
        "도메인 전문가 관점의 해결 전략을 작성해줘. 핵심 원리와 실무 적용을 포함. 입력: {{input}}",
    }),
    makePresetNode("turn-expert-review", "turn", 420, 220, {
      model: "GPT-5.2",
      role: "PEER REVIEW AGENT",
      cwd: ".",
      promptTemplate:
        "전문가 전략의 취약점/반례를 리뷰하고 JSON으로 정리해줘. 입력: {{input}}",
    }),
    makePresetNode("gate-expert", "gate", 720, 120, {
      decisionPath: "decision",
      passNodeId: "turn-expert-final",
      rejectNodeId: "transform-expert-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"decision\"]}",
    }),
    makePresetNode("turn-expert-final", "turn", 1020, 40, {
      model: "GPT-5.3-Codex",
      role: "EXPERT SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "최종 전문가 답변을 작성해줘. 실행 단계, 주의점, 검증 체크리스트를 포함. 입력: {{input}}",
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

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges };
}

function normalizeGraph(input: unknown): GraphData {
  if (!input || typeof input !== "object") {
    return { version: GRAPH_SCHEMA_VERSION, nodes: [], edges: [] };
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
        model: toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL)),
      };
      return {
        ...node,
        config: normalizedConfig,
      };
    });

  return {
    version: Math.max(version, GRAPH_SCHEMA_VERSION),
    nodes: normalizedNodes,
    edges: edges.filter(Boolean) as GraphEdge[],
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
  const defaultCwd = useMemo(() => ".", []);

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

  const [usageSourceMethod, setUsageSourceMethod] = useState("");
  const [usageInfoText, setUsageInfoText] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("unknown");
  const [loginCompleted, setLoginCompleted] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [pendingWebTurn, setPendingWebTurn] = useState<PendingWebTurn | null>(null);
  const [pendingWebLogin, setPendingWebLogin] = useState<PendingWebLogin | null>(null);
  const [webResponseDraft, setWebResponseDraft] = useState("");
  const [webWorkerHealth, setWebWorkerHealth] = useState<WebWorkerHealth>({
    running: false,
  });
  const [webWorkerBusy, setWebWorkerBusy] = useState(false);
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
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string>("");
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>("");
  const [connectFromSide, setConnectFromSide] = useState<NodeAnchorSide | null>(null);
  const [connectPreviewStartPoint, setConnectPreviewStartPoint] = useState<LogicalPoint | null>(null);
  const [connectPreviewPoint, setConnectPreviewPoint] = useState<LogicalPoint | null>(null);
  const [isConnectingDrag, setIsConnectingDrag] = useState(false);
  const [graphFileName, setGraphFileName] = useState("");
  const [graphFiles, setGraphFiles] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<string[]>([]);
  const [selectedRunFile, setSelectedRunFile] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunRecord | null>(null);
  const [lastSavedRunFile, setLastSavedRunFile] = useState("");
  const [nodeStates, setNodeStates] = useState<Record<string, NodeRunState>>({});
  const [isGraphRunning, setIsGraphRunning] = useState(false);
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

  const dragRef = useRef<DragState | null>(null);
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);
  const nodeSizeMapRef = useRef<Record<string, NodeVisualSize>>({});
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const dragPointerRef = useRef<PointerState | null>(null);
  const dragAutoPanFrameRef = useRef<number | null>(null);
  const dragWindowMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragWindowUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragStartSnapshotRef = useRef<GraphData | null>(null);
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

  const activeApproval = pendingApprovals[0];
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

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

  function applyGraphChange(updater: (prev: GraphData) => GraphData) {
    setGraph((prev) => {
      const next = updater(prev);
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
        }
      } catch {
        // silent: settings panel refresh button shows latest state on demand
      }
    };
    void bootstrapWorker();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

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
                addNodeLog(activeNodeId, delta);
              }
            }

            if (payload.method === "account/login/completed") {
              setLoginCompleted(true);
              setStatus("로그인 완료 이벤트 수신");
            }

            if (payload.method === "account/updated") {
              const mode = extractAuthMode(payload.params);
              if (mode) {
                setAuthMode(mode);
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
            }
            if (payload.state === "stopped" || payload.state === "disconnected") {
              setEngineStarted(false);
              markCodexNodesStatusOnEngineIssue("cancelled", "엔진 중지 또는 연결 끊김");
              setAuthMode("unknown");
              setLoginCompleted(false);
              setUsageSourceMethod("");
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
  }, []);

  async function refreshGraphFiles() {
    try {
      const files = await invoke<string[]>("graph_list");
      setGraphFiles(files);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshRunFiles() {
    try {
      const files = await invoke<string[]>("run_list");
      setRunFiles(files);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onOpenRunsFolder() {
    setError("");
    try {
      const runsDir = await invoke<string>("run_directory");
      await openPath(runsDir);
      setStatus("실행 기록 폴더 열림");
    } catch (e) {
      setError(`실행 기록 폴더 열기 실패: ${String(e)}`);
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
      setSelectedRunDetail(run);
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
    } catch (e) {
      setError(`실행 기록 삭제 실패: ${String(e)}`);
    }
  }

  useEffect(() => {
    refreshGraphFiles();
    refreshRunFiles();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await ensureEngineStarted();
        if (!cancelled) {
          setStatus("준비됨");
        }
      } catch (e) {
        const message = String(e);
        if (message.includes("already started")) {
          if (!cancelled) {
            setEngineStarted(true);
            setStatus("준비됨");
          }
          return;
        }
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
    await invoke("engine_start", { cwd });
    setEngineStarted(true);
  }

  async function onStartEngine() {
    setError("");
    try {
      await ensureEngineStarted();
      setStatus("준비됨");
    } catch (e) {
      setError(String(e));
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
      setUsageSourceMethod("");
      setUsageInfoText("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onCheckUsage() {
    setError("");
    try {
      await ensureEngineStarted();
      const result = await invoke<UsageCheckResult>("usage_check");
      setUsageSourceMethod(result.sourceMethod);
      setUsageInfoText(JSON.stringify(result.raw, null, 2));
      setStatus(`사용량 조회 완료 (${result.sourceMethod})`);
    } catch (e) {
      setError(String(e));
      setStatus("사용량 조회 실패");
    }
  }

  async function onOpenPendingProviderWindow() {
    if (!pendingWebTurn) {
      return;
    }
    try {
      await invoke("provider_window_open", { provider: pendingWebTurn.provider });
    } catch (error) {
      setError(String(error));
    }
  }

  async function onOpenProviderChildView(provider: WebProvider) {
    try {
      await invoke("provider_child_view_open", { provider });
      setProviderChildViewOpen((prev) => ({ ...prev, [provider]: true }));
      setStatus(`${webProviderLabel(provider)} child view 열림`);
    } catch (error) {
      setError(String(error));
    }
  }

  async function onCloseProviderChildView(provider: WebProvider) {
    try {
      await invoke("provider_child_view_hide", { provider });
      setProviderChildViewOpen((prev) => ({ ...prev, [provider]: false }));
      setStatus(`${webProviderLabel(provider)} child view 숨김`);
    } catch (error) {
      const message = String(error);
      if (message.includes("provider child view not found")) {
        setProviderChildViewOpen((prev) => ({ ...prev, [provider]: false }));
        setStatus(`${webProviderLabel(provider)} child view 숨김`);
        return;
      }
      setError(message);
    }
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
      return health;
    } catch (error) {
      if (!silent) {
        setError(`웹 워커 상태 조회 실패: ${String(error)}`);
      }
      return null;
    }
  }

  async function onOpenProviderSession(provider: WebProvider) {
    setWebWorkerBusy(true);
    setError("");
    try {
      await invoke("web_provider_open_session", { provider });
      await refreshWebWorkerHealth(true);
      setStatus(`${webProviderLabel(provider)} 로그인 세션 창 열림`);
    } catch (error) {
      setError(`${webProviderLabel(provider)} 로그인 세션 열기 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

  async function onResetProviderSession(provider: WebProvider) {
    setWebWorkerBusy(true);
    setError("");
    try {
      await invoke("web_provider_reset_session", { provider });
      await refreshWebWorkerHealth(true);
      setStatus(`${webProviderLabel(provider)} 세션 리셋 완료`);
    } catch (error) {
      setError(`${webProviderLabel(provider)} 세션 리셋 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

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

  function requestWebLogin(nodeId: string, provider: WebProvider, reason: string): Promise<boolean> {
    setPendingWebLogin({
      nodeId,
      provider,
      reason,
    });
    return new Promise((resolve) => {
      webLoginResolverRef.current = resolve;
    });
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
    });

    setNodeSelection([node.id], node.id);
    setSelectedEdgeKey("");
  }

  function applyPreset(kind: "validation" | "development" | "research" | "expert") {
    let preset: GraphData;
    if (kind === "validation") {
      preset = buildValidationPreset();
    } else if (kind === "development") {
      preset = buildDevelopmentPreset();
    } else if (kind === "research") {
      preset = buildResearchPreset();
    } else {
      preset = buildExpertPreset();
    }
    setGraph(cloneGraph(preset));
    setUndoStack([]);
    setRedoStack([]);
    setNodeSelection(preset.nodes.map((node) => node.id).slice(0, 1), preset.nodes[0]?.id);
    setSelectedEdgeKey("");
    setNodeStates({});
    setConnectFromNodeId("");
    setConnectFromSide(null);
    setConnectPreviewStartPoint(null);
    setConnectPreviewPoint(null);
    setIsConnectingDrag(false);
    setMarqueeSelection(null);
    if (kind === "validation") {
      setStatus("검증형 에이전트 템플릿 로드됨");
    } else if (kind === "development") {
      setStatus("개방형 에이전트 템플릿 로드됨");
    } else if (kind === "research") {
      setStatus("자료조사 템플릿 로드됨");
    } else {
      setStatus("전문가 템플릿 로드됨");
    }
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
    }));
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
    });
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

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
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
        return {
          ...node,
          position: {
            x: Math.min(maxX, Math.max(minPos, start.x + dx)),
            y: Math.min(maxY, Math.max(minPos, start.y + dy)),
          },
        };
      }),
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

    const node = graph.nodes.find((item) => item.id === nodeId);
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
      graph.nodes
        .filter((item) => activeNodeIds.includes(item.id))
        .map((item) => [item.id, { x: item.position.x, y: item.position.y }]),
    );
    if (Object.keys(startPositions).length === 0) {
      return;
    }

    dragStartSnapshotRef.current = cloneGraph(graph);
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
      const selectedByBox = graph.nodes
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
    dragStartSnapshotRef.current = null;
    dragRef.current = null;
  }

  function onCanvasMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const clickedNodeOrPorts = target.closest(".graph-node, .node-anchors, .node-ports");
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

  function updateSelectedNodeConfig(key: string, value: unknown) {
    if (!selectedNode) {
      return;
    }

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === selectedNode.id
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
      setStatus(`그래프 저장 완료 (${saveTarget})`);
    } catch (e) {
      setError(String(e));
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
      const normalized = normalizeGraph(loaded);
      setGraph(cloneGraph(normalized));
      setUndoStack([]);
      setRedoStack([]);
      setNodeSelection(normalized.nodes.map((node) => node.id).slice(0, 1), normalized.nodes[0]?.id);
      setSelectedEdgeKey("");
      setNodeStates({});
      setConnectFromNodeId("");
      setConnectFromSide(null);
      setConnectPreviewStartPoint(null);
      setConnectPreviewPoint(null);
      setIsConnectingDrag(false);
      setStatus(`그래프 불러오기 완료 (${target})`);
      setGraphFileName(target);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    const nodeIdSet = new Set(graph.nodes.map((node) => node.id));
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
  }, [graph.nodes, selectedNodeIds, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeKey) {
      return;
    }
    const exists = graph.edges.some((edge) => getGraphEdgeKey(edge) === selectedEdgeKey);
    if (!exists) {
      setSelectedEdgeKey("");
    }
  }, [graph.edges, selectedEdgeKey]);

  useEffect(() => {
    if (workspaceTab !== "workflow" && canvasFullscreen) {
      setCanvasFullscreen(false);
    }
  }, [workspaceTab, canvasFullscreen]);

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
      if (event.key.toLowerCase() !== "h") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setPanMode((prev) => {
        const next = !prev;
        setStatus(next ? "캔버스 이동 모드 켜짐 (H)" : "캔버스 이동 모드 꺼짐 (H)");
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
      const current = graph.nodes.find((node) => node.id === selectedNodeId);
      if (!current) {
        return;
      }
      const others = graph.nodes.filter((node) => node.id !== selectedNodeId);
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
  }, [workspaceTab, selectedNodeId, graph.nodes]);

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
      const allNodeIds = graph.nodes.map((node) => node.id);
      setNodeSelection(allNodeIds, allNodeIds[0]);
      setSelectedEdgeKey("");
      setStatus(allNodeIds.length > 0 ? `노드 ${allNodeIds.length}개 선택됨` : "선택할 노드가 없습니다");
    };
    window.addEventListener("keydown", onSelectAll);
    return () => window.removeEventListener("keydown", onSelectAll);
  }, [workspaceTab, graph.nodes]);

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
        const hasEdge = graph.edges.some((edge) => getGraphEdgeKey(edge) === selectedEdgeKey);
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
        const targets = selectedNodeIds.filter((id) => graph.nodes.some((node) => node.id === id));
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
  }, [workspaceTab, selectedEdgeKey, selectedNodeIds, graph.edges, graph.nodes]);

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
    } catch (e) {
      setError(String(e));
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
        return {
          ok: false,
          error: `스키마 검증 실패: ${schemaErrors.join("; ")}`,
        };
      }
    }

    const decisionPath = String(config.decisionPath ?? "decision");
    const decisionRaw = getByPath(input, decisionPath);
    const decision = String(decisionRaw ?? "").toUpperCase();

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
      output: { decision },
      message: `분기 결과=${decision}, 실행 대상=${Array.from(allowed).join(",") || "없음"}`,
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
  }> {
    const config = node.config as TurnConfig;
    const executor = getTurnExecutor(config);
    const nodeModel = toTurnModelDisplayName(String(config.model ?? model).trim() || model);
    const nodeModelEngine = toTurnModelEngineId(nodeModel);
    const nodeCwd = String(config.cwd ?? cwd).trim() || cwd;
    const promptTemplate = String(config.promptTemplate ?? "{{input}}");
    const nodeOllamaModel = String(config.ollamaModel ?? "llama3.1:8b").trim() || "llama3.1:8b";

    const inputText = stringifyInput(input);
    const textToSend = promptTemplate.includes("{{input}}")
      ? replaceInputPlaceholder(promptTemplate, inputText)
      : `${promptTemplate}${inputText ? `\n${inputText}` : ""}`;

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
        };
      } catch (error) {
        return {
          ok: false,
          error: `Ollama 실행 실패: ${String(error)}`,
          executor,
          provider: "ollama",
        };
      }
    }

    const webProvider = getWebProviderFromExecutor(executor);
    if (webProvider) {
      const webResultMode =
        config.webResultMode ?? (webProvider === "gemini" ? "auto" : "manualPasteText");
      const webTimeoutMs = Math.max(5_000, Number(config.webTimeoutMs ?? 90_000) || 90_000);

      if (webProvider === "gemini" && webResultMode === "auto") {
        activeWebNodeIdRef.current = node.id;
        activeWebProviderRef.current = webProvider;
        addNodeLog(node.id, "[WEB] GEMINI 자동화 시작");
        const workerReady = await ensureWebWorkerReady();
        if (!workerReady) {
          addNodeLog(node.id, "[WEB] 자동화 워커 준비 실패. 수동 입력으로 전환");
        } else {
          const runAutomation = async () =>
            invoke<WebProviderRunResult>("web_provider_run", {
              provider: webProvider,
              prompt: textToSend,
              timeoutMs: webTimeoutMs,
              mode: "auto",
            });

          let result: WebProviderRunResult | null = null;
          try {
            result = await runAutomation();
            if (!result.ok && result.errorCode === "NOT_LOGGED_IN") {
              addNodeLog(node.id, "[WEB] 로그인 필요 감지");
              await onOpenProviderChildView(webProvider);
              const shouldRetry = await requestWebLogin(
                node.id,
                webProvider,
                result.error ?? "GEMINI 로그인 후 계속을 눌러주세요.",
              );
              if (cancelRequestedRef.current) {
                return {
                  ok: false,
                  error: "사용자 취소",
                  executor,
                  provider: webProvider,
                };
              }
              if (shouldRetry) {
                addNodeLog(node.id, "[WEB] 로그인 완료 확인, 자동화를 재시도합니다.");
                result = await runAutomation();
              }
            }

            if (result.ok && result.text) {
              addNodeLog(node.id, "[WEB] GEMINI 응답 추출 완료");
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
              };
            }

            const fallbackReason = `[WEB] 자동화 실패 (${result?.errorCode ?? "UNKNOWN"}): ${
              result?.error ?? "unknown error"
            }`;
            addNodeLog(node.id, fallbackReason);
            if (result?.errorCode === "BROWSER_MISSING") {
              addNodeLog(
                node.id,
                "[WEB] playwright/playwright-core 설치가 필요할 수 있습니다. 자동으로 수동 입력으로 전환합니다.",
              );
            }
            setNodeStatus(node.id, "waiting_user", "자동화 실패, 수동 입력으로 전환");
          } catch (error) {
            addNodeLog(node.id, `[WEB] 자동화 예외: ${String(error)}`);
            setNodeStatus(node.id, "waiting_user", "자동화 예외, 수동 입력으로 전환");
          } finally {
            activeWebNodeIdRef.current = "";
            activeWebProviderRef.current = null;
          }
        }
      }

      try {
        await invoke("provider_window_open", { provider: webProvider });
      } catch (error) {
        return {
          ok: false,
          error: `웹 서비스 창 열기 실패(${webProvider}): ${String(error)}`,
          executor,
          provider: webProvider,
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
        webResultMode === "auto" ? "manualPasteText" : webResultMode,
      ).then((result) => ({
        ...result,
        executor,
        provider: webProvider,
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
      return { ok: false, error: "threadId를 가져오지 못했습니다.", executor, provider: "codex" };
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
    };
  }

  async function onRunGraph() {
    if (isGraphRunning) {
      return;
    }

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
    };

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
              break;
            }

            const finishedAtIso = new Date().toISOString();
            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
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
      if (lastDoneNodeId && lastDoneNodeId in outputs) {
        runRecord.finalAnswer = extractFinalAnswer(outputs[lastDoneNodeId]);
      }
      runRecord.finishedAt = new Date().toISOString();
      await saveRunRecord(runRecord);
      setSelectedRunDetail(runRecord);
      setSelectedRunFile(`run-${runRecord.runId}.json`);
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
      cancelRequestedRef.current = false;
      collectingRunRef.current = false;
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
          <input value={cwd} onChange={(e) => setCwd(e.currentTarget.value)} />
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
              className="settings-engine-button"
              onClick={engineStarted ? onStopEngine : onStartEngine}
              disabled={running || isGraphRunning}
              type="button"
            >
              <span className="settings-button-label">{engineStarted ? "엔진 중지" : "엔진 시작"}</span>
            </button>
            <button
              className="settings-usage-button"
              onClick={onCheckUsage}
              disabled={running || isGraphRunning}
              type="button"
            >
              <span className="settings-button-label">사용량 확인</span>
            </button>
          </div>
        )}
        {usageSourceMethod && (
          <div className="usage-method">
            사용량 조회 메서드: <code>{usageSourceMethod}</code>
          </div>
        )}
        {usageInfoText && (
          <div className="usage-result">
            <h3>사용량 조회 결과</h3>
            <pre>{usageInfoText}</pre>
          </div>
        )}
      </section>
    );
  }

  function renderWebAutomationPanel() {
    const providerHealthMap = toWebProviderHealthMap(webWorkerHealth.providers);
    const activeProviderRaw =
      typeof webWorkerHealth.activeProvider === "string" ? webWorkerHealth.activeProvider.trim() : "";
    const activeProviderLabel = activeProviderRaw
      ? WEB_PROVIDER_OPTIONS.includes(activeProviderRaw as WebProvider)
        ? webProviderLabel(activeProviderRaw as WebProvider)
        : activeProviderRaw.toUpperCase()
      : "없음";
    return (
      <section className="controls web-automation-panel">
        <h2>웹 계정 연동</h2>
        <div className="settings-badges">
          <span className="status-tag neutral">활성 Provider: {activeProviderLabel}</span>
          <span className="status-tag neutral">
            상태 동기화: {webWorkerHealth.running ? "준비됨" : "초기화 필요"}
          </span>
        </div>
        <div className="button-row">
          <button
            className="settings-refresh-button"
            disabled={webWorkerBusy}
            onClick={() => refreshWebWorkerHealth()}
            type="button"
          >
            <span className="settings-button-label">상태 동기화</span>
          </button>
        </div>
        <div className="usage-method">
          각 서비스의 로그인 상태를 확인하고, 필요한 서비스만 로그인하세요.
        </div>
        <section className="provider-hub">
          <h3>서비스 로그인 상태</h3>
          <div className="provider-hub-list">
            {WEB_PROVIDER_OPTIONS.map((provider) => {
              const row = providerHealthMap[provider];
              const hasContext = row?.contextOpen === true;
              const session = providerSessionStateMeta(row?.sessionState);
              return (
                <div className="provider-hub-row" key={`session-${provider}`}>
                  <div className="provider-hub-meta">
                    <span className="provider-hub-name">{webProviderLabel(provider)}</span>
                    <span className={`provider-session-pill ${session.tone}`}>
                      <span className="provider-session-label">{session.label}</span>
                    </span>
                  </div>
                  <div className="button-row provider-session-actions">
                    <button
                      aria-pressed={hasContext}
                      className={`provider-session-toggle ${hasContext ? "is-active" : ""}`}
                      disabled={webWorkerBusy}
                      onClick={() =>
                        hasContext ? onResetProviderSession(provider) : onOpenProviderSession(provider)
                      }
                      type="button"
                    >
                      <span className="settings-button-label">
                        {hasContext ? "세션 리셋" : "로그인"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="usage-method">
            세션 데이터는 로컬 프로필에만 저장되며, 토큰/쿠키 값은 UI와 로그에 출력하지 않습니다.
          </div>
        </section>
      </section>
    );
  }

  const edgeLines = graph.edges
    .map((edge, index) => {
      const fromNode = graph.nodes.find((node) => node.id === edge.from.nodeId);
      const toNode = graph.nodes.find((node) => node.id === edge.to.nodeId);
      if (!fromNode || !toNode) {
        return null;
      }

      const auto = getAutoConnectionSides(fromNode, toNode);
      const fromPoint = getNodeAnchorPoint(
        fromNode,
        edge.from.side ?? auto.fromSide,
        getNodeVisualSize(fromNode.id),
      );
      const toPoint = getNodeAnchorPoint(
        toNode,
        edge.to.side ?? auto.toSide,
        getNodeVisualSize(toNode.id),
      );
      const edgeKey = getGraphEdgeKey(edge);

      return {
        key: `${edgeKey}-${index}`,
        edgeKey,
        path: buildRoundedEdgePath(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, true),
      };
    })
    .filter(Boolean) as Array<{ key: string; edgeKey: string; path: string }>;
  const connectPreviewLine = (() => {
    if (!connectFromNodeId || !connectPreviewPoint) {
      return null;
    }
    const startPoint = (() => {
      if (connectPreviewStartPoint) {
        return connectPreviewStartPoint;
      }
      const fromNode = graph.nodes.find((node) => node.id === connectFromNodeId);
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
    return buildRoundedEdgePath(startPoint.x, startPoint.y, connectPreviewPoint.x, connectPreviewPoint.y, false);
  })();

  const selectedNodeState = selectedNodeId ? nodeStates[selectedNodeId] : undefined;
  const selectedTurnExecutor: TurnExecutor =
    selectedNode?.type === "turn" ? getTurnExecutor(selectedNode.config as TurnConfig) : "codex";
  const outgoingFromSelected = selectedNode
    ? graph.edges
        .filter((edge) => edge.from.nodeId === selectedNode.id)
        .map((edge) => edge.to.nodeId)
        .filter((value, index, arr) => arr.indexOf(value) === index)
    : [];
  const isActiveTab = (tab: WorkspaceTab): boolean => workspaceTab === tab;
  const viewportWidth = Math.ceil(canvasLogicalViewport.width);
  const viewportHeight = Math.ceil(canvasLogicalViewport.height);
  const stagePadding = graph.nodes.length > 0 ? STAGE_GROW_MARGIN : 0;
  const maxNodeRight = graph.nodes.reduce((max, node) => Math.max(max, node.position.x + NODE_WIDTH), 0);
  const maxNodeBottom = graph.nodes.reduce((max, node) => Math.max(max, node.position.y + NODE_HEIGHT), 0);
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
            <span className="nav-icon"><NavIcon tab="workflow" /></span>
            <span className="nav-label">워크</span>
          </button>
          <button
            className={isActiveTab("history") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("history")}
            aria-label="기록"
            title="기록"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="history" /></span>
            <span className="nav-label">기록</span>
          </button>
          <button
            className={isActiveTab("settings") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("settings")}
            aria-label="설정"
            title="설정"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="settings" /></span>
            <span className="nav-label">설정</span>
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
          <div className={`workflow-layout ${canvasFullscreen ? "canvas-only-layout" : ""}`}>
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
                          markerHeight="6"
                          markerUnits="userSpaceOnUse"
                          markerWidth="6"
                          orient="auto"
                          refX="5"
                          refY="3"
                        >
                          <path d="M0 0 L6 3 L0 6 Z" fill="#70848a" />
                        </marker>
                      </defs>
                      {edgeLines.map((line) => (
                        <g key={line.key}>
                          <path
                            className="edge-path-hit"
                            d={line.path}
                            fill="none"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNodeSelection([]);
                              setSelectedEdgeKey(line.edgeKey);
                            }}
                            pointerEvents="stroke"
                            stroke="transparent"
                            strokeWidth={(selectedEdgeKey === line.edgeKey ? 3 : 2) + 2}
                          />
                          <path
                            className={selectedEdgeKey === line.edgeKey ? "edge-path selected" : "edge-path"}
                            d={line.path}
                            fill="none"
                            markerEnd="url(#edge-arrow)"
                            pointerEvents="none"
                            stroke={selectedEdgeKey === line.edgeKey ? "#4f83ff" : "#70848a"}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            strokeWidth={selectedEdgeKey === line.edgeKey ? 3 : 2}
                          />
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

                    {graph.nodes.map((node) => {
                      const runState = nodeStates[node.id];
                      const nodeStatus = runState?.status ?? "idle";
                      const isNodeSelected = selectedNodeIds.includes(node.id);
                      const showNodeAnchors = selectedNodeId === node.id || isConnectingDrag;
                      return (
                        <div
                          className={`graph-node node-${node.type} ${isNodeSelected ? "selected" : ""}`}
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
                          style={{ left: node.position.x, top: node.position.y }}
                        >
                          <div className="node-head">
                            <div className="node-head-main">
                              {node.type === "turn" ? (
                                <>
                                  <strong>{turnModelLabel(node)}</strong>
                                  <span className="node-head-subtitle">{turnRoleLabel(node)}</span>
                                </>
                              ) : (
                                <strong>{nodeTypeLabel(node.type)}</strong>
                              )}
                            </div>
                            <button onClick={() => deleteNode(node.id)} type="button">
                              삭제
                            </button>
                          </div>
                          <div className="node-body">
                            <div className="node-summary-row">
                              <div>{nodeCardSummary(node)}</div>
                              <div className={`status-pill status-${nodeStatus}`}>
                                <span className="node-status-text">{nodeStatusLabel(nodeStatus)}</span>
                              </div>
                            </div>
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
                              <div>생성 시간: {formatDuration(runState?.durationMs)}</div>
                              <div>사용량: {formatUsage(runState?.usage)}</div>
                            </div>
                            <div className="node-snippet">
                              {String(
                                extractFinalAnswer(runState?.output) ||
                                  (runState?.logs ?? []).slice(-1)[0] ||
                                  "아직 실행 로그가 없습니다.",
                              ).slice(0, 180)}
                            </div>
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
                          <div className="node-ports">
                            <button className="node-port-btn is-passive" disabled type="button">
                              입력
                            </button>
                            <button className="node-port-btn is-passive" disabled type="button">
                              출력
                            </button>
                          </div>
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
                      className="canvas-icon-btn play"
                      disabled={isGraphRunning || graph.nodes.length === 0}
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
                    onChange={(e) => {
                      setWorkflowQuestion(e.currentTarget.value);
                    }}
                    placeholder="질문 입력"
                    ref={questionInputRef}
                    rows={1}
                    value={workflowQuestion}
                  />
                  <div className="question-input-footer">
                    <button className="primary-action question-create-button" type="button">
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
                    <h3>그래프 도구</h3>
                    <div className="tool-dropdown-group">
                      <h4>노드 선택</h4>
                      <FancySelect
                        ariaLabel="노드 선택"
                        className="modern-select"
                        emptyMessage="선택 가능한 노드가 없습니다."
                        onChange={(value) => {
                          if (value === "turn") {
                            addNode("turn");
                          } else if (value === "transform") {
                            addNode("transform");
                          } else if (value === "gate") {
                            addNode("gate");
                          }
                        }}
                        options={[
                          { value: "turn", label: "응답 에이전트" },
                          { value: "transform", label: "데이터 변환" },
                          { value: "gate", label: "분기" },
                        ]}
                        placeholder="노드 선택"
                        value=""
                      />
                    </div>

                    <div className="tool-dropdown-group">
                      <h4>템플릿</h4>
                      <FancySelect
                        ariaLabel="템플릿 선택"
                        className="modern-select"
                        emptyMessage="선택 가능한 템플릿이 없습니다."
                        onChange={(value) => {
                          if (value === "validation") {
                            applyPreset("validation");
                          } else if (value === "development") {
                            applyPreset("development");
                          } else if (value === "research") {
                            applyPreset("research");
                          } else if (value === "expert") {
                            applyPreset("expert");
                          }
                        }}
                        options={[
                          { value: "validation", label: "검증형 에이전트" },
                          { value: "development", label: "개방형 에이전트" },
                          { value: "research", label: "자료조사 템플릿" },
                          { value: "expert", label: "전문가 템플릿" },
                        ]}
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
                            setGraphFileName(value);
                            loadGraph(value);
                          }
                        }}
                        options={graphFiles.map((file) => ({ value: file, label: file }))}
                        placeholder="그래프 파일 선택"
                        value={graphFiles.includes(graphFileName) ? graphFileName : ""}
                      />
                      <div className="graph-file-actions">
                        <button className="mini-action-button" onClick={saveGraph} type="button">
                          <span className="mini-action-button-label">저장</span>
                        </button>
                        <button className="mini-action-button" onClick={refreshGraphFiles} type="button">
                          <span className="mini-action-button-label">새로고침</span>
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* {!selectedNode && <div className="inspector-empty">노드를 선택하세요.</div>} */}
                  {selectedNode && (
                    <>
                      {selectedNode.type === "turn" && (
                        <section className="inspector-block form-grid">
                          <h3>에이전트 설정</h3>
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
                                    { value: "auto", label: "자동 (GEMINI 우선)" },
                                    { value: "manualPasteText", label: "텍스트 붙여넣기" },
                                    { value: "manualPasteJson", label: "JSON 붙여넣기" },
                                  ]}
                                  value={String(
                                    (selectedNode.config as TurnConfig).webResultMode ??
                                      (selectedTurnExecutor === "web_gemini" ? "auto" : "manualPasteText"),
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
                                GEMINI는 자동 입력/추출을 시도하고, 실패하면 수동 붙여넣기로 폴백합니다.
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

                      {selectedNode.type === "transform" && (
                        <section className="inspector-block form-grid">
                          <h3>변환 규칙</h3>
                          <label>
                            변환 모드
                            <FancySelect
                              ariaLabel="변환 모드"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("mode", next)}
                              options={[
                                { value: "pick", label: "필드 선택" },
                                { value: "merge", label: "병합" },
                                { value: "template", label: "문자열 템플릿" },
                              ]}
                              value={String((selectedNode.config as TransformConfig).mode ?? "pick")}
                            />
                          </label>
                          <label>
                            pick 경로
                            <input
                              onChange={(e) => updateSelectedNodeConfig("pickPath", e.currentTarget.value)}
                              placeholder="예: text 또는 result.finalDraft"
                              value={String((selectedNode.config as TransformConfig).pickPath ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            pick 경로는 입력 JSON에서 필요한 필드만 꺼낼 경로입니다.
                          </div>
                          <label>
                            merge JSON
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("mergeJson", e.currentTarget.value)}
                              placeholder='예: {"source":"web","priority":"high"}'
                              rows={3}
                              value={String((selectedNode.config as TransformConfig).mergeJson ?? "{}")}
                            />
                          </label>
                          <div className="inspector-empty">
                            merge JSON은 입력 데이터에 추가/덮어쓸 고정 JSON 조각입니다.
                          </div>
                          <label>
                            템플릿
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("template", e.currentTarget.value)}
                              rows={3}
                              value={String((selectedNode.config as TransformConfig).template ?? "{{input}}")}
                            />
                          </label>
                        </section>
                      )}

                      {selectedNode.type === "gate" && (
                        <section className="inspector-block form-grid">
                          <h3>분기 설정</h3>
                          <label>
                            분기 경로(decisionPath)
                            <input
                              onChange={(e) => updateSelectedNodeConfig("decisionPath", e.currentTarget.value)}
                              value={String((selectedNode.config as GateConfig).decisionPath ?? "decision")}
                            />
                          </label>
                          <label>
                            PASS 대상 노드
                            <FancySelect
                              ariaLabel="PASS 대상 노드"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("passNodeId", next)}
                              options={[
                                { value: "", label: "(없음)" },
                                ...outgoingFromSelected.map((nodeId) => ({ value: nodeId, label: nodeId })),
                              ]}
                              value={String((selectedNode.config as GateConfig).passNodeId ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            decision 값이 PASS일 때 실행할 다음 노드를 지정합니다.
                          </div>
                          <label>
                            REJECT 대상 노드
                            <FancySelect
                              ariaLabel="REJECT 대상 노드"
                              className="modern-select"
                              onChange={(next) => updateSelectedNodeConfig("rejectNodeId", next)}
                              options={[
                                { value: "", label: "(없음)" },
                                ...outgoingFromSelected.map((nodeId) => ({ value: nodeId, label: nodeId })),
                              ]}
                              value={String((selectedNode.config as GateConfig).rejectNodeId ?? "")}
                            />
                          </label>
                          <div className="inspector-empty">
                            decision 값이 REJECT일 때 실행할 다음 노드를 지정합니다.
                          </div>
                          <label>
                            스키마 JSON (선택)
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("schemaJson", e.currentTarget.value)}
                              rows={4}
                              value={String((selectedNode.config as GateConfig).schemaJson ?? "")}
                            />
                          </label>
                        </section>
                      )}

                      <section className="inspector-block">
                        <h3>노드 로그</h3>
                        <pre>{(selectedNodeState?.logs ?? []).join("\n") || "[로그 없음]"}</pre>
                      </section>

                      <section className="inspector-block">
                        <h3>노드 출력</h3>
                        <pre>{formatUnknown(selectedNodeState?.output) || "[출력 없음]"}</pre>
                      </section>
                    </>
                  )}

                </div>
              </div>
            </aside>}
          </div>
        )}

        {workspaceTab === "history" && (
          <section className="history-layout">
            <article className="panel-card history-list">
              <h2>실행 기록</h2>
              <div className="button-row">
                <button onClick={refreshRunFiles} type="button">
                  새로고침
                </button>
                <button onClick={onOpenRunsFolder} type="button">
                  Finder에서 열기
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
                  {file}
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
                  <div>시작 시간: {selectedRunDetail.startedAt}</div>
                  <div>종료 시간: {selectedRunDetail.finishedAt ?? "-"}</div>
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
                      <h3>상태 전이</h3>
                      <pre>{formatUnknown(selectedRunDetail.transitions)}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>Provider Trace</h3>
                      <pre>{formatUnknown(selectedRunDetail.providerTrace ?? [])}</pre>
                    </div>
                    <div className="history-detail-group">
                      <h3>노드 로그</h3>
                      <pre>{formatUnknown(selectedRunDetail.nodeLogs ?? {})}</pre>
                    </div>
                  </div>
                </>
              )}
            </article>
          </section>
        )}

        {workspaceTab === "settings" && (
          <section className="panel-card settings-view">
            {renderSettingsPanel(false)}
            <section className="workflow-runtime-status">
              <h3>워크플로우 상태</h3>
              <div className="settings-badges">
                <span className="status-tag neutral">
                  로그인: {loginStateLabel(engineStarted, loginCompleted, authMode)}
                </span>
                <span className="status-tag neutral">인증: {authModeLabel(authMode)}</span>
                <span className={`status-tag ${isGraphRunning ? "on" : "off"}`}>
                  실행: {isGraphRunning ? "진행 중" : "대기"}
                </span>
                <span className="status-tag neutral">상태: {status}</span>
                <span className="status-tag neutral">기록: {runFiles.length}</span>
              </div>
            </section>
            {renderWebAutomationPanel()}
            {lastSavedRunFile && <div>최근 실행 파일: {lastSavedRunFile}</div>}
          </section>
        )}

      </section>

      {pendingWebLogin && (
        <div className="modal-backdrop">
          <section className="approval-modal web-turn-modal">
            <h2>로그인이 필요합니다</h2>
            <div>노드: {pendingWebLogin.nodeId}</div>
            <div>서비스: {webProviderLabel(pendingWebLogin.provider)}</div>
            <div>{pendingWebLogin.reason}</div>
            <div className="button-row">
              <button onClick={() => onOpenProviderChildView(pendingWebLogin.provider)} type="button">
                Child View 열기
              </button>
              <button onClick={() => resolvePendingWebLogin(true)} type="button">
                로그인 완료 후 계속
              </button>
              <button onClick={() => resolvePendingWebLogin(false)} type="button">
                수동 입력으로 전환
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
