import {
  FormEvent,
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
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
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

type LoginChatgptResult = {
  authUrl: string;
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

type WorkspaceTab = "workflow" | "history" | "settings" | "dev";
type NodeType = "turn" | "transform" | "gate";
type PortType = "in" | "out";

type GraphNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

type GraphEdge = {
  from: { nodeId: string; port: PortType };
  to: { nodeId: string; port: PortType };
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
};

type TurnTerminal = {
  ok: boolean;
  status: string;
  params: unknown;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
};

type PanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type TurnConfig = {
  model?: string;
  cwd?: string;
  promptTemplate?: string;
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
const GRAPH_STAGE_WIDTH = 2600;
const GRAPH_STAGE_HEIGHT = 1800;
const GRAPH_PAN_PADDING = 900;
const MIN_CANVAS_ZOOM = 0.6;
const MAX_CANVAS_ZOOM = 1.8;
const TURN_MODEL_OPTIONS = [
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-5.1-codex-mini",
] as const;
const TRUSTED_AUTH_HOSTS = ["chatgpt.com", "openai.com", "auth.openai.com"] as const;

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

function formatFinishedAt(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleTimeString("ko-KR", { hour12: false });
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

function makeNodeId(type: NodeType): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}-${suffix}`;
}

function defaultNodeConfig(type: NodeType): Record<string, unknown> {
  if (type === "turn") {
    return {
      model: TURN_MODEL_OPTIONS[0],
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
    return `모델: ${String(config.model ?? TURN_MODEL_OPTIONS[0])}`;
  }
  if (node.type === "transform") {
    const config = node.config as TransformConfig;
    return `모드: ${String(config.mode ?? "pick")}`;
  }
  const config = node.config as GateConfig;
  return `분기 경로: ${String(config.decisionPath ?? "decision")}`;
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
  if (status === "done") {
    return "완료";
  }
  if (status === "failed") {
    return "실패";
  }
  if (status === "skipped") {
    return "건너뜀";
  }
  return "취소됨";
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
  if (tab === "dev") {
    return (
      <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
        <path d="M6 8L3 12l3 4M18 8l3 4-3 4M14 5l-4 14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
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

function validateAuthUrl(input: string): { ok: boolean; normalized?: string; reason?: string } {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: "빈 URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "URL 형식 오류" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `허용되지 않은 프로토콜(${parsed.protocol})` };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "인증 정보가 포함된 URL은 허용되지 않음" };
  }

  const host = parsed.hostname.toLowerCase();
  const trusted = TRUSTED_AUTH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  if (!trusted) {
    return { ok: false, reason: `허용되지 않은 인증 도메인(${host})` };
  }

  return { ok: true, normalized: parsed.toString() };
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
      model: "gpt-5.1-codex-mini",
      cwd: ".",
      promptTemplate:
        "질문을 분석하고 검증 계획을 3개 불릿으로 요약해줘. 입력 질문: {{input}}",
    }),
    makePresetNode("turn-search-a", "turn", 420, 40, {
      model: "gpt-5.2",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 찬성 근거를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-search-b", "turn", 420, 220, {
      model: "gpt-5.2-codex",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 반대 근거/한계를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-judge", "turn", 720, 120, {
      model: "gpt-5.3-codex",
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
      model: "gpt-5.3-codex",
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

  return { version: 1, nodes, edges };
}

function buildDevelopmentPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-requirements", "turn", 120, 120, {
      model: "gpt-5.1-codex-mini",
      cwd: ".",
      promptTemplate:
        "요구사항을 기능/비기능으로 분해하고 우선순위를 매겨줘. 질문: {{input}}",
    }),
    makePresetNode("turn-architecture", "turn", 420, 40, {
      model: "gpt-5.2",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 풀스택 아키텍처를 제안해 JSON으로 출력해줘. {{input}}",
    }),
    makePresetNode("turn-implementation", "turn", 420, 220, {
      model: "gpt-5.2-codex",
      cwd: ".",
      promptTemplate:
        "구현 단계 계획(파일 단위 포함)을 작성해줘. 입력: {{input}}",
    }),
    makePresetNode("turn-evaluator", "turn", 720, 120, {
      model: "gpt-5.3-codex",
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
      model: "gpt-5.3-codex",
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

  return { version: 1, nodes, edges };
}

function normalizeGraph(input: unknown): GraphData {
  if (!input || typeof input !== "object") {
    return { version: 1, nodes: [], edges: [] };
  }

  const data = input as Record<string, unknown>;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];

  return {
    version: typeof data.version === "number" ? data.version : 1,
    nodes: nodes.filter(Boolean) as GraphNode[],
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
  const [isInspectorWide, setIsInspectorWide] = useState(false);

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState<string>(TURN_MODEL_OPTIONS[0]);
  const [workflowQuestion, setWorkflowQuestion] = useState(
    "언어 학습에서 AI가 기존 학습 패러다임을 어떻게 개선할 수 있는지 분석해줘.",
  );
  const [threadId, setThreadId] = useState("");
  const [text, setText] = useState("안녕하세요. 지금 상태를 3줄로 요약해줘.");

  const [engineStarted, setEngineStarted] = useState(false);
  const [status, setStatus] = useState("대기 중");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [authUrl, setAuthUrl] = useState("");
  const [usageSourceMethod, setUsageSourceMethod] = useState("");
  const [usageInfoText, setUsageInfoText] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("unknown");
  const [loginCompleted, setLoginCompleted] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const [graph, setGraph] = useState<GraphData>({ version: 1, nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>("");
  const [graphFileName, setGraphFileName] = useState("sample.json");
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
  const [isNavClosed, setIsNavClosed] = useState(false);
  const [undoStack, setUndoStack] = useState<GraphData[]>([]);
  const [redoStack, setRedoStack] = useState<GraphData[]>([]);

  const dragRef = useRef<DragState | null>(null);
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const dragStartSnapshotRef = useRef<GraphData | null>(null);
  const cancelRequestedRef = useRef(false);
  const activeTurnNodeIdRef = useRef<string>("");
  const turnTerminalResolverRef = useRef<((terminal: TurnTerminal) => void) | null>(null);
  const activeRunDeltaRef = useRef<Record<string, string>>({});
  const collectingRunRef = useRef(false);
  const runLogCollectorRef = useRef<Record<string, string[]>>({});

  const activeApproval = pendingApprovals[0];
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

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

    const attach = async () => {
      const unlistenNotification = await listen<EngineNotificationEvent>(
        "engine://notification",
        (event) => {
          try {
            const payload = event.payload;
            const now = new Date().toLocaleTimeString();
            const line = `[${now}] ${payload.method} ${formatUnknown(payload.params)}`;

            setEvents((prev) => [line, ...prev].slice(0, 200));

            if (payload.method === "item/agentMessage/delta") {
              const delta = extractDeltaText(payload.params);
              const activeNodeId = activeTurnNodeIdRef.current;
              if (activeNodeId && delta) {
                activeRunDeltaRef.current[activeNodeId] =
                  (activeRunDeltaRef.current[activeNodeId] ?? "") + delta;
                addNodeLog(activeNodeId, delta);
              }
              if (delta) {
                setStreamText((prev) => prev + delta);
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
              setAuthMode("unknown");
              setLoginCompleted(false);
              setUsageSourceMethod("");
              setUsageInfoText("");
              setPendingApprovals([]);
              setApprovalSubmitting(false);
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
      setStatus("중지됨");
      setRunning(false);
      setIsGraphRunning(false);
      setUsageSourceMethod("");
      setUsageInfoText("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onLoginChatgpt() {
    setError("");
    setLoginCompleted(false);
    try {
      await ensureEngineStarted();
      const result = await invoke<LoginChatgptResult>("login_chatgpt");
      setAuthUrl(result.authUrl);
      const validation = validateAuthUrl(result.authUrl);
      if (!validation.ok || !validation.normalized) {
        setStatus("인증 URL 검증 실패, 수동 진행 필요");
        setError(`authUrl validation failed: ${validation.reason ?? "unknown reason"}`);
        return;
      }
      setStatus("인증 URL 수신");
      try {
        await openUrl(validation.normalized);
        setStatus("외부 브라우저에서 인증 URL 열림");
      } catch (openErr) {
        setStatus("브라우저 열기 실패, URL 복사 후 수동 진행");
        setError(`openUrl failed: ${String(openErr)}`);
      }
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

  async function onCopyAuthUrl() {
    if (!authUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(authUrl);
      setStatus("인증 URL 복사 완료");
    } catch (e) {
      setError(`clipboard copy failed: ${String(e)}`);
    }
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

  function addNode(type: NodeType) {
    applyGraphChange((prev) => {
      const index = prev.nodes.length;
      const node: GraphNode = {
        id: makeNodeId(type),
        type,
        position: {
          x: 40 + (index % 4) * 280,
          y: 40 + Math.floor(index / 4) * 180,
        },
        config: defaultNodeConfig(type),
      };
      return {
        ...prev,
        nodes: [...prev.nodes, node],
      };
    });
  }

  function applyPreset(kind: "validation" | "development") {
    const preset = kind === "validation" ? buildValidationPreset() : buildDevelopmentPreset();
    setGraph(cloneGraph(preset));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedNodeId(preset.nodes[0]?.id ?? "");
    setNodeStates({});
    setConnectFromNodeId("");
    setStatus(
      kind === "validation"
        ? "검증형 5-에이전트 프리셋 로드됨"
        : "개발형 5-에이전트 프리셋 로드됨",
    );
  }

  function deleteNode(nodeId: string) {
    applyGraphChange((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.from.nodeId !== nodeId && e.to.nodeId !== nodeId),
    }));
    setSelectedNodeId((prev) => (prev === nodeId ? "" : prev));
    setNodeStates((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  }

  function onPortOutClick(nodeId: string) {
    setConnectFromNodeId(nodeId);
  }

  function onPortInClick(targetNodeId: string) {
    if (!connectFromNodeId || connectFromNodeId === targetNodeId) {
      return;
    }

    applyGraphChange((prev) => {
      const exists = prev.edges.some(
        (edge) => edge.from.nodeId === connectFromNodeId && edge.to.nodeId === targetNodeId,
      );
      if (exists) {
        return prev;
      }
      const edge: GraphEdge = {
        from: { nodeId: connectFromNodeId, port: "out" },
        to: { nodeId: targetNodeId, port: "in" },
      };
      return { ...prev, edges: [...prev.edges, edge] };
    });
    setConnectFromNodeId("");
  }

  function clampCanvasZoom(nextZoom: number): number {
    return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, nextZoom));
  }

  function clientToCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const stageOffset = GRAPH_PAN_PADDING / 2;
    return {
      x: (clientX - rect.left + canvas.scrollLeft - stageOffset) / canvasZoom,
      y: (clientY - rect.top + canvas.scrollTop - stageOffset) / canvasZoom,
    };
  }

  function zoomAtClientPoint(nextZoom: number, clientX: number, clientY: number) {
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      setCanvasZoom(nextZoom);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const stageOffset = GRAPH_PAN_PADDING / 2;
    const pointerX = clientX - rect.left + canvas.scrollLeft;
    const pointerY = clientY - rect.top + canvas.scrollTop;
    const logicalX = (pointerX - stageOffset) / canvasZoom;
    const logicalY = (pointerY - stageOffset) / canvasZoom;

    setCanvasZoom(nextZoom);
    requestAnimationFrame(() => {
      const currentCanvas = graphCanvasRef.current;
      if (!currentCanvas) {
        return;
      }
      currentCanvas.scrollLeft = logicalX * nextZoom + stageOffset - (clientX - rect.left);
      currentCanvas.scrollTop = logicalY * nextZoom + stageOffset - (clientY - rect.top);
    });
  }

  function onNodeDragStart(e: ReactMouseEvent<HTMLDivElement>, nodeId: string) {
    if (panMode) {
      return;
    }

    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    const canvasPoint = clientToCanvasPoint(e.clientX, e.clientY);
    if (!canvasPoint) {
      return;
    }

    dragStartSnapshotRef.current = cloneGraph(graph);

    dragRef.current = {
      nodeId,
      offsetX: canvasPoint.x - node.position.x,
      offsetY: canvasPoint.y - node.position.y,
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

    if (!dragRef.current) {
      return;
    }

    const canvasPoint = clientToCanvasPoint(e.clientX, e.clientY);
    if (!canvasPoint) {
      return;
    }

    const { nodeId, offsetX, offsetY } = dragRef.current;
    const x = Math.max(0, canvasPoint.x - offsetX);
    const y = Math.max(0, canvasPoint.y - offsetY);

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === nodeId ? { ...node, position: { x, y } } : node,
      ),
    }));
  }

  function onCanvasMouseUp() {
    panRef.current = null;
    const dragSnapshot = dragStartSnapshotRef.current;
    if (dragSnapshot && !graphEquals(dragSnapshot, graph)) {
      setUndoStack((stack) => [...stack.slice(-79), cloneGraph(dragSnapshot)]);
      setRedoStack([]);
    }
    dragStartSnapshotRef.current = null;
    dragRef.current = null;
  }

  function onCanvasMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (!panMode) {
      return;
    }
    const canvas = graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-zoom-controls, .canvas-runbar")) {
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
    setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
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
    setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
  }

  function onCanvasZoomOut() {
    const nextZoom = clampCanvasZoom(canvasZoom * 0.92);
    if (nextZoom === canvasZoom) {
      return;
    }
    zoomAtCanvasCenter(nextZoom);
    setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
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
      setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
      return;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      const nextZoom = clampCanvasZoom(canvasZoom * 0.92);
      zoomAtClientPoint(nextZoom, centerX, centerY);
      setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
      return;
    }

    if (e.key === "0") {
      e.preventDefault();
      zoomAtClientPoint(1, centerX, centerY);
      setStatus("그래프 배율 100%");
    }
  }

  function updateSelectedNodeConfig(key: string, value: string) {
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
      await invoke("graph_save", {
        name: graphFileName,
        graph,
      });
      await refreshGraphFiles();
      setStatus(`그래프 저장 완료 (${graphFileName})`);
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
      setSelectedNodeId(normalized.nodes[0]?.id ?? "");
      setNodeStates({});
      setStatus(`그래프 불러오기 완료 (${target})`);
      setGraphFileName(target);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    const exists = graph.nodes.some((node) => node.id === selectedNodeId);
    if (!exists) {
      setSelectedNodeId("");
    }
  }, [graph.nodes, selectedNodeId]);

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
  }> {
    const config = node.config as TurnConfig;
    const nodeModel = String(config.model ?? model).trim() || model;
    const nodeCwd = String(config.cwd ?? cwd).trim() || cwd;
    const promptTemplate = String(config.promptTemplate ?? "{{input}}");

    const inputText = stringifyInput(input);
    const textToSend = promptTemplate.includes("{{input}}")
      ? replaceInputPlaceholder(promptTemplate, inputText)
      : `${promptTemplate}${inputText ? `\n${inputText}` : ""}`;

    let activeThreadId = extractStringByPaths(nodeStates[node.id], ["threadId"]);
    if (!activeThreadId) {
      const threadStart = await invoke<ThreadStartResult>("thread_start", {
        model: nodeModel,
        cwd: nodeCwd,
      });
      activeThreadId = threadStart.threadId;
    }

    if (!activeThreadId) {
      return { ok: false, error: "threadId를 가져오지 못했습니다." };
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
    };

    try {
      await ensureEngineStarted();

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
      setError(String(e));
      setStatus("그래프 실행 실패");
    } finally {
      turnTerminalResolverRef.current = null;
      activeTurnNodeIdRef.current = "";
      setIsGraphRunning(false);
      cancelRequestedRef.current = false;
      collectingRunRef.current = false;
    }
  }

  async function onCancelGraphRun() {
    cancelRequestedRef.current = true;
    setStatus("취소 요청됨");

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

  async function onRunTurnDev(e: FormEvent) {
    e.preventDefault();
    setError("");
    setRunning(true);

    try {
      await ensureEngineStarted();

      let activeThreadId = threadId.trim();
      if (!activeThreadId) {
        const result = await invoke<ThreadStartResult>("thread_start", {
          model,
          cwd,
        });
        activeThreadId = result.threadId;
        setThreadId(activeThreadId);
      }

      setStreamText((prev) => (prev ? `${prev}\n\n` : prev));
      await invoke("turn_start", {
        threadId: activeThreadId,
        text,
      });
      setStatus(`개발 테스트 실행 시작 (스레드: ${activeThreadId})`);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onInterruptDev() {
    if (!threadId.trim()) {
      return;
    }
    setError("");
    try {
      await invoke("turn_interrupt", { threadId });
      setStatus("중단 요청됨");
    } catch (e) {
      setError(String(e));
    }
  }

  function renderSettingsPanel(compact = false) {
    return (
      <section className={`controls ${compact ? "settings-compact" : ""}`}>
        <h2>엔진 및 계정</h2>
        <div className="settings-badges">
          <span className={`status-tag ${engineStarted ? "on" : "off"}`}>
            {engineStarted ? "엔진 연결됨" : "엔진 대기"}
          </span>
          <span className={`status-tag ${loginCompleted ? "on" : "off"}`}>
            {loginCompleted ? "로그인 완료" : "로그인 필요"}
          </span>
          <span className="status-tag neutral">인증: {authModeLabel(authMode)}</span>
        </div>
        <label>
          작업 경로(CWD)
          <input value={cwd} onChange={(e) => setCwd(e.currentTarget.value)} />
        </label>
        <label>
          기본 모델
          <select className="modern-select" value={model} onChange={(e) => setModel(e.currentTarget.value)}>
            {TURN_MODEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <button onClick={onStartEngine} disabled={running || isGraphRunning} type="button">
            엔진 시작
          </button>
          <button onClick={onStopEngine} type="button">
            엔진 중지
          </button>
          <button onClick={onLoginChatgpt} disabled={running || isGraphRunning} type="button">
            ChatGPT 로그인
          </button>
          <button onClick={onCheckUsage} disabled={running || isGraphRunning} type="button">
            사용량 확인
          </button>
        </div>
        {authUrl && (
          <div className="auth-url-box">
            <span>인증 URL</span>
            <code>{authUrl}</code>
            <button onClick={onCopyAuthUrl} type="button">
              복사
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

  const edgeLines = graph.edges
    .map((edge, index) => {
      const fromNode = graph.nodes.find((node) => node.id === edge.from.nodeId);
      const toNode = graph.nodes.find((node) => node.id === edge.to.nodeId);
      if (!fromNode || !toNode) {
        return null;
      }

      const x1 = fromNode.position.x + NODE_WIDTH;
      const y1 = fromNode.position.y + NODE_HEIGHT / 2;
      const x2 = toNode.position.x;
      const y2 = toNode.position.y + NODE_HEIGHT / 2;
      const direction = x2 >= x1 ? 1 : -1;
      const horizontalGap = Math.max(64, Math.min(180, Math.abs(x2 - x1) * 0.5));
      const bendX = x1 + horizontalGap * direction;
      const arrowLeadX = x2 - 12 * direction;
      const path = `M ${x1} ${y1} L ${bendX} ${y1} L ${bendX} ${y2} L ${arrowLeadX} ${y2} L ${x2} ${y2}`;

      return {
        key: `${edge.from.nodeId}-${edge.to.nodeId}-${index}`,
        path,
      };
    })
    .filter(Boolean) as Array<{ key: string; path: string }>;

  const selectedNodeState = selectedNodeId ? nodeStates[selectedNodeId] : undefined;
  const outgoingFromSelected = selectedNode
    ? graph.edges
        .filter((edge) => edge.from.nodeId === selectedNode.id)
        .map((edge) => edge.to.nodeId)
        .filter((value, index, arr) => arr.indexOf(value) === index)
    : [];
  const isActiveTab = (tab: WorkspaceTab): boolean => workspaceTab === tab;

  return (
    <main
      className={`app-shell ${canvasFullscreen ? "canvas-fullscreen-mode" : ""}`}
      style={isNavClosed ? { gridTemplateColumns: "0 minmax(0, 1fr)", gap: 0 } : undefined}
    >
      {isNavClosed && (
        <button
          onClick={() => setIsNavClosed(false)}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 60,
            width: 34,
            height: 34,
            padding: 0,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(205,212,224,0.95)",
            boxShadow: "0 4px 10px rgba(16, 23, 31, 0.14)",
          }}
          title="왼쪽 메뉴 열기"
          type="button"
        >
          <img alt="" aria-hidden="true" src="/nav-open.svg" style={{ width: 16, height: 16 }} />
        </button>
      )}
      <aside
        className="left-nav"
        style={
          isNavClosed
            ? {
                width: 0,
                minWidth: 0,
                padding: 0,
                border: 0,
                opacity: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }
            : undefined
        }
      >
        <button
          onClick={() => setIsNavClosed(true)}
          style={{
            width: 34,
            height: 34,
            padding: 0,
            borderRadius: "50%",
            justifySelf: "center",
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(205,212,224,0.95)",
            boxShadow: "0 2px 8px rgba(16, 23, 31, 0.12)",
            display: isNavClosed ? "none" : "inline-grid",
            placeItems: "center",
          }}
          title="왼쪽 메뉴 닫기"
          type="button"
        >
          <img alt="" aria-hidden="true" src="/nav-closed.svg" style={{ width: 16, height: 16 }} />
        </button>
        <nav
          className="nav-list"
          style={{
            alignContent: "center",
            height: "100%",
            display: isNavClosed ? "none" : "grid",
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
            className={isActiveTab("dev") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("dev")}
            aria-label="개발"
            title="개발"
            type="button"
          >
            <span className="nav-icon"><NavIcon tab="dev" /></span>
            <span className="nav-label">개발</span>
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

        {error && <div className="error">오류: {error}</div>}

        {workspaceTab === "workflow" && (
          <div
            className={`workflow-layout ${isInspectorWide ? "inspector-wide" : ""} ${
              canvasFullscreen ? "canvas-only-layout" : ""
            }`}
          >
            <section className="canvas-pane">
              <div
                className={`graph-canvas ${panMode ? "pan-mode" : ""}`}
                onKeyDown={onCanvasKeyDown}
                onMouseDown={onCanvasMouseDown}
                onMouseLeave={onCanvasMouseUp}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
                onWheel={onCanvasWheel}
                ref={graphCanvasRef}
                tabIndex={0}
              >
                <div className="canvas-overlay">
                  <div className="canvas-zoom-controls">
                    <button onClick={onCanvasZoomIn} type="button">
                      +
                    </button>
                    <button onClick={onCanvasZoomOut} type="button">
                      −
                    </button>
                    <button
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
                      className={panMode ? "is-active" : ""}
                      onClick={() => setPanMode((prev) => !prev)}
                      title="캔버스 이동"
                      type="button"
                    >
                      ↕
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

                <div
                  className="graph-stage-shell"
                  style={{
                    width: Math.round(GRAPH_STAGE_WIDTH * canvasZoom + GRAPH_PAN_PADDING),
                    height: Math.round(GRAPH_STAGE_HEIGHT * canvasZoom + GRAPH_PAN_PADDING),
                  }}
                >
                  <div
                    className="graph-stage"
                    style={{
                      left: GRAPH_PAN_PADDING / 2,
                      top: GRAPH_PAN_PADDING / 2,
                      transform: `scale(${canvasZoom})`,
                      width: GRAPH_STAGE_WIDTH,
                      height: GRAPH_STAGE_HEIGHT,
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
                        <path
                          d={line.path}
                          fill="none"
                          key={line.key}
                          markerEnd="url(#edge-arrow)"
                          stroke="#70848a"
                          strokeWidth={2}
                        />
                      ))}
                    </svg>

                    {graph.nodes.map((node) => {
                      const runState = nodeStates[node.id];
                      const nodeStatus = runState?.status ?? "idle";
                      return (
                        <div
                          className={`graph-node node-${node.type} ${selectedNodeId === node.id ? "selected" : ""}`}
                          key={node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                          style={{ left: node.position.x, top: node.position.y }}
                        >
                          <div className="node-head" onMouseDown={(e) => onNodeDragStart(e, node.id)}>
                            <strong>{nodeTypeLabel(node.type)}</strong>
                            <button onClick={() => deleteNode(node.id)} type="button">
                              삭제
                            </button>
                          </div>
                          <div className="node-body">
                            <div className="node-id">{node.id}</div>
                            <div className={`status-pill status-${nodeStatus}`}>
                              {nodeStatusLabel(nodeStatus)}
                            </div>
                            <div>{nodeCardSummary(node)}</div>
                            <div className="node-runtime-meta">
                              <div>완료 여부: {nodeStatus === "done" ? "완료" : nodeStatus === "failed" ? "실패" : "대기"}</div>
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
                          <div className="node-ports">
                            <button onClick={() => onPortInClick(node.id)} type="button">
                              입력
                            </button>
                            <button onClick={() => onPortOutClick(node.id)} type="button">
                              {connectFromNodeId === node.id ? "출력*" : "출력"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="canvas-topbar">
                <label className="question-input">
                  질문 입력
                  <textarea
                    onChange={(e) => setWorkflowQuestion(e.currentTarget.value)}
                    rows={3}
                    value={workflowQuestion}
                  />
                </label>
                <div className="canvas-topbar-actions">
                  <button className="primary-action" type="button">
                    생성
                  </button>
                </div>
              </div>
            </section>

            {!canvasFullscreen && <aside className="inspector-pane">
              <div className="inspector-head">
                <div className="inspector-title-chip">노드 설정</div>
                <button
                  className="inspector-resize"
                  onClick={() => setIsInspectorWide((prev) => !prev)}
                  title={isInspectorWide ? "패널 폭 줄이기" : "패널 폭 넓히기"}
                  type="button"
                >
                  ↔
                </button>
              </div>
              <div className="inspector-content">
                <div className="inspector-section">
                  <section className="inspector-block">
                    <h3>그래프 도구</h3>
                    <div className="button-row">
                      <button onClick={() => addNode("turn")} type="button">
                        + 응답 에이전트
                      </button>
                      <button onClick={() => addNode("transform")} type="button">
                        + 데이터 변환
                      </button>
                      <button onClick={() => addNode("gate")} type="button">
                        + 분기
                      </button>
                      <button disabled={!connectFromNodeId} onClick={() => setConnectFromNodeId("")} type="button">
                        연결 취소
                      </button>
                    </div>

                    <div className="button-row">
                      <button onClick={() => applyPreset("validation")} type="button">
                        검증형 5에이전트
                      </button>
                      <button onClick={() => applyPreset("development")} type="button">
                        개발형 5에이전트
                      </button>
                    </div>

                    <div className="save-row">
                      <input
                        value={graphFileName}
                        onChange={(e) => setGraphFileName(e.currentTarget.value)}
                        placeholder="저장할 그래프 파일 이름"
                      />
                      <button onClick={saveGraph} type="button">
                        저장
                      </button>
                      <button onClick={() => loadGraph()} type="button">
                        불러오기
                      </button>
                      <button onClick={refreshGraphFiles} type="button">
                        새로고침
                      </button>
                      <select
                        className="graph-file-select modern-select"
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          if (value) {
                            loadGraph(value);
                          }
                        }}
                        value=""
                      >
                        <option value="">그래프 파일 선택</option>
                        {graphFiles.map((file) => (
                          <option key={file} value={file}>
                            {file}
                          </option>
                        ))}
                      </select>
                    </div>
                  </section>

                  {!selectedNode && <div className="inspector-empty">노드를 선택하세요.</div>}
                  {selectedNode && (
                    <>
                      <section className="inspector-block inspector-summary">
                        <div>
                          <strong>{selectedNode.id}</strong>
                        </div>
                        <div>유형: {nodeTypeLabel(selectedNode.type)}</div>
                        <div className={`status-pill status-${selectedNodeState?.status ?? "idle"}`}>
                          상태: {nodeStatusLabel(selectedNodeState?.status ?? "idle")}
                        </div>
                        <div>완료 여부: {(selectedNodeState?.status ?? "idle") === "done" ? "완료" : "미완료"}</div>
                        <div>생성 시간: {formatDuration(selectedNodeState?.durationMs)}</div>
                        <div>완료 시각: {formatFinishedAt(selectedNodeState?.finishedAt)}</div>
                        <div>사용량: {formatUsage(selectedNodeState?.usage)}</div>
                      </section>

                      {selectedNode.type === "turn" && (
                        <section className="inspector-block form-grid">
                          <h3>모델 설정</h3>
                          <label>
                            모델
                            <select
                              className="modern-select"
                              onChange={(e) => updateSelectedNodeConfig("model", e.currentTarget.value)}
                              value={String((selectedNode.config as TurnConfig).model ?? model)}
                            >
                              {TURN_MODEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            작업 경로
                            <input
                              onChange={(e) => updateSelectedNodeConfig("cwd", e.currentTarget.value)}
                              value={String((selectedNode.config as TurnConfig).cwd ?? cwd)}
                            />
                          </label>
                          <label>
                            프롬프트 템플릿
                            <textarea
                              onChange={(e) =>
                                updateSelectedNodeConfig("promptTemplate", e.currentTarget.value)
                              }
                              rows={3}
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
                            <select
                              className="modern-select"
                              onChange={(e) => updateSelectedNodeConfig("mode", e.currentTarget.value)}
                              value={String((selectedNode.config as TransformConfig).mode ?? "pick")}
                            >
                              <option value="pick">필드 선택</option>
                              <option value="merge">병합</option>
                              <option value="template">문자열 템플릿</option>
                            </select>
                          </label>
                          <label>
                            pick 경로
                            <input
                              onChange={(e) => updateSelectedNodeConfig("pickPath", e.currentTarget.value)}
                              value={String((selectedNode.config as TransformConfig).pickPath ?? "")}
                            />
                          </label>
                          <label>
                            merge JSON
                            <textarea
                              onChange={(e) => updateSelectedNodeConfig("mergeJson", e.currentTarget.value)}
                              rows={3}
                              value={String((selectedNode.config as TransformConfig).mergeJson ?? "{}")}
                            />
                          </label>
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
                            <select
                              className="modern-select"
                              onChange={(e) => updateSelectedNodeConfig("passNodeId", e.currentTarget.value)}
                              value={String((selectedNode.config as GateConfig).passNodeId ?? "")}
                            >
                              <option value="">(없음)</option>
                              {outgoingFromSelected.map((nodeId) => (
                                <option key={nodeId} value={nodeId}>
                                  {nodeId}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            REJECT 대상 노드
                            <select
                              className="modern-select"
                              onChange={(e) => updateSelectedNodeConfig("rejectNodeId", e.currentTarget.value)}
                              value={String((selectedNode.config as GateConfig).rejectNodeId ?? "")}
                            >
                              <option value="">(없음)</option>
                              {outgoingFromSelected.map((nodeId) => (
                                <option key={nodeId} value={nodeId}>
                                  {nodeId}
                                </option>
                              ))}
                            </select>
                          </label>
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
                        <pre>{(selectedNodeState?.logs ?? []).join("\n") || "(로그 없음)"}</pre>
                      </section>

                      <section className="inspector-block">
                        <h3>노드 출력</h3>
                        <pre>{formatUnknown(selectedNodeState?.output) || "(출력 없음)"}</pre>
                      </section>
                    </>
                  )}

                  <section className="inspector-block">{renderSettingsPanel(true)}</section>
                  <section className="inspector-block workflow-runtime-status">
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
              {runFiles.length === 0 && <div>(실행 기록 파일 없음)</div>}
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
                  <h2>실행 상세</h2>
                  <div>실행 ID: {selectedRunDetail.runId}</div>
                  <div>시작 시간: {selectedRunDetail.startedAt}</div>
                  <div>종료 시간: {selectedRunDetail.finishedAt ?? "-"}</div>
                  <h3>질문</h3>
                  <pre>{selectedRunDetail.question || "(비어 있음)"}</pre>
                  <h3>최종 답변</h3>
                  <pre>{selectedRunDetail.finalAnswer || "(없음)"}</pre>
                  <h3>요약 로그</h3>
                  <pre>{selectedRunDetail.summaryLogs.join("\n") || "(없음)"}</pre>
                  <h3>상태 전이</h3>
                  <pre>{formatUnknown(selectedRunDetail.transitions)}</pre>
                  <h3>노드 로그</h3>
                  <pre>{formatUnknown(selectedRunDetail.nodeLogs ?? {})}</pre>
                </>
              )}
            </article>
          </section>
        )}

        {workspaceTab === "settings" && (
          <section className="panel-card settings-view">
            {renderSettingsPanel()}
            {lastSavedRunFile && <div>최근 실행 파일: {lastSavedRunFile}</div>}
          </section>
        )}

        {workspaceTab === "dev" && (
          <section className="workflow-layout dev-layout">
            <article className="panel-card">
              <h2>개발용 단일 턴 테스트</h2>
              <label>
                스레드 ID
                <input
                  onChange={(e) => setThreadId(e.currentTarget.value)}
                  placeholder="thread_start 결과가 자동 입력됩니다"
                  value={threadId}
                />
              </label>

              <form className="prompt" onSubmit={onRunTurnDev}>
                <label>
                  입력
                  <textarea onChange={(e) => setText(e.currentTarget.value)} rows={4} value={text} />
                </label>
                <div className="button-row">
                  <button disabled={running || !text.trim()} type="submit">
                    {running ? "실행 중..." : "실행"}
                  </button>
                  <button disabled={!threadId} onClick={onInterruptDev} type="button">
                    중단
                  </button>
                </div>
              </form>

              <h3>스트리밍 출력</h3>
              <pre>{streamText || "(item/agentMessage/delta를 기다리는 중...)"}</pre>
            </article>

            <article className="panel-card">
              <h2>알림 이벤트</h2>
              <pre>{events.join("\n") || "(아직 이벤트 없음)"}</pre>
            </article>
          </section>
        )}
      </section>

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
