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
import "../App.css";
import AppNav from "../components/AppNav";
import FancySelect, { type FancySelectOption } from "../components/FancySelect";
import ApprovalModal from "../components/modals/ApprovalModal";
import PendingWebLoginModal from "../components/modals/PendingWebLoginModal";
import PendingWebTurnModal from "../components/modals/PendingWebTurnModal";
import BridgePage from "../pages/bridge/BridgePage";
import FeedPage from "../pages/feed/FeedPage";
import SettingsPage from "../pages/settings/SettingsPage";
import WorkflowPage from "../pages/workflow/WorkflowPage";
import { useFloatingPanel } from "../features/ui/useFloatingPanel";
import {
  COST_PRESET_DEFAULT_MODEL,
  DEFAULT_TURN_MODEL,
  TURN_EXECUTOR_OPTIONS,
  TURN_MODEL_OPTIONS,
  WEB_PROVIDER_OPTIONS,
  costPresetLabel,
  getCostPresetTargetModel,
  getTurnExecutor,
  getWebProviderFromExecutor,
  inferQualityProfile,
  isCostPreset,
  isPresetKind,
  normalizeWebResultMode,
  toArtifactType,
  toTurnModelDisplayName,
  toTurnModelEngineId,
  turnExecutorLabel,
  webProviderHomeUrl,
  webProviderLabel,
  type ArtifactType,
  type CostPreset,
  type PresetKind,
  type QualityProfileId,
  type TurnConfig,
  type TurnExecutor,
  type WebProvider,
  type WebResultMode,
} from "../features/workflow/domain";
import {
  applyPresetTurnPolicies,
  buildPresetGraphByKind,
  simplifyPresetForSimpleWorkflow,
} from "../features/workflow/presets";
import {
  approvalDecisionLabel,
  approvalSourceLabel,
  authModeLabel,
  extractFinalAnswer,
  formatRelativeFeedTime,
  knowledgeStatusMeta,
  lifecycleStateLabel,
  nodeSelectionLabel,
  nodeStatusLabel,
  nodeTypeLabel,
  turnRoleLabel,
} from "../features/workflow/labels";
import {
  buildCodexMultiAgentDirective,
  buildForcedAgentRuleBlock,
  extractPromptInputText,
  getByPath,
  isLikelyWebPromptEcho,
  replaceInputPlaceholder,
  stringifyInput,
  toHumanReadableFeedText,
} from "../features/workflow/promptUtils";
import {
  buildFeedAvatarLabel,
  feedPostStatusLabel,
  formatFeedInputSourceLabel,
  formatUsageInfoForDisplay,
  hashStringToHue,
  normalizeFeedSteps,
} from "../features/feed/displayUtils";
import { computeFeedDerivedState } from "../features/feed/derivedState";
import {
  alignAutoEdgePoints,
  autoArrangeGraphLayout,
  buildManualEdgePath,
  buildRoundedEdgePath,
  buildSimpleReadonlyTurnEdges,
  cloneGraph,
  defaultNodeConfig,
  edgeMidPoint,
  getAutoConnectionSides,
  getGraphEdgeKey,
  getNodeAnchorPoint,
  graphEquals,
  makeNodeId,
  nodeCardSummary,
  snapToLayoutGrid,
  snapToNearbyNodeAxis,
  turnModelLabel,
} from "../features/workflow/graph-utils";
import type {
  GateConfig,
  GraphData,
  GraphEdge,
  GraphNode,
  KnowledgeFileRef,
  NodeAnchorSide,
  NodeExecutionStatus,
  NodeType,
  TransformConfig,
  TransformMode,
} from "../features/workflow/types";
import {
  AUTH_MODE_STORAGE_KEY,
  CODEX_MULTI_AGENT_MODE_STORAGE_KEY,
  LOGIN_COMPLETED_STORAGE_KEY,
  WORKSPACE_CWD_STORAGE_KEY,
  closestNumericOptionValue,
  codexMultiAgentModeLabel,
  extractAuthMode,
  extractDeltaText,
  extractStringByPaths,
  extractUsageStats,
  formatDuration,
  formatNodeElapsedTime,
  formatRunDateTime,
  formatRunFileLabel,
  formatUnknown,
  formatUsage,
  isEditableTarget,
  isEngineAlreadyStartedError,
  isNodeDragAllowedTarget,
  loadPersistedAuthMode,
  loadPersistedCodexMultiAgentMode,
  loadPersistedCwd,
  loadPersistedLoginCompleted,
  normalizeCodexMultiAgentMode,
  resolveNodeCwd,
  toErrorText,
  toOpenRunsFolderErrorMessage,
  toUsageCheckErrorMessage,
} from "./mainAppUtils";
import {
  GRAPH_SCHEMA_VERSION,
  InspectorSectionTitle,
  KNOWLEDGE_DEFAULT_MAX_CHARS,
  KNOWLEDGE_DEFAULT_TOP_K,
  NavIcon,
  QUALITY_DEFAULT_THRESHOLD,
  type TurnTerminal,
  type WebBridgeStatus,
  type WorkspaceTab,
  isTurnTerminalEvent,
  normalizeGraph,
  normalizeKnowledgeConfig,
  toWebBridgeStatus,
  validateSimpleSchema,
} from "./mainAppGraphHelpers";
import {
  ARTIFACT_TYPE_OPTIONS,
  CODEX_MULTI_AGENT_MODE_OPTIONS,
  COST_PRESET_OPTIONS,
  NODE_ANCHOR_SIDES,
  PRESET_TEMPLATE_META,
  PRESET_TEMPLATE_OPTIONS,
  QUALITY_PROFILE_OPTIONS,
  QUALITY_THRESHOLD_OPTIONS,
  buildFeedPost,
  buildQualityReport,
  defaultKnowledgeConfig,
  feedAttachmentRawKey,
  inferRunGroupMeta,
  isCriticalTurnNode,
  normalizeArtifactOutput,
  normalizeQualityThreshold,
  normalizeRunRecord,
  summarizeQualityMetrics,
} from "./mainAppRuntimeHelpers";

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

type CodexMultiAgentMode = "off" | "balanced" | "max";

type CanvasDisplayEdge = {
  edge: GraphEdge;
  edgeKey: string;
  readOnly: boolean;
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
type FeedInputSource = {
  kind: "question" | "node";
  nodeId?: string;
  agentName: string;
  roleLabel?: string;
  summary?: string;
  sourcePostId?: string;
};

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

type FeedStatusFilter = "all" | FeedPostStatus;
type FeedExecutorFilter = "all" | "codex" | "web" | "ollama";
type FeedPeriodFilter = "all" | "today" | "7d";
type FeedCategory = "all_posts" | "completed_posts" | "web_posts" | "error_posts";
type RunGroupKind = "template" | "custom";

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

type FeedViewPost = FeedPost & {
  sourceFile: string;
  question?: string;
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

type GraphClipboardSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  copiedAt: number;
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
const AUTO_LAYOUT_SNAP_THRESHOLD = 44;
const AUTO_LAYOUT_DRAG_SNAP_THRESHOLD = 36;
const AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD = 38;
const AGENT_RULE_CACHE_TTL_MS = 12_000;
const AGENT_RULE_MAX_DOCS = 16;
const AGENT_RULE_MAX_DOC_CHARS = 6_000;
const AUTH_LOGIN_REQUIRED_CONFIRM_COUNT = 3;
const AUTH_LOGIN_REQUIRED_GRACE_MS = 120_000;
const CODEX_LOGIN_COOLDOWN_MS = 45_000;
const WEB_BRIDGE_CLAIM_WARN_MS = 8_000;
const WEB_BRIDGE_PROMPT_FILLED_WARN_MS = 8_000;
const WEB_TURN_FLOATING_DEFAULT_X = 24;
const WEB_TURN_FLOATING_DEFAULT_Y = 92;
const WEB_TURN_FLOATING_MARGIN = 12;
const WEB_TURN_FLOATING_MIN_VISIBLE_WIDTH = 120;
const WEB_TURN_FLOATING_MIN_VISIBLE_HEIGHT = 72;
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
function App() {
  const defaultCwd = useMemo(() => loadPersistedCwd("."), []);
  const defaultLoginCompleted = useMemo(() => loadPersistedLoginCompleted(), []);
  const defaultAuthMode = useMemo(() => loadPersistedAuthMode(), []);
  const defaultCodexMultiAgentMode = useMemo(() => loadPersistedCodexMultiAgentMode(), []);

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("workflow");

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState<string>(DEFAULT_TURN_MODEL);
  const [costPreset, setCostPreset] = useState<CostPreset>("balanced");
  const [workflowQuestion, setWorkflowQuestion] = useState(
    "",
  );

  const [engineStarted, setEngineStarted] = useState(false);
  const [status, setStatus] = useState("대기 중");
  const [running, setRunning] = useState(false);
  const [error, setErrorState] = useState("");
  const [, setErrorLogs] = useState<string[]>([]);

  const [usageInfoText, setUsageInfoText] = useState("");
  const [usageResultClosed, setUsageResultClosed] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(defaultAuthMode);
  const [codexMultiAgentMode, setCodexMultiAgentMode] = useState<CodexMultiAgentMode>(defaultCodexMultiAgentMode);
  const [loginCompleted, setLoginCompleted] = useState(defaultLoginCompleted);
  const [codexAuthBusy, setCodexAuthBusy] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [pendingWebTurn, setPendingWebTurn] = useState<PendingWebTurn | null>(null);
  const [suspendedWebTurn, setSuspendedWebTurn] = useState<PendingWebTurn | null>(null);
  const [suspendedWebResponseDraft, setSuspendedWebResponseDraft] = useState("");
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
    extensionOriginAllowlistConfigured: false,
    allowedExtensionOriginCount: 0,
    connectedProviders: [],
    queuedTasks: 0,
    activeTasks: 0,
  });
  const [, setWebBridgeLogs] = useState<string[]>([]);
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
  const [feedPosts, setFeedPosts] = useState<FeedViewPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedStatusFilter, setFeedStatusFilter] = useState<FeedStatusFilter>("all");
  const [feedExecutorFilter, setFeedExecutorFilter] = useState<FeedExecutorFilter>("all");
  const [feedPeriodFilter, setFeedPeriodFilter] = useState<FeedPeriodFilter>("all");
  const [feedKeyword, setFeedKeyword] = useState("");
  const [feedCategory, setFeedCategory] = useState<FeedCategory>("all_posts");
  const [feedFilterOpen, setFeedFilterOpen] = useState(false);
  const [feedGroupExpandedByRunId, setFeedGroupExpandedByRunId] = useState<Record<string, boolean>>({});
  const [feedGroupRenameRunId, setFeedGroupRenameRunId] = useState<string | null>(null);
  const [feedGroupRenameDraft, setFeedGroupRenameDraft] = useState("");
  const [feedExpandedByPost, setFeedExpandedByPost] = useState<Record<string, boolean>>({});
  const [feedShareMenuPostId, setFeedShareMenuPostId] = useState<string | null>(null);
  const [feedReplyDraftByPost, setFeedReplyDraftByPost] = useState<Record<string, string>>({});
  const [feedInspectorPostId, setFeedInspectorPostId] = useState("");
  const [feedInspectorSnapshotNode, setFeedInspectorSnapshotNode] = useState<GraphNode | null>(null);
  const [, setFeedInspectorRuleDocs] = useState<AgentRuleDoc[]>([]);
  const [, setFeedInspectorRuleLoading] = useState(false);
  const [pendingNodeRequests, setPendingNodeRequests] = useState<Record<string, string[]>>({});
  const [activeFeedRunMeta, setActiveFeedRunMeta] = useState<{
    runId: string;
    question: string;
    startedAt: string;
    groupName: string;
    groupKind: RunGroupKind;
    presetKind?: PresetKind;
  } | null>(null);
  const [, setLastSavedRunFile] = useState("");
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
  const webTurnFloatingRef = useRef<HTMLElement | null>(null);
  const pendingWebLoginAutoOpenKeyRef = useRef("");
  const authLoginRequiredProbeCountRef = useRef(0);
  const lastAuthenticatedAtRef = useRef<number>(defaultLoginCompleted ? Date.now() : 0);
  const codexLoginLastAttemptAtRef = useRef(0);
  const webBridgeStageWarnTimerRef = useRef<Record<string, number>>({});
  const activeWebPromptRef = useRef<Partial<Record<WebProvider, string>>>({});
  const lastAppliedPresetRef = useRef<{ kind: PresetKind; graph: GraphData } | null>(null);
  const graphClipboardRef = useRef<GraphClipboardSnapshot | null>(null);
  const graphPasteSerialRef = useRef(0);
  const webTurnPanel = useFloatingPanel({
    enabled: Boolean(pendingWebTurn),
    panelRef: webTurnFloatingRef,
    defaultPosition: {
      x: WEB_TURN_FLOATING_DEFAULT_X,
      y: WEB_TURN_FLOATING_DEFAULT_Y,
    },
    margin: WEB_TURN_FLOATING_MARGIN,
    minVisibleWidth: WEB_TURN_FLOATING_MIN_VISIBLE_WIDTH,
    minVisibleHeight: WEB_TURN_FLOATING_MIN_VISIBLE_HEIGHT,
  });

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

  function clearWebBridgeStageWarnTimer(providerKey: string) {
    const current = webBridgeStageWarnTimerRef.current[providerKey];
    if (typeof current === "number") {
      window.clearTimeout(current);
      delete webBridgeStageWarnTimerRef.current[providerKey];
    }
  }

  function scheduleWebBridgeStageWarn(
    providerKey: string,
    timeoutMs: number,
    statusMessage: string,
    nodeLogMessage: string,
    onTimeout?: () => void,
  ) {
    clearWebBridgeStageWarnTimer(providerKey);
    webBridgeStageWarnTimerRef.current[providerKey] = window.setTimeout(() => {
      setStatus(statusMessage);
      const activeWebNodeId = activeWebNodeIdRef.current;
      const activeProvider = activeWebProviderRef.current;
      if (activeWebNodeId && activeProvider && activeProvider === providerKey) {
        addNodeLog(activeWebNodeId, nodeLogMessage);
      }
      onTimeout?.();
      delete webBridgeStageWarnTimerRef.current[providerKey];
    }, timeoutMs);
  }

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(webBridgeStageWarnTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      webBridgeStageWarnTimerRef.current = {};
    };
  }, []);

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
              const providerKey = provider && WEB_PROVIDER_OPTIONS.includes(provider as WebProvider)
                ? (provider as WebProvider)
                : null;
              if (stage?.startsWith("bridge_")) {
                const prefix = providerKey
                  ? `[${providerKey.toUpperCase()}] `
                  : "";
                const line = `${prefix}${message ?? stage}`;
                setWebBridgeLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 120));
                if (providerKey && stage === "bridge_queued") {
                  setStatus(`${webProviderLabel(providerKey)} 작업 대기열 등록됨`);
                  scheduleWebBridgeStageWarn(
                    providerKey,
                    WEB_BRIDGE_CLAIM_WARN_MS,
                    `${webProviderLabel(providerKey)} 탭에서 작업 수신이 지연되고 있습니다.`,
                    "[WEB] 작업 수신 지연: 해당 서비스 탭이 열려 있고 확장이 활성화되어 있는지 확인하세요.",
                    () => {
                      const prompt = activeWebPromptRef.current[providerKey];
                      if (!prompt) {
                        return;
                      }
                      void navigator.clipboard
                        .writeText(prompt)
                        .then(() => {
                          const activeWebNodeId = activeWebNodeIdRef.current;
                          const activeProvider = activeWebProviderRef.current;
                          if (activeWebNodeId && activeProvider === providerKey) {
                            addNodeLog(activeWebNodeId, "[WEB] 자동 주입 지연으로 프롬프트를 클립보드에 복사했습니다.");
                          }
                        })
                        .catch(() => {
                          // clipboard permission can be denied depending on runtime context
                        });
                    },
                  );
                } else if (providerKey && stage === "bridge_claimed") {
                  setStatus(`${webProviderLabel(providerKey)} 탭 연결됨, 프롬프트 주입 중`);
                  scheduleWebBridgeStageWarn(
                    providerKey,
                    WEB_BRIDGE_PROMPT_FILLED_WARN_MS,
                    `${webProviderLabel(providerKey)} 프롬프트 자동 주입이 지연되고 있습니다.`,
                    "[WEB] 프롬프트 자동 주입 지연: 입력창 탐지 실패 가능성이 있습니다. 웹 탭을 새로고침 후 다시 실행하세요.",
                  );
                } else if (providerKey && stage === "bridge_prompt_filled") {
                  clearWebBridgeStageWarnTimer(providerKey);
                  setStatus(`${webProviderLabel(providerKey)} 프롬프트 자동 주입 완료`);
                } else if (providerKey && stage === "bridge_waiting_user_send") {
                  clearWebBridgeStageWarnTimer(providerKey);
                  setStatus(`${webProviderLabel(providerKey)} 탭에서 전송 1회가 필요합니다.`);
                } else if (providerKey && stage === "bridge_extension_error") {
                  clearWebBridgeStageWarnTimer(providerKey);
                  setStatus(`${webProviderLabel(providerKey)} 웹 연결 오류 - 확장 연결 상태를 확인하세요.`);
                } else if (providerKey && stage === "bridge_done") {
                  clearWebBridgeStageWarnTimer(providerKey);
                  setStatus(`${webProviderLabel(providerKey)} 응답 수집 완료`);
                } else if (
                  providerKey &&
                  (stage === "bridge_failed" ||
                    stage === "bridge_timeout" ||
                    stage === "bridge_cancelled" ||
                    stage === "bridge_error")
                ) {
                  clearWebBridgeStageWarnTimer(providerKey);
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
    const rawContent = toHumanReadableFeedText(markdownAttachment?.content?.trim() ?? "");
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
  const normalizedQuestion = toHumanReadableFeedText(post.question?.trim() ?? "");
  if (normalizedQuestion) {
    lines.push("", "## 질문", normalizedQuestion);
  }
  if (Array.isArray(post.inputSources) && post.inputSources.length > 0) {
    lines.push("", "## 입력 출처", ...post.inputSources.map((source) => `- ${formatFeedInputSourceLabel(source)}`));
  }
  if (post.inputContext?.preview) {
    lines.push("", "## 전달 입력 스냅샷", toHumanReadableFeedText(post.inputContext.preview));
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

  async function onShareFeedPost(post: FeedViewPost, mode: "clipboard" | "json") {
    setError("");
    setFeedShareMenuPostId(null);
    const run = await ensureFeedRunRecord(post.sourceFile);
    const shareText = buildFeedShareText(post, run);
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
      setStatus(`포스트 삭제 완료: ${post.agentName}`);
    } catch (e) {
      setError(`포스트 삭제 실패: ${String(e)}`);
    }
  }

  async function onSubmitFeedRunGroupRename(runId: string, sourceFile: string) {
    const trimmed = feedGroupRenameDraft.trim();
    if (!trimmed) {
      setError("세트 이름을 입력하세요.");
      return;
    }
    const target = sourceFile.trim();
    if (!target) {
      setError("세트 원본 실행 파일을 찾을 수 없습니다.");
      return;
    }
    setError("");
    try {
      const run = await ensureFeedRunRecord(target);
      if (!run) {
        throw new Error("실행 기록을 불러오지 못했습니다.");
      }
      const nextRun: RunRecord = {
        ...run,
        workflowGroupName: trimmed,
        workflowGroupKind: "custom",
      };
      await invoke("run_save", { name: target, run: nextRun });
      feedRunCacheRef.current[target] = nextRun;
      if (activeFeedRunMeta?.runId === runId) {
        setActiveFeedRunMeta((prev) => {
          if (!prev || prev.runId !== runId) {
            return prev;
          }
          return {
            ...prev,
            groupName: trimmed,
            groupKind: "custom",
            presetKind: undefined,
          };
        });
      }
      setFeedPosts((prev) => [...prev]);
      setFeedGroupRenameRunId(null);
      setFeedGroupRenameDraft("");
      setStatus(`피드 세트 이름 변경 완료: ${trimmed}`);
    } catch (error) {
      setError(`피드 세트 이름 변경 실패: ${String(error)}`);
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
          inputSources: post.inputSources ?? [],
          inputData: followupInput,
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
        inputSources: post.inputSources ?? [],
        inputData: followupInput,
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
        if (loginCompleted) {
          authLoginRequiredProbeCountRef.current = 0;
          if (!silent) {
            setStatus("로그인 상태 유지 (재확인 필요)");
          }
          return result;
        }
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
        setUsageResultClosed(false);
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
      setUsageResultClosed(false);
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
      if (loginCompleted) {
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

      const probed = await refreshAuthStateFromEngine(true);
      if (probed?.state === "authenticated") {
        authLoginRequiredProbeCountRef.current = 0;
        lastAuthenticatedAtRef.current = Date.now();
        setLoginCompleted(true);
        setStatus("이미 로그인 상태입니다.");
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
      if (loginCompleted) {
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
        setError(`웹 연결 상태 조회 실패: ${String(error)}`);
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
      setStatus("웹 연결 토큰을 재발급했습니다.");
    } catch (error) {
      setError(`웹 연결 토큰 재발급 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

  async function onRestartWebBridge() {
    setError("");
    setWebWorkerBusy(true);
    try {
      await invoke("web_worker_stop");
    } catch {
      // noop
    }
    try {
      await invoke("web_worker_start");
      setStatus("웹 연결 워커 재시작 완료");
      await refreshWebBridgeStatus(true);
      await onCopyWebBridgeConnectCode();
    } catch (error) {
      setError(`웹 연결 재시작 실패: ${String(error)}`);
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
        setStatus("웹 연결 코드 복사 완료");
        setError("");
      } else {
        setStatus("자동 복사 권한이 없어 코드 박스를 표시했습니다. 아래에서 수동 복사하세요.");
        setError("");
      }
    } catch (error) {
      setError(`웹 연결 코드 준비 실패: ${String(error)}`);
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

  function onDismissPendingWebTurn() {
    if (!pendingWebTurn) {
      return;
    }
    webTurnPanel.clearDragging();
    setSuspendedWebTurn(pendingWebTurn);
    setSuspendedWebResponseDraft(webResponseDraft);
    setPendingWebTurn(null);
    setStatus("웹 응답 입력 창을 닫았습니다. 하단 '웹 입력 다시 열기' 버튼으로 재개할 수 있습니다.");
  }

  function onReopenPendingWebTurn() {
    if (!suspendedWebTurn) {
      return;
    }
    setPendingWebTurn(suspendedWebTurn);
    setWebResponseDraft(suspendedWebResponseDraft);
    setSuspendedWebTurn(null);
    setSuspendedWebResponseDraft("");
    setStatus(`${webProviderLabel(suspendedWebTurn.provider)} 웹 응답 입력 창을 다시 열었습니다.`);
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
    const presetWithPolicies: GraphData = {
      ...builtPreset,
      nodes: applyPresetTurnPolicies(kind, builtPreset.nodes),
    };
    const preset = simplifyPresetForSimpleWorkflow(presetWithPolicies, SIMPLE_WORKFLOW_UI);
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
    lastAppliedPresetRef.current = { kind, graph: cloneGraph(nextPreset) };
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

  function hasUserTextSelection(): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    return !selection.isCollapsed && selection.toString().trim().length > 0;
  }

  function copySelectedNodesToClipboard(): boolean {
    const targetIds = selectedNodeIds.filter((id) => canvasNodeIdSet.has(id));
    if (targetIds.length === 0) {
      return false;
    }
    const targetSet = new Set(targetIds);
    const nodes = graph.nodes
      .filter((node) => targetSet.has(node.id))
      .map((node) => ({
        ...node,
        position: { ...node.position },
        config: JSON.parse(JSON.stringify(node.config ?? {})),
      }));
    const edges = graph.edges
      .filter((edge) => targetSet.has(edge.from.nodeId) && targetSet.has(edge.to.nodeId))
      .map((edge) => ({
        from: { ...edge.from },
        to: { ...edge.to },
        control: edge.control ? { ...edge.control } : undefined,
      }));

    graphClipboardRef.current = {
      nodes,
      edges,
      copiedAt: Date.now(),
    };
    setStatus(nodes.length > 1 ? `노드 ${nodes.length}개 복사됨` : "노드 복사됨");
    return true;
  }

  function pasteNodesFromClipboard(): boolean {
    const snapshot = graphClipboardRef.current;
    if (!snapshot || snapshot.nodes.length === 0) {
      return false;
    }

    const minPos = -NODE_DRAG_MARGIN;
    const offsetStep = 48;
    graphPasteSerialRef.current += 1;
    const offset = graphPasteSerialRef.current * offsetStep;

    const idMap = new Map<string, string>();
    const pastedNodes: GraphNode[] = snapshot.nodes.map((node) => {
      const nextId = makeNodeId(node.type);
      idMap.set(node.id, nextId);
      return {
        ...node,
        id: nextId,
        position: {
          x: Math.max(minPos, Math.round(node.position.x + offset)),
          y: Math.max(minPos, Math.round(node.position.y + offset)),
        },
        config: JSON.parse(JSON.stringify(node.config ?? {})),
      };
    });

    const pastedEdges = snapshot.edges.reduce<GraphEdge[]>((acc, edge) => {
        const fromId = idMap.get(edge.from.nodeId);
        const toId = idMap.get(edge.to.nodeId);
        if (!fromId || !toId || fromId === toId) {
          return acc;
        }
        acc.push({
          from: { ...edge.from, nodeId: fromId },
          to: { ...edge.to, nodeId: toId },
          ...(edge.control
            ? { control: { ...edge.control, x: edge.control.x + offset, y: edge.control.y + offset } }
            : {}),
        });
        return acc;
      }, []);

    applyGraphChange((prev) => ({
      ...prev,
      nodes: [...prev.nodes, ...pastedNodes],
      edges: [...prev.edges, ...pastedEdges],
    }));

    const nextSelection = pastedNodes.map((node) => node.id);
    setNodeSelection(nextSelection, nextSelection[0]);
    setSelectedEdgeKey("");
    setStatus(pastedNodes.length > 1 ? `노드 ${pastedNodes.length}개 붙여넣기됨` : "노드 붙여넣기됨");
    return true;
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
      lastAppliedPresetRef.current = null;
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
        nextTab = "bridge";
      } else if (key === "4") {
        nextTab = "settings";
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
            : nextTab === "bridge"
              ? "웹 연결 탭으로 이동"
              : "설정 탭으로 이동",
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

    const onCopyPasteNodes = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const isCopy = key === "c" || key === "ㅊ" || event.code === "KeyC";
      const isPaste = key === "v" || key === "ㅍ" || event.code === "KeyV";

      if (isCopy) {
        if (selectedNodeIds.length === 0 && hasUserTextSelection()) {
          return;
        }
        const copied = copySelectedNodesToClipboard();
        if (copied) {
          event.preventDefault();
        }
        return;
      }
      if (isPaste) {
        const pasted = pasteNodesFromClipboard();
        if (pasted) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onCopyPasteNodes);
    return () => window.removeEventListener("keydown", onCopyPasteNodes);
  }, [
    workspaceTab,
    selectedNodeIds,
    canvasNodeIdSet,
    graph.nodes,
    graph.edges,
  ]);

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
    try {
      window.localStorage.setItem(CODEX_MULTI_AGENT_MODE_STORAGE_KEY, codexMultiAgentMode);
    } catch {
      // ignore persistence failures
    }
  }, [codexMultiAgentMode]);

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
    webTurnPanel.clearDragging();
    setPendingWebTurn(null);
    setSuspendedWebTurn(null);
    setSuspendedWebResponseDraft("");
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
    setSuspendedWebTurn(null);
    setSuspendedWebResponseDraft("");
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
    const cwdKey = resolveNodeCwd(nodeCwd, cwd);
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
        baseCwd: cwd,
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
    const nodeCwd = resolveNodeCwd(config.cwd ?? cwd, cwd);
    const promptTemplate = String(config.promptTemplate ?? "{{input}}");
    const nodeOllamaModel = String(config.ollamaModel ?? "llama3.1:8b").trim() || "llama3.1:8b";

    const inputText = extractPromptInputText(input);
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
    const shouldForceAgentRules = inferQualityProfile(node, config) === "code_implementation";
    if (agentRuleDocs.length > 0 && shouldForceAgentRules) {
      addNodeLog(node.id, `[규칙] agent/skill 문서 ${agentRuleDocs.length}개 강제 적용`);
    }
    const forcedRuleBlock = shouldForceAgentRules ? buildForcedAgentRuleBlock(agentRuleDocs) : "";
    const withKnowledge = await injectKnowledgeContext(node, promptWithRequests, config);
    let textToSend = forcedRuleBlock
      ? `${forcedRuleBlock}\n\n${withKnowledge.prompt}`.trim()
      : withKnowledge.prompt;
    const knowledgeTrace = withKnowledge.trace;
    if (executor === "codex") {
      const multiAgentDirective = buildCodexMultiAgentDirective(codexMultiAgentMode);
      if (multiAgentDirective) {
        textToSend = `${multiAgentDirective}\n\n${textToSend}`.trim();
        addNodeLog(node.id, `[멀티에이전트] Codex 최적화 모드 적용: ${codexMultiAgentModeLabel(codexMultiAgentMode)}`);
      }
    }

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
      const webTimeoutMs = Math.max(5_000, Number(config.webTimeoutMs ?? 180_000) || 180_000);

      if (webResultMode === "bridgeAssisted") {
        activeWebNodeIdRef.current = node.id;
        activeWebProviderRef.current = webProvider;
        activeWebPromptRef.current[webProvider] = textToSend;
        addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 웹 연결 반자동 시작`);
        addNodeLog(node.id, "[WEB] 프롬프트 자동 주입/전송을 시도합니다. 자동 전송 실패 시 웹 탭에서 전송 1회가 필요합니다.");
        setStatus(`${webProviderLabel(webProvider)} 웹 연결 대기 중 - 자동 주입/전송 준비`);
        try {
          await openUrl(webProviderHomeUrl(webProvider));
          addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 웹 탭을 자동으로 열었습니다.`);
        } catch (error) {
          addNodeLog(node.id, `[WEB] 웹 탭 자동 열기 실패: ${String(error)}`);
        }
        const workerReady = await ensureWebWorkerReady();
        if (!workerReady) {
          addNodeLog(node.id, `[WEB] 웹 연결 워커 준비 실패, 수동 입력으로 전환`);
          clearWebBridgeStageWarnTimer(webProvider);
          activeWebNodeIdRef.current = "";
          activeWebProviderRef.current = null;
          delete activeWebPromptRef.current[webProvider];
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
          const runBridgeAssisted = async (timeoutMs = webTimeoutMs) =>
            invoke<WebProviderRunResult>("web_provider_run", {
              provider: webProvider,
              prompt: textToSend,
              timeoutMs,
              mode: "bridgeAssisted",
            });

          let result: WebProviderRunResult | null = null;
          try {
            result = await runBridgeAssisted();

            if (result.ok && result.text && isLikelyWebPromptEcho(result.text, textToSend)) {
              addNodeLog(
                node.id,
                `[WEB] 입력 에코로 보이는 응답을 감지해 폐기했습니다. (${webProviderLabel(webProvider)})`,
              );
              result = {
                ok: false,
                errorCode: "PROMPT_ECHO",
                error: "웹 응답이 입력 에코로 감지되어 폐기되었습니다.",
              } as WebProviderRunResult;
            }

            if (result.ok && result.text) {
              addNodeLog(node.id, `[WEB] ${webProviderLabel(webProvider)} 웹 연결 응답 수집 완료`);
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

            const fallbackReason = `[WEB] 웹 연결 수집 실패 (${result?.errorCode ?? "UNKNOWN"}): ${
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
            addNodeLog(node.id, `[WEB] 웹 연결 예외: ${String(error)}`);
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
            clearWebBridgeStageWarnTimer(webProvider);
            activeWebNodeIdRef.current = "";
            activeWebProviderRef.current = null;
            delete activeWebPromptRef.current[webProvider];
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

    const runGroup = inferRunGroupMeta(graph, lastAppliedPresetRef.current);
    const runRecord: RunRecord = {
      runId: `${Date.now()}`,
      question: workflowQuestion,
      startedAt: new Date().toISOString(),
      workflowGroupName: runGroup.name,
      workflowGroupKind: runGroup.kind,
      workflowPresetKind: runGroup.presetKind,
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
      groupName: runGroup.name,
      groupKind: runGroup.kind,
      presetKind: runGroup.presetKind,
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

      const latestFeedSourceByNodeId = new Map<string, FeedInputSource>();
      const resolveFeedInputSources = (targetNodeId: string): FeedInputSource[] => {
        const incomingEdges = graph.edges.filter((edge) => edge.to.nodeId === targetNodeId);
        if (incomingEdges.length === 0) {
          return [
            {
              kind: "question",
              agentName: "사용자 입력 질문",
              summary: workflowQuestion.trim() || undefined,
            },
          ];
        }
        const seenNodeIds = new Set<string>();
        const sources: FeedInputSource[] = [];
        for (const edge of incomingEdges) {
          const sourceNodeId = edge.from.nodeId;
          if (!sourceNodeId || seenNodeIds.has(sourceNodeId)) {
            continue;
          }
          seenNodeIds.add(sourceNodeId);
          const known = latestFeedSourceByNodeId.get(sourceNodeId);
          const sourceNode = nodeMap.get(sourceNodeId);
          const sourceRoleLabel =
            sourceNode?.type === "turn"
              ? turnRoleLabel(sourceNode)
              : sourceNode
                ? nodeTypeLabel(sourceNode.type)
                : known?.roleLabel;
          const sourceAgentName = known?.agentName ?? (sourceNode ? nodeSelectionLabel(sourceNode) : sourceNodeId);
          sources.push({
            kind: "node",
            nodeId: sourceNodeId,
            agentName: sourceAgentName,
            roleLabel: sourceRoleLabel,
            summary: known?.summary,
            sourcePostId: known?.sourcePostId,
          });
        }
        return sources;
      };

      const rememberFeedSource = (post: FeedPost) => {
        latestFeedSourceByNodeId.set(post.nodeId, {
          kind: "node",
          nodeId: post.nodeId,
          agentName: post.agentName,
          roleLabel: post.roleLabel,
          summary: post.summary,
          sourcePostId: post.id,
        });
      };

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
        const nodeInputSources = resolveFeedInputSources(nodeId);
        const nodeInput = nodeInputFor(nodeId, outputs, workflowQuestion);

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
            inputSources: nodeInputSources,
            inputData: nodeInput,
          });
          runRecord.feedPosts?.push(cancelledFeed.post);
          rememberFeedSource(cancelledFeed.post);
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

          const input = nodeInput;

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
                inputSources: nodeInputSources,
                inputData: input,
              });
              runRecord.feedPosts?.push(failedFeed.post);
              rememberFeedSource(failedFeed.post);
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
                inputSources: nodeInputSources,
                inputData: input,
              });
              runRecord.feedPosts?.push(rejectedFeed.post);
              rememberFeedSource(rejectedFeed.post);
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
              inputSources: nodeInputSources,
              inputData: input,
            });
            runRecord.feedPosts?.push(doneFeed.post);
            rememberFeedSource(doneFeed.post);
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
                inputSources: nodeInputSources,
                inputData: input,
              });
              runRecord.feedPosts?.push(transformFailedFeed.post);
              rememberFeedSource(transformFailedFeed.post);
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
              inputSources: nodeInputSources,
              inputData: input,
            });
            runRecord.feedPosts?.push(transformDoneFeed.post);
            rememberFeedSource(transformDoneFeed.post);
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
                inputSources: nodeInputSources,
                inputData: input,
              });
              runRecord.feedPosts?.push(gateFailedFeed.post);
              rememberFeedSource(gateFailedFeed.post);
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
              inputSources: nodeInputSources,
              inputData: input,
            });
            runRecord.feedPosts?.push(gateDoneFeed.post);
            rememberFeedSource(gateDoneFeed.post);
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
      const outgoingNodeIdSet = new Set(graph.edges.map((edge) => edge.from.nodeId));
      const sinkNodeIds = graph.nodes
        .map((node) => node.id)
        .filter((nodeId) => !outgoingNodeIdSet.has(nodeId));
      const doneSinkNodeIds = sinkNodeIds.filter((nodeId) => nodeId in outputs);
      let finalNodeId = "";
      if (doneSinkNodeIds.length === 1) {
        finalNodeId = doneSinkNodeIds[0];
      } else if (doneSinkNodeIds.length > 1) {
        const doneSinkSet = new Set(doneSinkNodeIds);
        for (let index = runRecord.transitions.length - 1; index >= 0; index -= 1) {
          const row = runRecord.transitions[index];
          if (row.status !== "done" || !doneSinkSet.has(row.nodeId)) {
            continue;
          }
          finalNodeId = row.nodeId;
          break;
        }
      }
      if (!finalNodeId && lastDoneNodeId && lastDoneNodeId in outputs) {
        finalNodeId = lastDoneNodeId;
      }
      if (finalNodeId && finalNodeId in outputs) {
        runRecord.finalAnswer = extractFinalAnswer(outputs[finalNodeId]);
      }
      runRecord.finishedAt = new Date().toISOString();
      runRecord.regression = await buildRegressionSummary(runRecord);
      await saveRunRecord(runRecord);
      const normalizedRunRecord = normalizeRunRecord(runRecord);
      const runFileName = `run-${runRecord.runId}.json`;
      feedRunCacheRef.current[runFileName] = normalizedRunRecord;
      setStatus("그래프 실행 완료");
    } catch (e) {
      markCodexNodesStatusOnEngineIssue("failed", `그래프 실행 실패: ${String(e)}`, true);
      setError(String(e));
      setStatus("그래프 실행 실패");
    } finally {
      for (const timerId of Object.values(webBridgeStageWarnTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      webBridgeStageWarnTimerRef.current = {};
      activeWebPromptRef.current = {};
      turnTerminalResolverRef.current = null;
      webTurnResolverRef.current = null;
      webLoginResolverRef.current = null;
      setPendingWebTurn(null);
      setSuspendedWebTurn(null);
      setSuspendedWebResponseDraft("");
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
        clearWebBridgeStageWarnTimer(activeWebProvider);
        delete activeWebPromptRef.current[activeWebProvider];
      } catch (e) {
        setError(String(e));
      }
    }

    if (pendingWebTurn) {
      resolvePendingWebTurn({ ok: false, error: "사용자 취소" });
      return;
    }
    if (suspendedWebTurn) {
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
  const isWorkflowBusy = isGraphRunning || isRunStarting;
  const canRunGraphNow = !isWorkflowBusy && graph.nodes.length > 0 && workflowQuestion.trim().length > 0;
  const {
    currentFeedPosts,
    feedCategoryPosts,
    feedInspectorEditable,
    feedInspectorEditableNodeId,
    feedInspectorGraphNode,
    feedInspectorPost,
    feedInspectorPostKey,
    feedInspectorPostNodeId,
    feedInspectorPostSourceFile,
    feedInspectorPromptTemplate,
    feedInspectorQualityProfile,
    feedInspectorQualityThresholdOption,
    feedInspectorRuleCwd,
    feedInspectorTurnConfig,
    feedInspectorTurnExecutor,
    feedInspectorTurnNode,
    groupedFeedRuns,
  } = computeFeedDerivedState({
    activeFeedRunMeta,
    graph,
    nodeStates,
    feedPosts,
    feedStatusFilter,
    feedExecutorFilter,
    feedPeriodFilter,
    feedKeyword,
    feedCategory,
    feedRunCache: feedRunCacheRef.current,
    feedInspectorPostId,
    feedInspectorSnapshotNode,
    cwd: resolveNodeCwd(cwd, cwd),
    nodeTypeLabelFn: nodeTypeLabel,
    turnRoleLabelFn: turnRoleLabel,
    turnModelLabelFn: turnModelLabel,
  });

  const groupedFeedRunIdsKey = groupedFeedRuns.map((group) => group.runId).join("|");
  const feedCategoryMeta: Array<{ key: FeedCategory; label: string }> = [
    { key: "all_posts", label: "전체포스트" },
    { key: "completed_posts", label: "완료 답변" },
    { key: "web_posts", label: "웹 리서치" },
    { key: "error_posts", label: "오류/취소" },
  ];

  useEffect(() => {
    setFeedGroupExpandedByRunId((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const runId of groupedFeedRuns.map((group) => group.runId)) {
        if (Object.prototype.hasOwnProperty.call(prev, runId)) {
          next[runId] = prev[runId];
        } else {
          next[runId] = true;
          changed = true;
        }
      }
      for (const runId of Object.keys(prev)) {
        if (!Object.prototype.hasOwnProperty.call(next, runId)) {
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
    setFeedGroupRenameRunId((prev) =>
      prev && groupedFeedRuns.some((group) => group.runId === prev) ? prev : null,
    );
  }, [groupedFeedRunIdsKey]);

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
      <AppNav
        activeTab={workspaceTab}
        onSelectTab={setWorkspaceTab}
        renderIcon={(tab, active) => <NavIcon active={active} tab={tab} />}
      />

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
          <WorkflowPage canvasFullscreen={canvasFullscreen}>
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
                    {suspendedWebTurn && !pendingWebTurn && isGraphRunning && (
                      <button
                        aria-label="웹 입력 다시 열기"
                        className="canvas-web-turn-reopen"
                        onClick={onReopenPendingWebTurn}
                        title="웹 응답 입력 창 다시 열기"
                        type="button"
                      >
                        WEB
                      </button>
                    )}
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
                            className="graph-rename-input"
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
                                    { value: "bridgeAssisted", label: "웹 연결 반자동 (권장)" },
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
                                      Number(e.currentTarget.value) || 180_000,
                                    )
                                  }
                                  type="number"
                                  value={String((selectedNode.config as TurnConfig).webTimeoutMs ?? 180_000)}
                                />
                              </label>
                              <div className="inspector-empty">
                                웹 연결 반자동은 질문 자동 주입/답변 자동 수집을 시도하고, 실패 시 수동 입력으로 폴백합니다.
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
          </WorkflowPage>
        )}

        {workspaceTab === "feed" && (
          <FeedPage
            vm={{
              feedInspectorTurnNode,
              feedInspectorPost,
              feedInspectorEditable,
              feedInspectorEditableNodeId,
              feedInspectorTurnExecutor,
              feedInspectorTurnConfig,
              feedInspectorQualityProfile,
              feedInspectorQualityThresholdOption,
              feedInspectorPromptTemplate,
              updateNodeConfigById,
              turnModelLabel,
              turnRoleLabel,
              TURN_EXECUTOR_OPTIONS,
              turnExecutorLabel,
              TURN_MODEL_OPTIONS,
              toTurnModelDisplayName,
              DEFAULT_TURN_MODEL,
              getWebProviderFromExecutor,
              normalizeWebResultMode,
              cwd,
              QUALITY_PROFILE_OPTIONS,
              normalizeQualityThreshold,
              QUALITY_THRESHOLD_OPTIONS,
              ARTIFACT_TYPE_OPTIONS,
              toArtifactType,
              feedFilterOpen,
              setFeedFilterOpen,
              setFeedStatusFilter,
              setFeedExecutorFilter,
              setFeedPeriodFilter,
              setFeedKeyword,
              feedStatusFilter,
              feedExecutorFilter,
              feedPeriodFilter,
              feedKeyword,
              feedCategoryMeta,
              feedCategory,
              feedCategoryPosts,
              setFeedCategory,
              feedShareMenuPostId,
              setFeedShareMenuPostId,
              feedLoading,
              currentFeedPosts,
              groupedFeedRuns,
              feedGroupExpandedByRunId,
              setFeedGroupExpandedByRunId,
              feedGroupRenameRunId,
              setFeedGroupRenameRunId,
              setFeedGroupRenameDraft,
              feedGroupRenameDraft,
              onSubmitFeedRunGroupRename,
              toHumanReadableFeedText,
              hashStringToHue,
              buildFeedAvatarLabel,
              pendingNodeRequests,
              feedReplyDraftByPost,
              feedExpandedByPost,
              onSelectFeedInspectorPost,
              onShareFeedPost,
              onDeleteFeedPost,
              setFeedExpandedByPost,
              formatFeedInputSourceLabel,
              formatRunDateTime,
              formatRelativeFeedTime,
              formatDuration,
              formatUsage,
              setFeedReplyDraftByPost,
              onSubmitFeedAgentRequest,
            }}
          />
        )}

        {workspaceTab === "settings" && (
          <section className="panel-card settings-view workspace-tab-panel">
            <SettingsPage
              authModeText={authModeLabel(authMode)}
              codexAuthBusy={codexAuthBusy}
              compact={false}
              cwd={cwd}
              engineStarted={engineStarted}
              isGraphRunning={isGraphRunning}
              loginCompleted={loginCompleted}
              model={model}
              modelOptions={TURN_MODEL_OPTIONS}
              codexMultiAgentMode={codexMultiAgentMode}
              codexMultiAgentModeOptions={[...CODEX_MULTI_AGENT_MODE_OPTIONS]}
              onCheckUsage={() => void onCheckUsage()}
              onCloseUsageResult={() => setUsageResultClosed(true)}
              onOpenRunsFolder={() => void onOpenRunsFolder()}
              onSelectCwdDirectory={() => void onSelectCwdDirectory()}
              onSetModel={setModel}
              onSetCodexMultiAgentMode={(next) => setCodexMultiAgentMode(normalizeCodexMultiAgentMode(next))}
              onStartEngine={() => void onStartEngine()}
              onStopEngine={() => void onStopEngine()}
              onToggleCodexLogin={() => void onLoginCodex()}
              running={running}
              status={status}
              usageInfoText={usageInfoText}
              usageResultClosed={usageResultClosed}
            />
            {/* {lastSavedRunFile && <div>최근 실행 파일: {formatRunFileLabel(lastSavedRunFile)}</div>} */}
          </section>
        )}

        {workspaceTab === "bridge" && (
          <BridgePage
            busy={webWorkerBusy}
            connectCode={webBridgeConnectCode}
            onCopyConnectCode={() => void onCopyWebBridgeConnectCode()}
            onRefreshStatus={() => void refreshWebBridgeStatus()}
            onRestartBridge={() => void onRestartWebBridge()}
            onRotateToken={() => void onRotateWebBridgeToken()}
            status={webBridgeStatus}
          />
        )}

      </section>

      <PendingWebLoginModal
        nodeId={pendingWebLogin?.nodeId ?? ""}
        onCancel={() => resolvePendingWebLogin(false)}
        onContinueAfterLogin={() => resolvePendingWebLogin(true)}
        onOpenProviderSession={() => {
          if (!pendingWebLogin) {
            return;
          }
          void onOpenProviderSession(pendingWebLogin.provider);
        }}
        open={Boolean(pendingWebLogin)}
        providerLabel={pendingWebLogin ? webProviderLabel(pendingWebLogin.provider) : ""}
        reason={pendingWebLogin?.reason ?? ""}
      />

      <PendingWebTurnModal
        dragging={webTurnPanel.dragging}
        modeLabel={pendingWebTurn?.mode === "manualPasteJson" ? "JSON" : "텍스트"}
        nodeId={pendingWebTurn?.nodeId ?? ""}
        onCancelRun={onCancelPendingWebTurn}
        onChangeResponseDraft={setWebResponseDraft}
        onCopyPrompt={() => void onCopyPendingWebPrompt()}
        onDismiss={onDismissPendingWebTurn}
        onDragStart={webTurnPanel.onDragStart}
        onOpenProviderWindow={() => void onOpenPendingProviderWindow()}
        onSubmit={onSubmitPendingWebTurn}
        open={Boolean(pendingWebTurn)}
        panelRef={webTurnFloatingRef}
        position={webTurnPanel.position}
        prompt={pendingWebTurn?.prompt ?? ""}
        providerLabel={pendingWebTurn ? webProviderLabel(pendingWebTurn.provider) : ""}
        responseDraft={webResponseDraft}
      />

      <ApprovalModal
        decisionLabel={approvalDecisionLabel}
        decisions={APPROVAL_DECISIONS}
        method={activeApproval?.method ?? ""}
        onRespond={onRespondApproval}
        open={Boolean(activeApproval)}
        params={formatUnknown(activeApproval?.params)}
        requestId={activeApproval?.requestId ?? 0}
        sourceLabel={approvalSourceLabel(activeApproval?.source ?? "remote")}
        submitting={approvalSubmitting}
      />
    </main>
  );
}

export default App;
