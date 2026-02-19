import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
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

type NodeRunState = {
  status: NodeExecutionStatus;
  logs: string[];
  output?: unknown;
  error?: string;
  threadId?: string;
  turnId?: string;
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

function formatUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

function makeNodeId(type: NodeType): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}-${suffix}`;
}

function defaultNodeConfig(type: NodeType): Record<string, unknown> {
  if (type === "turn") {
    return {
      model: "gpt-5-codex",
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
    return `모델: ${String(config.model ?? "gpt-5-codex")}`;
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

function authModeLabel(mode: AuthMode): string {
  if (mode === "chatgpt") {
    return "챗지피티";
  }
  if (mode === "apikey") {
    return "API 키";
  }
  return "미확인";
}

function completedStatusLabel(status: string): string {
  const map: Record<string, string> = {
    unknown: "미확인",
    completed: "완료",
    done: "완료",
    failed: "실패",
    cancelled: "취소됨",
    rejected: "거절됨",
    success: "성공",
    succeeded: "성공",
  };
  return map[status.toLowerCase()] ?? status;
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
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "질문을 분석하고 검증 계획을 3개 불릿으로 요약해줘. 입력 질문: {{input}}",
    }),
    makePresetNode("turn-search-a", "turn", 420, 40, {
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 찬성 근거를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-search-b", "turn", 420, 220, {
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "입력 내용을 바탕으로 반대 근거/한계를 조사해 JSON으로 정리해줘. {{input}}",
    }),
    makePresetNode("turn-judge", "turn", 720, 120, {
      model: "gpt-5-codex",
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
      model: "gpt-5-codex",
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
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "요구사항을 기능/비기능으로 분해하고 우선순위를 매겨줘. 질문: {{input}}",
    }),
    makePresetNode("turn-architecture", "turn", 420, 40, {
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 풀스택 아키텍처를 제안해 JSON으로 출력해줘. {{input}}",
    }),
    makePresetNode("turn-implementation", "turn", 420, 220, {
      model: "gpt-5-mini",
      cwd: ".",
      promptTemplate:
        "구현 단계 계획(파일 단위 포함)을 작성해줘. 입력: {{input}}",
    }),
    makePresetNode("turn-evaluator", "turn", 720, 120, {
      model: "gpt-5-codex",
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
      model: "gpt-5-codex",
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
  const [headerSearch, setHeaderSearch] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"config" | "layers">("config");

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("gpt-5-codex");
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
  const [lastCompletedStatus, setLastCompletedStatus] = useState("미확인");
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

  const dragRef = useRef<DragState | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const attach = async () => {
      const unlistenNotification = await listen<EngineNotificationEvent>(
        "engine://notification",
        (event) => {
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

          if (payload.method === "item/completed") {
            const completedStatus = extractCompletedStatus(payload.params) ?? "unknown";
            setLastCompletedStatus(completedStatus);
          }

          const terminal = isTurnTerminalEvent(payload.method, payload.params);
          if (terminal && turnTerminalResolverRef.current) {
            const resolve = turnTerminalResolverRef.current;
            turnTerminalResolverRef.current = null;
            resolve(terminal);
          }
        },
      );

      const unlistenApprovalRequest = await listen<EngineApprovalRequestEvent>(
        "engine://approval_request",
        (event) => {
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
        },
      );

      const unlistenLifecycle = await listen<EngineLifecycleEvent>(
        "engine://lifecycle",
        (event) => {
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
        setError(`event listen failed: ${String(e)}`);
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
      setStatus("인증 URL 수신");
      try {
        await openUrl(result.authUrl);
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
    setGraph((prev) => {
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
    setGraph(preset);
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
    setGraph((prev) => ({
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

    setGraph((prev) => {
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

  function deleteEdge(index: number) {
    setGraph((prev) => ({
      ...prev,
      edges: prev.edges.filter((_, i) => i !== index),
    }));
  }

  function onNodeDragStart(e: ReactMouseEvent<HTMLDivElement>, nodeId: string) {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    dragRef.current = {
      nodeId,
      offsetX: e.clientX - node.position.x,
      offsetY: e.clientY - node.position.y,
    };
  }

  function onCanvasMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      return;
    }

    const { nodeId, offsetX, offsetY } = dragRef.current;
    const x = Math.max(0, e.clientX - offsetX);
    const y = Math.max(0, e.clientY - offsetY);

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === nodeId ? { ...node, position: { x, y } } : node,
      ),
    }));
  }

  function onCanvasMouseUp() {
    dragRef.current = null;
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
      setGraph(normalized);
      setSelectedNodeId(normalized.nodes[0]?.id ?? "");
      setNodeStates({});
      setStatus(`그래프 불러오기 완료 (${target})`);
      setGraphFileName(target);
    } catch (e) {
      setError(String(e));
    }
  }

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
  ): Promise<{ ok: boolean; output?: unknown; error?: string; threadId?: string; turnId?: string }> {
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

    activeTurnNodeIdRef.current = "";

    if (!terminal.ok) {
      return {
        ok: false,
        error: `턴 실행 실패 (${terminal.status})`,
        threadId: activeThreadId,
        turnId: turnId ?? undefined,
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
          transition(runRecord, nodeId, "skipped", "분기 결과로 건너뜀");
        } else {
          setNodeStatus(nodeId, "running", "노드 실행 시작");
          transition(runRecord, nodeId, "running");

          const input = nodeInputFor(nodeId, outputs, workflowQuestion);

          if (node.type === "turn") {
            const result = await executeTurnNode(node, input);
            if (!result.ok) {
              setNodeStatus(nodeId, "failed", result.error ?? "턴 실행 실패");
              setNodeRuntimeFields(nodeId, {
                error: result.error,
                threadId: result.threadId,
                turnId: result.turnId,
              });
              transition(runRecord, nodeId, "failed", result.error ?? "턴 실행 실패");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
              threadId: result.threadId,
              turnId: result.turnId,
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
              setNodeStatus(nodeId, "failed", result.error ?? "변환 실패");
              setNodeRuntimeFields(nodeId, { error: result.error });
              transition(runRecord, nodeId, "failed", result.error ?? "변환 실패");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
            });
            setNodeStatus(nodeId, "done", "변환 완료");
            transition(runRecord, nodeId, "done", "변환 완료");
            lastDoneNodeId = nodeId;
          } else {
            const result = executeGateNode(node, input, skipSet);
            if (!result.ok) {
              setNodeStatus(nodeId, "failed", result.error ?? "분기 실패");
              setNodeRuntimeFields(nodeId, { error: result.error });
              transition(runRecord, nodeId, "failed", result.error ?? "분기 실패");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
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
        <h2>엔진 설정</h2>
        <label>
          작업 경로(CWD)
          <input value={cwd} onChange={(e) => setCwd(e.currentTarget.value)} />
        </label>
        <label>
          모델
          <input value={model} onChange={(e) => setModel(e.currentTarget.value)} />
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
        <div className="meta">
          <div>인증 모드: {authModeLabel(authMode)}</div>
          <div>엔진 시작 여부: {engineStarted ? "예" : "아니오"}</div>
          <div>로그인 완료: {loginCompleted ? "예" : "아니오"}</div>
          <div>대기 중 승인 요청: {pendingApprovals.length}</div>
          <div>마지막 완료 상태: {completedStatusLabel(lastCompletedStatus)}</div>
          {authUrl && (
            <div>
              인증 URL: <code>{authUrl}</code>{" "}
              <button onClick={onCopyAuthUrl} type="button">
                복사
              </button>
            </div>
          )}
          {usageSourceMethod && (
            <div>
              사용량 조회 메서드: <code>{usageSourceMethod}</code>
            </div>
          )}
        </div>
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
      return {
        key: `${edge.from.nodeId}-${edge.to.nodeId}-${index}`,
        x1: fromNode.position.x + NODE_WIDTH,
        y1: fromNode.position.y + NODE_HEIGHT / 2,
        x2: toNode.position.x,
        y2: toNode.position.y + NODE_HEIGHT / 2,
      };
    })
    .filter(Boolean) as Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>;

  const selectedNodeState = selectedNodeId ? nodeStates[selectedNodeId] : undefined;
  const outgoingFromSelected = selectedNode
    ? graph.edges
        .filter((edge) => edge.from.nodeId === selectedNode.id)
        .map((edge) => edge.to.nodeId)
        .filter((value, index, arr) => arr.indexOf(value) === index)
    : [];
  const isActiveTab = (tab: WorkspaceTab): boolean => workspaceTab === tab;

  return (
    <main className="app-shell">
      <aside className="left-nav">
        <div className="brand-spacer" />
        <nav className="nav-list">
          <button
            className={isActiveTab("workflow") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("workflow")}
            type="button"
          >
            <span className="nav-icon">◉</span>
            <span className="nav-label">워크</span>
          </button>
          <button
            className={isActiveTab("history") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("history")}
            type="button"
          >
            <span className="nav-icon">≡</span>
            <span className="nav-label">기록</span>
          </button>
          <button
            className={isActiveTab("settings") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("settings")}
            type="button"
          >
            <span className="nav-icon">⚙</span>
            <span className="nav-label">설정</span>
          </button>
          <button
            className={isActiveTab("dev") ? "is-active" : ""}
            onClick={() => setWorkspaceTab("dev")}
            type="button"
          >
            <span className="nav-icon">⌘</span>
            <span className="nav-label">개발</span>
          </button>
        </nav>
        <div className="left-meta">
          <div className="meta-dot" />
          <div className="meta-dot" />
          <div className="meta-dot" />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="header-title">
            <h1>워크플로우</h1>
            <p>{status}</p>
          </div>
          <div className="header-search-wrap">
            <input
              className="header-search"
              onChange={(e) => setHeaderSearch(e.currentTarget.value)}
              placeholder="노드 검색"
              value={headerSearch}
            />
          </div>
          <div className="header-actions">
            <span className="chip">인증: {authModeLabel(authMode)}</span>
            <span className="chip">실행 {runFiles.length}</span>
            <button className="primary-action" type="button">
              생성
            </button>
          </div>
        </header>

        {error && <div className="error">오류: {error}</div>}

        {workspaceTab === "workflow" && (
          <div className="workflow-layout">
            <section className="canvas-pane">
              <div className="canvas-topbar">
                <label className="question-input">
                  질문 입력
                  <textarea
                    onChange={(e) => setWorkflowQuestion(e.currentTarget.value)}
                    rows={3}
                    value={workflowQuestion}
                  />
                </label>
                <div className="toolbar-groups">
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
                    <button
                      disabled={!connectFromNodeId}
                      onClick={() => setConnectFromNodeId("")}
                      type="button"
                    >
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
                </div>
              </div>

              <div
                className="graph-canvas"
                onMouseLeave={onCanvasMouseUp}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
              >
                <svg className="edge-layer">
                  {edgeLines.map((line) => (
                    <line
                      key={line.key}
                      stroke="#70848a"
                      strokeWidth={2}
                      x1={line.x1}
                      x2={line.x2}
                      y1={line.y1}
                      y2={line.y2}
                    />
                  ))}
                </svg>

                {graph.nodes.map((node) => {
                  const keyword = headerSearch.trim().toLowerCase();
                  if (
                    keyword &&
                    !node.id.toLowerCase().includes(keyword) &&
                    !nodeTypeLabel(node.type).toLowerCase().includes(keyword)
                  ) {
                    return null;
                  }
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

                <div className="canvas-left-tools">
                  <button type="button">□</button>
                  <button type="button">✦</button>
                  <button type="button">⌁</button>
                  <button type="button">⚙</button>
                </div>

                <div className="canvas-zoom-controls">
                  <button type="button">+</button>
                  <button type="button">−</button>
                </div>

                <div className="canvas-runbar">
                  <button
                    className="play"
                    disabled={isGraphRunning || graph.nodes.length === 0}
                    onClick={onRunGraph}
                    type="button"
                  >
                    실행
                  </button>
                  <button disabled={!isGraphRunning} onClick={onCancelGraphRun} type="button">
                    중지
                  </button>
                  <button type="button">되돌리기</button>
                  <button type="button">다시하기</button>
                </div>
              </div>

              <div className="edge-list">
                {graph.edges.length === 0 && <div>(연결 없음)</div>}
                {graph.edges.map((edge, index) => (
                  <div className="edge-item" key={`${edge.from.nodeId}-${edge.to.nodeId}-${index}`}>
                    <code>
                      {edge.from.nodeId}.출력 -&gt; {edge.to.nodeId}.입력
                    </code>
                    <button onClick={() => deleteEdge(index)} type="button">
                      제거
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <aside className="inspector-pane">
              <div className="inspector-head">
                <div className="inspector-tabs">
                  <button
                    className={inspectorTab === "config" ? "is-active" : ""}
                    onClick={() => setInspectorTab("config")}
                    type="button"
                  >
                    노드 설정
                  </button>
                  <button
                    className={inspectorTab === "layers" ? "is-active" : ""}
                    onClick={() => setInspectorTab("layers")}
                    type="button"
                  >
                    레이어
                  </button>
                </div>
                <button className="inspector-expand" type="button">
                  →
                </button>
              </div>

              {inspectorTab === "config" && (
                <>
                  <h2>설정 패널</h2>
                  {!selectedNode && <div>노드를 선택하세요.</div>}
                  {selectedNode && (
                    <>
                      <div>
                        <strong>{selectedNode.id}</strong>
                      </div>
                      <div>유형: {nodeTypeLabel(selectedNode.type)}</div>
                      <div className={`status-pill status-${selectedNodeState?.status ?? "idle"}`}>
                        상태: {nodeStatusLabel(selectedNodeState?.status ?? "idle")}
                      </div>

                      {selectedNode.type === "turn" && (
                        <div className="form-grid">
                          <h3>모델 설정</h3>
                          <label>
                            모델
                            <input
                              onChange={(e) => updateSelectedNodeConfig("model", e.currentTarget.value)}
                              value={String((selectedNode.config as TurnConfig).model ?? model)}
                            />
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
                        </div>
                      )}

                      {selectedNode.type === "transform" && (
                        <div className="form-grid">
                          <h3>변환 규칙</h3>
                          <label>
                            변환 모드
                            <select
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
                        </div>
                      )}

                      {selectedNode.type === "gate" && (
                        <div className="form-grid">
                          <h3>분기 설정</h3>
                          <label>
                            분기 경로(decisionPath)
                            <input
                              onChange={(e) =>
                                updateSelectedNodeConfig("decisionPath", e.currentTarget.value)
                              }
                              value={String((selectedNode.config as GateConfig).decisionPath ?? "decision")}
                            />
                          </label>
                          <label>
                            PASS 대상 노드
                            <select
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
                              onChange={(e) =>
                                updateSelectedNodeConfig("rejectNodeId", e.currentTarget.value)
                              }
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
                        </div>
                      )}

                      <h3>노드 로그</h3>
                      <pre>{(selectedNodeState?.logs ?? []).join("\n") || "(로그 없음)"}</pre>
                      <h3>노드 출력</h3>
                      <pre>{formatUnknown(selectedNodeState?.output) || "(출력 없음)"}</pre>
                    </>
                  )}

                  {renderSettingsPanel(true)}
                </>
              )}

              {inspectorTab === "layers" && (
                <div className="layer-list">
                  <h2>그래프 레이어</h2>
                  <h3>노드 ({graph.nodes.length})</h3>
                  <ul>
                    {graph.nodes.map((node) => (
                      <li key={`layer-node-${node.id}`}>
                        <button onClick={() => setSelectedNodeId(node.id)} type="button">
                          {nodeTypeLabel(node.type)} · {node.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h3>엣지 ({graph.edges.length})</h3>
                  <ul>
                    {graph.edges.map((edge, index) => (
                      <li key={`layer-edge-${index}`}>
                        {edge.from.nodeId} → {edge.to.nodeId}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
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
          <section className="panel-card">
            {renderSettingsPanel()}
            {lastSavedRunFile && <div>최근 실행 파일: {lastSavedRunFile}</div>}
          </section>
        )}

        {workspaceTab === "dev" && (
          <section className="workflow-layout">
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
