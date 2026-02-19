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
  startedAt: string;
  finishedAt?: string;
  graphSnapshot: GraphData;
  transitions: RunTransition[];
  summaryLogs: string[];
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
    return `model=${String(config.model ?? "gpt-5-codex")}`;
  }
  if (node.type === "transform") {
    const config = node.config as TransformConfig;
    return `mode=${String(config.mode ?? "pick")}`;
  }
  const config = node.config as GateConfig;
  return `decisionPath=${String(config.decisionPath ?? "decision")}`;
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

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("gpt-5-codex");
  const [workflowQuestion, setWorkflowQuestion] = useState(
    "언어 학습에서 AI가 기존 학습 패러다임을 어떻게 개선할 수 있는지 분석해줘.",
  );
  const [threadId, setThreadId] = useState("");
  const [text, setText] = useState("안녕하세요. 지금 상태를 3줄로 요약해줘.");

  const [engineStarted, setEngineStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [authUrl, setAuthUrl] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("unknown");
  const [loginCompleted, setLoginCompleted] = useState(false);
  const [lastCompletedStatus, setLastCompletedStatus] = useState("unknown");
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
  const [lastSavedRunFile, setLastSavedRunFile] = useState("");
  const [nodeStates, setNodeStates] = useState<Record<string, NodeRunState>>({});
  const [isGraphRunning, setIsGraphRunning] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const cancelRequestedRef = useRef(false);
  const activeTurnNodeIdRef = useRef<string>("");
  const turnTerminalResolverRef = useRef<((terminal: TurnTerminal) => void) | null>(null);
  const activeRunDeltaRef = useRef<Record<string, string>>({});

  const activeApproval = pendingApprovals[0];
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

  function addNodeLog(nodeId: string, message: string) {
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
            setStatus("account/login/completed received");
          }

          if (payload.method === "account/updated") {
            const mode = extractAuthMode(payload.params);
            if (mode) {
              setAuthMode(mode);
              setStatus(`account/updated received (authMode=${mode})`);
            } else {
              setStatus("account/updated received (authMode unknown)");
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
          setStatus(`approval requested (${payload.method})`);
        },
      );

      const unlistenLifecycle = await listen<EngineLifecycleEvent>(
        "engine://lifecycle",
        (event) => {
          const payload = event.payload;
          const msg = payload.message ? ` (${payload.message})` : "";
          setStatus(`${payload.state}${msg}`);

          if (payload.state === "ready") {
            setEngineStarted(true);
          }
          if (payload.state === "stopped" || payload.state === "disconnected") {
            setEngineStarted(false);
            setAuthMode("unknown");
            setLoginCompleted(false);
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

  useEffect(() => {
    refreshGraphFiles();
    refreshRunFiles();
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
      setStatus("ready");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onStopEngine() {
    setError("");
    try {
      await invoke("engine_stop");
      setEngineStarted(false);
      setStatus("stopped");
      setRunning(false);
      setIsGraphRunning(false);
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
      setStatus("auth url received");
      try {
        await openUrl(result.authUrl);
        setStatus("auth url opened in external browser");
      } catch (openErr) {
        setStatus("auth url open failed, copy URL manually");
        setError(`openUrl failed: ${String(openErr)}`);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function onCopyAuthUrl() {
    if (!authUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(authUrl);
      setStatus("auth url copied");
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
      setStatus(`approval response sent (${decision})`);
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
      setStatus(`graph saved (${graphFileName})`);
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
      setStatus(`graph loaded (${target})`);
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
        return { ok: false, error: `invalid mergeJson: ${String(e)}` };
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
        return { ok: false, error: `invalid schemaJson: ${String(e)}` };
      }
      const schemaErrors = validateSimpleSchema(parsedSchema, input);
      if (schemaErrors.length > 0) {
        return {
          ok: false,
          error: `schema validation failed: ${schemaErrors.join("; ")}`,
        };
      }
    }

    const decisionPath = String(config.decisionPath ?? "decision");
    const decisionRaw = getByPath(input, decisionPath);
    const decision = String(decisionRaw ?? "").toUpperCase();

    if (decision !== "PASS" && decision !== "REJECT") {
      return {
        ok: false,
        error: `Gate decision must be PASS or REJECT. got=${String(decisionRaw)}`,
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
      message: `Gate decision=${decision}, allowed=${Array.from(allowed).join(",") || "none"}`,
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
      return { ok: false, error: "failed to obtain threadId" };
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
        error: `turn failed (${terminal.status})`,
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
    setStatus("graph run started");
    setIsGraphRunning(true);
    cancelRequestedRef.current = false;

    const initialState: Record<string, NodeRunState> = {};
    graph.nodes.forEach((node) => {
      initialState[node.id] = {
        status: "idle",
        logs: [],
      };
    });
    setNodeStates(initialState);

    const runRecord: RunRecord = {
      runId: `${Date.now()}`,
      startedAt: new Date().toISOString(),
      graphSnapshot: graph,
      transitions: [],
      summaryLogs: [],
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

      while (queue.length > 0) {
        const nodeId = queue.shift() as string;
        const node = nodeMap.get(nodeId);
        if (!node) {
          continue;
        }

        if (cancelRequestedRef.current) {
          setNodeStatus(nodeId, "cancelled", "cancel requested");
          transition(runRecord, nodeId, "cancelled", "cancel requested");
          break;
        }

        if (skipSet.has(nodeId)) {
          setNodeStatus(nodeId, "skipped", "skipped by gate decision");
          transition(runRecord, nodeId, "skipped", "skipped by gate decision");
        } else {
          setNodeStatus(nodeId, "running", "node execution started");
          transition(runRecord, nodeId, "running");

          const input = nodeInputFor(nodeId, outputs, workflowQuestion);

          if (node.type === "turn") {
            const result = await executeTurnNode(node, input);
            if (!result.ok) {
              setNodeStatus(nodeId, "failed", result.error ?? "turn failed");
              setNodeRuntimeFields(nodeId, {
                error: result.error,
                threadId: result.threadId,
                turnId: result.turnId,
              });
              transition(runRecord, nodeId, "failed", result.error ?? "turn failed");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
              threadId: result.threadId,
              turnId: result.turnId,
            });
            setNodeStatus(nodeId, "done", "turn completed");
            runRecord.threadTurnMap[nodeId] = {
              threadId: result.threadId,
              turnId: result.turnId,
            };
            transition(runRecord, nodeId, "done", "turn completed");
          } else if (node.type === "transform") {
            const result = await executeTransformNode(node, input);
            if (!result.ok) {
              setNodeStatus(nodeId, "failed", result.error ?? "transform failed");
              setNodeRuntimeFields(nodeId, { error: result.error });
              transition(runRecord, nodeId, "failed", result.error ?? "transform failed");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
            });
            setNodeStatus(nodeId, "done", "transform completed");
            transition(runRecord, nodeId, "done", "transform completed");
          } else {
            const result = executeGateNode(node, input, skipSet);
            if (!result.ok) {
              setNodeStatus(nodeId, "failed", result.error ?? "gate failed");
              setNodeRuntimeFields(nodeId, { error: result.error });
              transition(runRecord, nodeId, "failed", result.error ?? "gate failed");
              break;
            }

            outputs[nodeId] = result.output;
            setNodeRuntimeFields(nodeId, {
              status: "done",
              output: result.output,
            });
            setNodeStatus(nodeId, "done", result.message ?? "gate completed");
            transition(runRecord, nodeId, "done", result.message ?? "gate completed");
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

      runRecord.finishedAt = new Date().toISOString();
      await saveRunRecord(runRecord);
      setStatus("graph run finished");
    } catch (e) {
      setError(String(e));
      setStatus("graph run failed");
    } finally {
      turnTerminalResolverRef.current = null;
      activeTurnNodeIdRef.current = "";
      setIsGraphRunning(false);
      cancelRequestedRef.current = false;
    }
  }

  async function onCancelGraphRun() {
    cancelRequestedRef.current = true;
    setStatus("cancel requested");

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
      addNodeLog(activeNodeId, "turn_interrupt requested");
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
      setStatus(`dev turn started (thread: ${activeThreadId})`);
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
      setStatus("interrupt requested");
    } catch (e) {
      setError(String(e));
    }
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

  return (
    <main className="app-shell">
      <aside className="left-nav">
        <div className="brand">Rail</div>
        <nav className="nav-list">
          <button
            className={workspaceTab === "workflow" ? "is-active" : ""}
            onClick={() => setWorkspaceTab("workflow")}
            type="button"
          >
            Workflow
          </button>
          <button
            className={workspaceTab === "history" ? "is-active" : ""}
            onClick={() => setWorkspaceTab("history")}
            type="button"
          >
            History
          </button>
          <button
            className={workspaceTab === "settings" ? "is-active" : ""}
            onClick={() => setWorkspaceTab("settings")}
            type="button"
          >
            Settings
          </button>
          <button
            className={workspaceTab === "dev" ? "is-active" : ""}
            onClick={() => setWorkspaceTab("dev")}
            type="button"
          >
            Dev
          </button>
        </nav>
        <div className="left-meta">
          <div>authMode: {authMode}</div>
          <div>engine: {engineStarted ? "ready" : "stopped"}</div>
          <div>runs: {runFiles.length}</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h1>Rail Workflow Studio</h1>
            <p>{status}</p>
          </div>
          <div className="auth-inline">
            <span>authMode</span>
            <strong>{authMode}</strong>
          </div>
        </header>

        {error && <div className="error">error: {error}</div>}

        {workspaceTab === "workflow" && (
          <div className="workflow-layout">
            <section className="canvas-pane">
              <label>
                질문 (Workflow Input)
                <textarea
                  onChange={(e) => setWorkflowQuestion(e.currentTarget.value)}
                  rows={3}
                  value={workflowQuestion}
                />
              </label>

              <div className="button-row">
                <button onClick={() => addNode("turn")} type="button">
                  + TurnNode
                </button>
                <button onClick={() => addNode("transform")} type="button">
                  + TransformNode
                </button>
                <button onClick={() => addNode("gate")} type="button">
                  + GateNode
                </button>
                <button disabled={!connectFromNodeId} onClick={() => setConnectFromNodeId("")} type="button">
                  Cancel Connect
                </button>
              </div>

              <div className="save-row">
                <input
                  value={graphFileName}
                  onChange={(e) => setGraphFileName(e.currentTarget.value)}
                  placeholder="graph file name"
                />
                <button onClick={saveGraph} type="button">
                  Save
                </button>
                <button onClick={() => loadGraph()} type="button">
                  Load
                </button>
                <button onClick={refreshGraphFiles} type="button">
                  Refresh
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
                  <option value="">graphs/*.json</option>
                  {graphFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
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
                  const runState = nodeStates[node.id];
                  const nodeStatus = runState?.status ?? "idle";
                  return (
                    <div
                      className={`graph-node ${selectedNodeId === node.id ? "selected" : ""}`}
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{ left: node.position.x, top: node.position.y }}
                    >
                      <div className="node-head" onMouseDown={(e) => onNodeDragStart(e, node.id)}>
                        <strong>{node.type.toUpperCase()}</strong>
                        <button onClick={() => deleteNode(node.id)} type="button">
                          Delete
                        </button>
                      </div>
                      <div className="node-body">
                        <div className="node-id">{node.id}</div>
                        <div className={`status-pill status-${nodeStatus}`}>{nodeStatus}</div>
                        <div>{nodeCardSummary(node)}</div>
                      </div>
                      <div className="node-ports">
                        <button onClick={() => onPortInClick(node.id)} type="button">
                          in
                        </button>
                        <button onClick={() => onPortOutClick(node.id)} type="button">
                          {connectFromNodeId === node.id ? "out*" : "out"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="edge-list">
                {graph.edges.length === 0 && <div>(no edges)</div>}
                {graph.edges.map((edge, index) => (
                  <div className="edge-item" key={`${edge.from.nodeId}-${edge.to.nodeId}-${index}`}>
                    <code>
                      {edge.from.nodeId}.out -&gt; {edge.to.nodeId}.in
                    </code>
                    <button onClick={() => deleteEdge(index)} type="button">
                      remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <aside className="inspector-pane">
              <h2>Inspector</h2>
              {!selectedNode && <div>노드를 선택하세요.</div>}
              {selectedNode && (
                <>
                  <div>
                    <strong>{selectedNode.id}</strong>
                  </div>
                  <div>type: {selectedNode.type}</div>
                  <div className={`status-pill status-${selectedNodeState?.status ?? "idle"}`}>
                    status: {selectedNodeState?.status ?? "idle"}
                  </div>

                  {selectedNode.type === "turn" && (
                    <div className="form-grid">
                      <label>
                        model
                        <input
                          onChange={(e) => updateSelectedNodeConfig("model", e.currentTarget.value)}
                          value={String((selectedNode.config as TurnConfig).model ?? model)}
                        />
                      </label>
                      <label>
                        cwd
                        <input
                          onChange={(e) => updateSelectedNodeConfig("cwd", e.currentTarget.value)}
                          value={String((selectedNode.config as TurnConfig).cwd ?? cwd)}
                        />
                      </label>
                      <label>
                        promptTemplate
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
                      <label>
                        mode
                        <select
                          onChange={(e) => updateSelectedNodeConfig("mode", e.currentTarget.value)}
                          value={String((selectedNode.config as TransformConfig).mode ?? "pick")}
                        >
                          <option value="pick">pick</option>
                          <option value="merge">merge</option>
                          <option value="template">template</option>
                        </select>
                      </label>
                      <label>
                        pickPath
                        <input
                          onChange={(e) => updateSelectedNodeConfig("pickPath", e.currentTarget.value)}
                          value={String((selectedNode.config as TransformConfig).pickPath ?? "")}
                        />
                      </label>
                      <label>
                        mergeJson
                        <textarea
                          onChange={(e) => updateSelectedNodeConfig("mergeJson", e.currentTarget.value)}
                          rows={3}
                          value={String((selectedNode.config as TransformConfig).mergeJson ?? "{}")}
                        />
                      </label>
                      <label>
                        template
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
                      <label>
                        decisionPath
                        <input
                          onChange={(e) => updateSelectedNodeConfig("decisionPath", e.currentTarget.value)}
                          value={String((selectedNode.config as GateConfig).decisionPath ?? "decision")}
                        />
                      </label>
                      <label>
                        PASS target
                        <select
                          onChange={(e) => updateSelectedNodeConfig("passNodeId", e.currentTarget.value)}
                          value={String((selectedNode.config as GateConfig).passNodeId ?? "")}
                        >
                          <option value="">(none)</option>
                          {outgoingFromSelected.map((nodeId) => (
                            <option key={nodeId} value={nodeId}>
                              {nodeId}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        REJECT target
                        <select
                          onChange={(e) => updateSelectedNodeConfig("rejectNodeId", e.currentTarget.value)}
                          value={String((selectedNode.config as GateConfig).rejectNodeId ?? "")}
                        >
                          <option value="">(none)</option>
                          {outgoingFromSelected.map((nodeId) => (
                            <option key={nodeId} value={nodeId}>
                              {nodeId}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        schemaJson (optional)
                        <textarea
                          onChange={(e) => updateSelectedNodeConfig("schemaJson", e.currentTarget.value)}
                          rows={4}
                          value={String((selectedNode.config as GateConfig).schemaJson ?? "")}
                        />
                      </label>
                    </div>
                  )}

                  <h3>Node Logs</h3>
                  <pre>{(selectedNodeState?.logs ?? []).join("\n") || "(no logs)"}</pre>
                  <h3>Node Output</h3>
                  <pre>{formatUnknown(selectedNodeState?.output) || "(no output)"}</pre>
                </>
              )}

              <div className="button-row">
                <button
                  disabled={isGraphRunning || graph.nodes.length === 0}
                  onClick={onRunGraph}
                  type="button"
                >
                  Run Graph
                </button>
                <button disabled={!isGraphRunning} onClick={onCancelGraphRun} type="button">
                  Cancel Run
                </button>
              </div>
            </aside>
          </div>
        )}

        {workspaceTab === "history" && (
          <section className="panel-card">
            <h2>History</h2>
            <p>질문/답변 히스토리와 실행 로그 패널은 다음 커밋에서 추가됩니다.</p>
            <pre>{runFiles.join("\n") || "(no run files)"}</pre>
          </section>
        )}

        {workspaceTab === "settings" && (
          <section className="panel-card controls">
            <h2>Engine Settings</h2>
            <label>
              CWD
              <input value={cwd} onChange={(e) => setCwd(e.currentTarget.value)} />
            </label>
            <label>
              Model
              <input value={model} onChange={(e) => setModel(e.currentTarget.value)} />
            </label>
            <div className="button-row">
              <button onClick={onStartEngine} disabled={running || isGraphRunning} type="button">
                Engine Start
              </button>
              <button onClick={onStopEngine} type="button">
                Engine Stop
              </button>
              <button onClick={onLoginChatgpt} disabled={running || isGraphRunning} type="button">
                Login ChatGPT
              </button>
            </div>
            <div className="meta">
              <div>engineStarted: {String(engineStarted)}</div>
              <div>loginCompleted: {String(loginCompleted)}</div>
              <div>pendingApprovals: {pendingApprovals.length}</div>
              <div>last item/completed status: {lastCompletedStatus}</div>
              {lastSavedRunFile && <div>last run file: {lastSavedRunFile}</div>}
              {authUrl && (
                <div>
                  authUrl: <code>{authUrl}</code>{" "}
                  <button onClick={onCopyAuthUrl} type="button">
                    Copy
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {workspaceTab === "dev" && (
          <section className="workflow-layout">
            <article className="panel-card">
              <h2>Dev Single Turn</h2>
              <label>
                Thread ID
                <input
                  onChange={(e) => setThreadId(e.currentTarget.value)}
                  placeholder="thread_start 결과 자동 입력"
                  value={threadId}
                />
              </label>

              <form className="prompt" onSubmit={onRunTurnDev}>
                <label>
                  Input
                  <textarea onChange={(e) => setText(e.currentTarget.value)} rows={4} value={text} />
                </label>
                <div className="button-row">
                  <button disabled={running || !text.trim()} type="submit">
                    {running ? "Running..." : "실행"}
                  </button>
                  <button disabled={!threadId} onClick={onInterruptDev} type="button">
                    Interrupt
                  </button>
                </div>
              </form>

              <h3>Streaming Output</h3>
              <pre>{streamText || "(waiting for item/agentMessage/delta...)"}</pre>
            </article>

            <article className="panel-card">
              <h2>Notifications</h2>
              <pre>{events.join("\n") || "(no events yet)"}</pre>
            </article>
          </section>
        )}
      </section>

      {activeApproval && (
        <div className="modal-backdrop">
          <section className="approval-modal">
            <h2>Approval Required</h2>
            <div>source: {activeApproval.source}</div>
            <div>method: {activeApproval.method}</div>
            <div>requestId: {activeApproval.requestId}</div>
            <pre>{formatUnknown(activeApproval.params)}</pre>
            <div className="button-row">
              {APPROVAL_DECISIONS.map((decision) => (
                <button
                  disabled={approvalSubmitting}
                  key={decision}
                  onClick={() => onRespondApproval(decision)}
                  type="button"
                >
                  {decision}
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
