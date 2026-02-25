import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import "../App.css";
import { invoke, listen, openUrl, revealItemInDir } from "../shared/tauri";
import AppNav from "../components/AppNav";
import ApprovalModal from "../components/modals/ApprovalModal";
import PendingWebLoginModal from "../components/modals/PendingWebLoginModal";
import PendingWebTurnModal from "../components/modals/PendingWebTurnModal";
import BridgePage from "../pages/bridge/BridgePage";
import FeedPage from "../pages/feed/FeedPage";
import SettingsPage from "../pages/settings/SettingsPage";
import WorkflowPage from "../pages/workflow/WorkflowPage";
import { useFloatingPanel } from "../features/ui/useFloatingPanel";
import { useExecutionState } from "./hooks/useExecutionState";
import { useFeedRunActions } from "./hooks/useFeedRunActions";
import { useFeedState } from "./hooks/useFeedState";
import { useGraphFileActions } from "./hooks/useGraphFileActions";
import { useGraphState } from "./hooks/useGraphState";
import { useWebConnectState } from "./hooks/useWebConnectState";
import { useWorkflowGraphActions } from "./hooks/useWorkflowGraphActions";
import { useWorkflowShortcuts } from "./hooks/useWorkflowShortcuts";
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
  applyPresetOutputSchemaPolicies,
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
  lifecycleStateLabel,
  nodeSelectionLabel,
  nodeStatusLabel,
  nodeTypeLabel,
  turnRoleLabel,
} from "../features/workflow/labels";
import { QUALITY_DEFAULT_THRESHOLD } from "../features/workflow/quality";
import {
  buildFinalVisualizationDirective,
  buildCodexMultiAgentDirective,
  buildForcedAgentRuleBlock,
  buildOutputSchemaDirective,
  extractPromptInputText,
  isLikelyWebPromptEcho,
  replaceInputPlaceholder,
  stringifyInput,
  toHumanReadableFeedText,
} from "../features/workflow/promptUtils";
import {
  buildFeedAvatarLabel,
  formatFeedInputSourceLabel,
  formatUsageInfoForDisplay,
  hashStringToHue,
} from "../features/feed/displayUtils";
import { computeFeedDerivedState } from "../features/feed/derivedState";
import {
  autoArrangeGraphLayout,
  buildCanvasEdgeLines,
  buildRoundedEdgePath,
  buildSimpleReadonlyTurnEdges,
  cloneGraph,
  getGraphEdgeKey,
  getNodeAnchorPoint,
  graphEquals,
  nodeCardSummary,
  snapToLayoutGrid,
  snapToNearbyNodeAxis,
  turnModelLabel,
} from "../features/workflow/graph-utils";
import type {
  GraphData,
  GraphNode,
  KnowledgeFileRef,
  NodeAnchorSide,
  NodeExecutionStatus,
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
  formatUnknown,
  formatUsage,
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
  KNOWLEDGE_DEFAULT_MAX_CHARS,
  KNOWLEDGE_DEFAULT_TOP_K,
  NavIcon,
  type TurnTerminal,
  type WorkspaceTab,
  isTurnTerminalEvent,
  normalizeKnowledgeConfig,
  toWebBridgeStatus,
  validateSimpleSchema,
} from "./mainAppGraphHelpers";
import { useI18n } from "../i18n";
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
  buildSchemaRetryInput,
  buildQualityReport,
  defaultKnowledgeConfig,
  executeGateNode,
  executeTransformNode,
  extractSchemaValidationTarget,
  feedAttachmentRawKey,
  graphSignature,
  inferRunGroupMeta,
  isCriticalTurnNode,
  mergeUsageStats,
  normalizeArtifactOutput,
  normalizeWebEvidenceOutput,
  normalizeWebTurnOutput,
  questionSignature,
  resolveProviderByExecutor,
  normalizeQualityThreshold,
  normalizeRunRecord,
  sanitizeRunRecordForSave,
  summarizeQualityMetrics,
} from "./mainAppRuntimeHelpers";
import {
  AGENT_RULE_CACHE_TTL_MS,
  AGENT_RULE_MAX_DOC_CHARS,
  AGENT_RULE_MAX_DOCS,
  APPROVAL_DECISIONS,
  AUTH_LOGIN_REQUIRED_CONFIRM_COUNT,
  AUTH_LOGIN_REQUIRED_GRACE_MS,
  AUTO_LAYOUT_DRAG_SNAP_THRESHOLD,
  AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD,
  AUTO_LAYOUT_SNAP_THRESHOLD,
  CODEX_LOGIN_COOLDOWN_MS,
  FORCE_AGENT_RULES_ALL_TURNS,
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  GRAPH_STAGE_INSET_X,
  GRAPH_STAGE_INSET_Y,
  KNOWLEDGE_MAX_CHARS_OPTIONS,
  KNOWLEDGE_TOP_K_OPTIONS,
  MAX_CANVAS_ZOOM,
  MAX_STAGE_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_CANVAS_ZOOM,
  NODE_DRAG_MARGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
  QUESTION_INPUT_MAX_HEIGHT,
  SIMPLE_WORKFLOW_UI,
  STAGE_GROW_LIMIT,
  STAGE_GROW_MARGIN,
  TURN_OUTPUT_SCHEMA_MAX_RETRY,
  WEB_BRIDGE_CLAIM_WARN_MS,
  WEB_BRIDGE_PROMPT_FILLED_WARN_MS,
  WEB_TURN_FLOATING_DEFAULT_X,
  WEB_TURN_FLOATING_DEFAULT_Y,
  WEB_TURN_FLOATING_MARGIN,
  WEB_TURN_FLOATING_MIN_VISIBLE_HEIGHT,
  WEB_TURN_FLOATING_MIN_VISIBLE_WIDTH,
} from "./main";
import WorkflowCanvasPane from "./main/WorkflowCanvasPane";
import WorkflowInspectorPane from "./main/WorkflowInspectorPane";
import type {
  AgentRuleDoc,
  AgentRulesReadResult,
  ApprovalDecision,
  AuthProbeResult,
  CanvasDisplayEdge,
  EngineApprovalRequestEvent,
  EngineLifecycleEvent,
  EngineNotificationEvent,
  FeedCategory,
  FeedInputSource,
  FeedPost,
  FeedViewPost,
  KnowledgeRetrieveResult,
  KnowledgeTraceEntry,
  LoginChatgptResult,
  LogicalPoint,
  NodeMetric,
  NodeRunState,
  NodeVisualSize,
  QualityReport,
  RegressionSummary,
  RunRecord,
  ThreadStartResult,
  UsageCheckResult,
  UsageStats,
  WebProviderRunResult,
  WebWorkerHealth,
} from "./main";

function App() {
  const { t } = useI18n();
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

  const {
    engineStarted,
    setEngineStarted,
    status,
    setStatus,
    running,
    setRunning,
    error,
    setErrorState,
    setErrorLogs,
    usageInfoText,
    setUsageInfoText,
    usageResultClosed,
    setUsageResultClosed,
    authMode,
    setAuthMode,
    codexMultiAgentMode,
    setCodexMultiAgentMode,
    loginCompleted,
    setLoginCompleted,
    codexAuthBusy,
    setCodexAuthBusy,
    pendingApprovals,
    setPendingApprovals,
    approvalSubmitting,
    setApprovalSubmitting,
    nodeStates,
    setNodeStates,
    isGraphRunning,
    setIsGraphRunning,
    isRunStarting,
    setIsRunStarting,
    runtimeNowMs,
    setRuntimeNowMs,
    cancelRequestedRef,
    activeTurnNodeIdRef,
    turnTerminalResolverRef,
    activeRunDeltaRef,
    collectingRunRef,
    runLogCollectorRef,
    feedRunCacheRef,
    runStartGuardRef,
    authLoginRequiredProbeCountRef,
    lastAuthenticatedAtRef,
    codexLoginLastAttemptAtRef,
  } = useExecutionState({
    defaultAuthMode,
    defaultCodexMultiAgentMode,
    defaultLoginCompleted,
  });
  const {
    pendingWebTurn,
    setPendingWebTurn,
    suspendedWebTurn,
    setSuspendedWebTurn,
    suspendedWebResponseDraft,
    setSuspendedWebResponseDraft,
    pendingWebLogin,
    setPendingWebLogin,
    webResponseDraft,
    setWebResponseDraft,
    setWebWorkerHealth,
    webWorkerBusy,
    setWebWorkerBusy,
    webBridgeStatus,
    setWebBridgeStatus,
    setWebBridgeLogs,
    webBridgeConnectCode,
    setWebBridgeConnectCode,
    providerChildViewOpen,
    setProviderChildViewOpen,
    activeWebNodeByProviderRef,
    webTurnResolverRef,
    webTurnQueueRef,
    webLoginResolverRef,
    pendingWebTurnAutoOpenKeyRef,
    webTurnFloatingRef,
    pendingWebLoginAutoOpenKeyRef,
    webBridgeStageWarnTimerRef,
    activeWebPromptRef,
  } = useWebConnectState();
  const {
    graph,
    setGraph,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedEdgeKey,
    setSelectedEdgeKey,
    connectFromNodeId,
    setConnectFromNodeId,
    connectFromSide,
    setConnectFromSide,
    connectPreviewStartPoint,
    setConnectPreviewStartPoint,
    connectPreviewPoint,
    setConnectPreviewPoint,
    isConnectingDrag,
    setIsConnectingDrag,
    draggingNodeIds,
    setDraggingNodeIds,
    graphFileName,
    setGraphFileName,
    selectedGraphFileName,
    setSelectedGraphFileName,
    graphRenameOpen,
    setGraphRenameOpen,
    graphRenameDraft,
    setGraphRenameDraft,
    graphFiles,
    setGraphFiles,
    canvasZoom,
    setCanvasZoom,
    panMode,
    setPanMode,
    canvasFullscreen,
    setCanvasFullscreen,
    canvasLogicalViewport,
    setCanvasLogicalViewport,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    setNodeSizeVersion,
    marqueeSelection,
    setMarqueeSelection,
    dragRef,
    edgeDragRef,
    graphCanvasRef,
    nodeSizeMapRef,
    questionInputRef,
    panRef,
    dragPointerRef,
    dragAutoPanFrameRef,
    dragWindowMoveHandlerRef,
    dragWindowUpHandlerRef,
    dragStartSnapshotRef,
    edgeDragStartSnapshotRef,
    edgeDragWindowMoveHandlerRef,
    edgeDragWindowUpHandlerRef,
    zoomStatusTimerRef,
    lastAppliedPresetRef,
    graphClipboardRef,
    graphPasteSerialRef,
  } = useGraphState({
    initialGraph: {
      version: GRAPH_SCHEMA_VERSION,
      nodes: [],
      edges: [],
      knowledge: defaultKnowledgeConfig(),
    },
    defaultStageWidth: DEFAULT_STAGE_WIDTH,
    defaultStageHeight: DEFAULT_STAGE_HEIGHT,
  });
  const {
    feedPosts,
    setFeedPosts,
    feedLoading,
    setFeedLoading,
    feedStatusFilter,
    setFeedStatusFilter,
    feedExecutorFilter,
    setFeedExecutorFilter,
    feedPeriodFilter,
    setFeedPeriodFilter,
    feedKeyword,
    setFeedKeyword,
    feedCategory,
    setFeedCategory,
    feedFilterOpen,
    setFeedFilterOpen,
    feedGroupExpandedByRunId,
    setFeedGroupExpandedByRunId,
    feedGroupRenameRunId,
    setFeedGroupRenameRunId,
    feedGroupRenameDraft,
    setFeedGroupRenameDraft,
    feedExpandedByPost,
    setFeedExpandedByPost,
    feedShareMenuPostId,
    setFeedShareMenuPostId,
    feedReplyDraftByPost,
    setFeedReplyDraftByPost,
    feedReplySubmittingByPost,
    setFeedReplySubmittingByPost,
    feedReplyFeedbackByPost,
    setFeedReplyFeedbackByPost,
    feedInspectorPostId,
    setFeedInspectorPostId,
    feedInspectorSnapshotNode,
    setFeedInspectorSnapshotNode,
    setFeedInspectorRuleDocs,
    setFeedInspectorRuleLoading,
    pendingNodeRequests,
    setPendingNodeRequests,
    activeFeedRunMeta,
    setActiveFeedRunMeta,
    setLastSavedRunFile,
    feedRawAttachmentRef,
    pendingNodeRequestsRef,
    agentRulesCacheRef,
    feedReplyFeedbackClearTimerRef,
  } = useFeedState();
  const hasTauriRuntime = useMemo(
    () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__),
    [],
  );
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

  const {
    onShareFeedPost,
    onDeleteFeedRunGroup,
    onSubmitFeedRunGroupRename,
  } = useFeedRunActions({
    setError,
    setStatus,
    setFeedShareMenuPostId,
    setFeedPosts,
    setFeedInspectorPostId,
    setFeedGroupExpandedByRunId,
    feedGroupRenameRunId,
    setFeedGroupRenameRunId,
    feedGroupRenameDraft,
    setFeedGroupRenameDraft,
    activeFeedRunMeta,
    setActiveFeedRunMeta,
    feedRunCacheRef,
    ensureFeedRunRecord,
    persistRunRecordFile,
  });

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
      const activeWebNodeId = activeWebNodeByProviderRef.current[providerKey as WebProvider];
      if (activeWebNodeId) {
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
              const stage = extractStringByPaths(payload.params, ["stage"]);
              const provider = extractStringByPaths(payload.params, ["provider"])?.toLowerCase() ?? "";
              const providerKey = provider && WEB_PROVIDER_OPTIONS.includes(provider as WebProvider)
                ? (provider as WebProvider)
                : null;
              const activeWebNodeId = providerKey
                ? activeWebNodeByProviderRef.current[providerKey]
                : "";
              if (activeWebNodeId && message) {
                addNodeLog(activeWebNodeId, `[WEB] ${message}`);
              }
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
                          const activeWebNodeId = activeWebNodeByProviderRef.current[providerKey];
                          if (activeWebNodeId) {
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

  async function onSubmitFeedAgentRequest(post: FeedViewPost) {
    const postId = String(post.id ?? "");
    const draft = (feedReplyDraftByPost[postId] ?? "").trim();
    if (!draft) {
      return;
    }
    if (!postId || feedReplySubmittingByPost[postId]) {
      return;
    }
    const existingClearTimer = feedReplyFeedbackClearTimerRef.current[postId];
    if (existingClearTimer) {
      window.clearTimeout(existingClearTimer);
      delete feedReplyFeedbackClearTimerRef.current[postId];
    }
    setFeedReplySubmittingByPost((prev) => ({ ...prev, [postId]: true }));
    setFeedReplyFeedbackByPost((prev) => ({ ...prev, [postId]: "요청 전송 중..." }));
    let replyFeedbackText = "";
    let node = graph.nodes.find((row) => row.id === post.nodeId);
    const existsInCurrentGraph = !!node && node.type === "turn";

    try {
      if ((!node || node.type !== "turn") && post.sourceFile) {
        const runRecord = await ensureFeedRunRecord(post.sourceFile);
        const snapshotNode = runRecord?.graphSnapshot?.nodes?.find((row: any) => row?.id === post.nodeId) ?? null;
        if (snapshotNode && snapshotNode.type === "turn") {
          node = {
            ...snapshotNode,
            position:
              snapshotNode.position && typeof snapshotNode.position === "object"
                ? { ...snapshotNode.position }
                : { x: 0, y: 0 },
            config: JSON.parse(JSON.stringify(snapshotNode.config ?? {})),
          } as GraphNode;
        }
      }

      if (!node || node.type !== "turn") {
        setError("이 포스트의 원본 노드 정보를 찾을 수 없습니다.");
        replyFeedbackText = "요청 불가: 원본 노드를 찾지 못했습니다.";
        return;
      }

      if (isGraphRunning) {
        if (!existsInCurrentGraph) {
          setError("현재 실행 중인 그래프에 없는 포스트입니다. 실행 종료 후 추가 요청을 보내세요.");
          replyFeedbackText = "요청 불가: 현재 실행 그래프에 없는 포스트입니다.";
          return;
        }
        enqueueNodeRequest(node.id, draft);
        setFeedReplyDraftByPost((prev) => ({
          ...prev,
          [postId]: "",
        }));
        setStatus(`${turnModelLabel(node)} 에이전트 요청을 큐에 추가했습니다.`);
        replyFeedbackText = "요청이 대기열에 추가되었습니다.";
        return;
      }

      enqueueNodeRequest(node.id, draft);
      setFeedReplyDraftByPost((prev) => ({
        ...prev,
        [postId]: "",
      }));

      const oneOffRunId = `manual-${Date.now()}`;
      const startedAt = new Date().toISOString();
      const followupInput = [
        post.question ? `[원래 질문]\n${post.question}` : "",
        post.summary ? `[이전 결과 요약]\n${post.summary}` : "",
        `[사용자 추가 요청]\n${draft}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const oneOffRunFileName = `run-${oneOffRunId}.json`;

      setNodeStatus(node.id, "running", "피드 추가 요청 실행 시작");
      setNodeRuntimeFields(node.id, {
        status: "running",
        startedAt,
        finishedAt: undefined,
        durationMs: undefined,
        error: undefined,
      });
      const startedAtMs = Date.now();
      const turnExecution = await executeTurnNodeWithOutputSchemaRetry(node, followupInput);
      const result = turnExecution.result;
      const effectiveOutput = turnExecution.normalizedOutput ?? result.output;
      for (const warning of turnExecution.artifactWarnings) {
        addNodeLog(node.id, `[아티팩트] ${warning}`);
      }
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
          output: effectiveOutput,
          error: result.error,
          durationMs,
          usage: result.usage,
          inputSources: post.inputSources ?? [],
          inputData: followupInput,
        });
        feedRawAttachmentRef.current[feedAttachmentRawKey(failed.post.id, "markdown")] =
          failed.rawAttachments.markdown;
        feedRawAttachmentRef.current[feedAttachmentRawKey(failed.post.id, "json")] = failed.rawAttachments.json;
        const failedRunRecord: RunRecord = {
          runId: oneOffRunId,
          question: post.question ?? workflowQuestion,
          startedAt,
          finishedAt,
          workflowGroupName: t("group.followup"),
          workflowGroupKind: "custom",
          graphSnapshot: {
            version: GRAPH_SCHEMA_VERSION,
            nodes: [node],
            edges: [],
            knowledge: defaultKnowledgeConfig(),
          },
          transitions: [
            { at: startedAt, nodeId: node.id, status: "running" },
            {
              at: finishedAt,
              nodeId: node.id,
              status: "failed",
              message: result.error ?? "피드 추가 요청 실행 실패",
            },
          ],
          summaryLogs: [`[${node.id}] running`, `[${node.id}] failed: ${result.error ?? "실행 실패"}`],
          nodeLogs: {
            [node.id]: nodeStates[node.id]?.logs ?? [],
          },
          threadTurnMap: {
            [node.id]: {
              threadId: result.threadId,
              turnId: result.turnId,
            },
          },
          providerTrace: [
            {
              nodeId: node.id,
              executor: result.executor,
              provider: result.provider,
              status: "failed",
              startedAt,
              finishedAt,
              summary: result.error ?? "피드 추가 요청 실행 실패",
            },
          ],
          feedPosts: [failed.post],
        };
        await persistRunRecordFile(oneOffRunFileName, failedRunRecord);
        feedRunCacheRef.current[oneOffRunFileName] = normalizeRunRecord(failedRunRecord);
        setFeedPosts((prev) => [
          {
            ...failed.post,
            sourceFile: oneOffRunFileName,
            question: post.question,
          },
          ...prev,
        ]);
        setStatus("피드 추가 요청 실행 실패");
        replyFeedbackText = "요청 실행 실패";
        return;
      }

      setNodeStatus(node.id, "done", "피드 추가 요청 실행 완료");
      setNodeRuntimeFields(node.id, {
        status: "done",
        output: effectiveOutput,
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
        output: effectiveOutput,
        durationMs,
        usage: result.usage,
        inputSources: post.inputSources ?? [],
        inputData: followupInput,
      });
      feedRawAttachmentRef.current[feedAttachmentRawKey(done.post.id, "markdown")] = done.rawAttachments.markdown;
      feedRawAttachmentRef.current[feedAttachmentRawKey(done.post.id, "json")] = done.rawAttachments.json;
      const doneRunRecord: RunRecord = {
        runId: oneOffRunId,
        question: post.question ?? workflowQuestion,
        startedAt,
        finishedAt,
        workflowGroupName: t("group.followup"),
        workflowGroupKind: "custom",
        finalAnswer: extractFinalAnswer(effectiveOutput),
        graphSnapshot: {
          version: GRAPH_SCHEMA_VERSION,
          nodes: [node],
          edges: [],
          knowledge: defaultKnowledgeConfig(),
        },
        transitions: [
          { at: startedAt, nodeId: node.id, status: "running" },
          {
            at: finishedAt,
            nodeId: node.id,
            status: "done",
            message: "피드 추가 요청 실행 완료",
          },
        ],
        summaryLogs: [`[${node.id}] running`, `[${node.id}] done`],
        nodeLogs: {
          [node.id]: nodeStates[node.id]?.logs ?? [],
        },
        threadTurnMap: {
          [node.id]: {
            threadId: result.threadId,
            turnId: result.turnId,
          },
        },
        providerTrace: [
          {
            nodeId: node.id,
            executor: result.executor,
            provider: result.provider,
            status: "done",
            startedAt,
            finishedAt,
            summary: "피드 추가 요청 실행 완료",
          },
        ],
        feedPosts: [done.post],
      };
      await persistRunRecordFile(oneOffRunFileName, doneRunRecord);
      feedRunCacheRef.current[oneOffRunFileName] = normalizeRunRecord(doneRunRecord);
      setFeedPosts((prev) => [
        {
          ...done.post,
          sourceFile: oneOffRunFileName,
          question: post.question,
        },
        ...prev,
      ]);
      setStatus("피드 추가 요청 실행 완료");
      replyFeedbackText = "요청 실행 완료";
    } catch (error) {
      setError(`피드 추가 요청 실행 실패: ${String(error)}`);
      replyFeedbackText = "요청 실행 실패";
    } finally {
      setFeedReplySubmittingByPost((prev) => {
        if (!(postId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      if (replyFeedbackText) {
        setFeedReplyFeedbackByPost((prev) => ({
          ...prev,
          [postId]: replyFeedbackText,
        }));
        if (replyFeedbackText.includes("요청 실행 완료")) {
          const timerId = window.setTimeout(() => {
            setFeedReplyFeedbackByPost((prev) => {
              if (!(postId in prev)) {
                return prev;
              }
              const next = { ...prev };
              delete next[postId];
              return next;
            });
            delete feedReplyFeedbackClearTimerRef.current[postId];
          }, 10_000);
          feedReplyFeedbackClearTimerRef.current[postId] = timerId;
        }
      }
    }
  }

  useEffect(() => {
    refreshGraphFiles();
    refreshFeedTimeline();
  }, []);

  useEffect(() => {
    setStatus("대기 중");
    return () => {
      for (const timerId of Object.values(feedReplyFeedbackClearTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      feedReplyFeedbackClearTimerRef.current = {};
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

  async function refreshWebBridgeStatus(silent = false, forceRpc = false) {
    if (!forceRpc) {
      const health = await refreshWebWorkerHealth(true);
      if (health?.bridge) {
        const next = toWebBridgeStatus(health.bridge);
        setWebBridgeStatus(next);
        return next;
      }
      return null;
    }
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
      await refreshWebBridgeStatus(true, true);
      await onCopyWebBridgeConnectCode();
    } catch (error) {
      setError(`웹 연결 재시작 실패: ${String(error)}`);
    } finally {
      setWebWorkerBusy(false);
    }
  }

  async function onCopyWebBridgeConnectCode() {
    try {
      const status = await refreshWebBridgeStatus(true, true);
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
    webTurnPanel.setPosition({
      x: WEB_TURN_FLOATING_DEFAULT_X,
      y: WEB_TURN_FLOATING_DEFAULT_Y,
    });
    window.setTimeout(() => {
      const panel = webTurnFloatingRef.current;
      const textarea = panel?.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus({ preventScroll: true });
      }
    }, 0);
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
    return;
  }, [workspaceTab]);

  useEffect(() => {
    if (workspaceTab !== "bridge") {
      return;
    }
    void refreshWebWorkerHealth(true);
    return undefined;
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

  function onOpenWebInputForNode(nodeId: string) {
    if (pendingWebTurn?.nodeId === nodeId) {
      webTurnPanel.setPosition({
        x: WEB_TURN_FLOATING_DEFAULT_X,
        y: WEB_TURN_FLOATING_DEFAULT_Y,
      });
      setStatus("해당 WEB 노드의 수동 입력 창이 이미 열려 있습니다.");
      return;
    }

    if (suspendedWebTurn?.nodeId === nodeId) {
      onReopenPendingWebTurn();
      return;
    }

    const queuedIndex = webTurnQueueRef.current.findIndex((row) => row.turn.nodeId === nodeId);
    if (queuedIndex >= 0) {
      if (pendingWebTurn || webTurnResolverRef.current) {
        if (queuedIndex > 0) {
          const [target] = webTurnQueueRef.current.splice(queuedIndex, 1);
          if (target) {
            webTurnQueueRef.current.unshift(target);
          }
        }
        setStatus("해당 WEB 노드 입력은 대기열 맨 앞으로 이동했습니다.");
        return;
      }

      const [target] = webTurnQueueRef.current.splice(queuedIndex, 1);
      if (!target) {
        return;
      }
      setPendingWebTurn(target.turn);
      setWebResponseDraft("");
      setSuspendedWebTurn(null);
      setSuspendedWebResponseDraft("");
      webTurnResolverRef.current = target.resolve;
      webTurnPanel.setPosition({
        x: WEB_TURN_FLOATING_DEFAULT_X,
        y: WEB_TURN_FLOATING_DEFAULT_Y,
      });
      setStatus(`${webProviderLabel(target.turn.provider)} 웹 응답 입력 창을 상단에 표시했습니다.`);
      return;
    }

    setError("해당 WEB 노드의 수동 입력 대기 항목이 없습니다.");
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

  function pickDefaultCanvasNodeId(nodes: GraphNode[]): string {
    if (!SIMPLE_WORKFLOW_UI) {
      return nodes[0]?.id ?? "";
    }
    return nodes.find((node) => node.type === "turn")?.id ?? "";
  }

  const {
    addNode,
    deleteNodes,
    deleteNode,
    hasUserTextSelection,
    copySelectedNodesToClipboard,
    pasteNodesFromClipboard,
    onNodeAnchorDragStart,
    onNodeAnchorDrop,
    onNodeConnectDrop,
  } = useWorkflowGraphActions({
    graph,
    canvasNodeIdSet,
    selectedNodeIds,
    getBoundedStageSize: () => ({ width: boundedStageWidth, height: boundedStageHeight }),
    canvasZoom,
    graphCanvasRef,
    graphClipboardRef,
    graphPasteSerialRef,
    connectFromNodeId,
    connectFromSide,
    setConnectFromNodeId,
    setConnectFromSide,
    setConnectPreviewStartPoint,
    setConnectPreviewPoint,
    setIsConnectingDrag,
    setMarqueeSelection,
    setNodeSelection,
    setSelectedEdgeKey,
    setNodeStates,
    setStatus,
    applyGraphChange,
    getNodeVisualSize,
  });

  function applyPreset(kind: PresetKind) {
    const builtPreset = buildPresetGraphByKind(kind);
    const presetWithPolicies = applyPresetOutputSchemaPolicies({
      ...builtPreset,
      nodes: applyPresetTurnPolicies(kind, builtPreset.nodes),
    });
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

  const {
    updateNodeConfigById,
    updateSelectedNodeConfig,
    saveGraph,
    renameGraph,
    onOpenRenameGraph,
    onCloseRenameGraph,
    deleteGraph,
    loadGraph,
  } = useGraphFileActions({
    graph,
    graphFileName,
    selectedGraphFileName,
    graphRenameDraft,
    selectedNode,
    setError,
    refreshGraphFiles,
    setGraphFileName,
    setSelectedGraphFileName,
    setStatus,
    setGraphRenameDraft,
    setGraphRenameOpen,
    setGraph,
    setUndoStack,
    setRedoStack,
    setNodeSelection,
    setSelectedEdgeKey,
    setNodeStates,
    setConnectFromNodeId,
    setConnectFromSide,
    setConnectPreviewStartPoint,
    setConnectPreviewPoint,
    setIsConnectingDrag,
    setMarqueeSelection,
    lastAppliedPresetRef,
    pickDefaultCanvasNodeId,
    extractSelectedNodeId: (node) => node.id,
  });

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

  useWorkflowShortcuts({
    workspaceTab,
    setWorkspaceTab,
    setStatus,
    canvasFullscreen,
    setCanvasFullscreen,
    selectedNodeId,
    selectedNodeIds,
    canvasNodes,
    canvasNodeIdSet,
    canvasDisplayEdges,
    selectedEdgeKey,
    setSelectedEdgeKey,
    setNodeSelection,
    applyGraphChange,
    deleteNodes,
    copySelectedNodesToClipboard,
    pasteNodesFromClipboard,
    hasUserTextSelection,
    setPanMode,
    graph,
  });

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
      clearQueuedWebTurnRequests("화면이 닫혀 실행이 취소되었습니다.");
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

  async function persistRunRecordFile(name: string, runRecord: RunRecord) {
    await invoke("run_save", {
      name,
      run: sanitizeRunRecordForSave(runRecord),
    });
  }

  async function saveRunRecord(runRecord: RunRecord) {
    const fileName = `run-${runRecord.runId}.json`;
    try {
      await persistRunRecordFile(fileName, runRecord);
      setLastSavedRunFile(fileName);
      await refreshFeedTimeline();
    } catch (e) {
      setError(String(e));
    }
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

  function resolvePendingWebTurn(result: { ok: boolean; output?: unknown; error?: string }) {
    const resolver = webTurnResolverRef.current;
    webTurnResolverRef.current = null;
    webTurnPanel.clearDragging();
    const nextQueued = webTurnQueueRef.current.shift() ?? null;
    if (nextQueued) {
      setPendingWebTurn(nextQueued.turn);
      setSuspendedWebTurn(null);
      setSuspendedWebResponseDraft("");
      setWebResponseDraft("");
      webTurnResolverRef.current = nextQueued.resolve;
      webTurnPanel.setPosition({
        x: WEB_TURN_FLOATING_DEFAULT_X,
        y: WEB_TURN_FLOATING_DEFAULT_Y,
      });
      setStatus(`${webProviderLabel(nextQueued.turn.provider)} 웹 응답 입력 창을 상단에 표시했습니다.`);
    } else {
      setPendingWebTurn(null);
      setSuspendedWebTurn(null);
      setSuspendedWebResponseDraft("");
      setWebResponseDraft("");
    }
    if (resolver) {
      resolver(result);
    }
  }

  function clearQueuedWebTurnRequests(reason: string) {
    const queued = [...webTurnQueueRef.current];
    webTurnQueueRef.current = [];
    for (const request of queued) {
      request.resolve({ ok: false, error: reason });
    }
  }

  async function requestWebTurnResponse(
    nodeId: string,
    provider: WebProvider,
    prompt: string,
    mode: WebResultMode,
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const turn = {
      nodeId,
      provider,
      prompt,
      mode,
    };
    return new Promise((resolve) => {
      if (!pendingWebTurn && !webTurnResolverRef.current) {
        setWebResponseDraft("");
        setSuspendedWebTurn(null);
        setSuspendedWebResponseDraft("");
        setPendingWebTurn(turn);
        webTurnResolverRef.current = resolve;
        webTurnPanel.setPosition({
          x: WEB_TURN_FLOATING_DEFAULT_X,
          y: WEB_TURN_FLOATING_DEFAULT_Y,
        });
        return;
      }
      webTurnQueueRef.current.push({ turn, resolve });
      addNodeLog(nodeId, `[WEB] 수동 입력 대기열 등록 (${webTurnQueueRef.current.length})`);
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
    const shouldForceAgentRules =
      FORCE_AGENT_RULES_ALL_TURNS || inferQualityProfile(node, config) === "code_implementation";
    if (agentRuleDocs.length > 0 && shouldForceAgentRules) {
      addNodeLog(node.id, `[규칙] agent/skill 문서 ${agentRuleDocs.length}개 강제 적용`);
    }
    const forcedRuleBlock = shouldForceAgentRules ? buildForcedAgentRuleBlock(agentRuleDocs) : "";
    const withKnowledge = await injectKnowledgeContext(node, promptWithRequests, config);
    let textToSend = forcedRuleBlock
      ? `${forcedRuleBlock}\n\n${withKnowledge.prompt}`.trim()
      : withKnowledge.prompt;
    const knowledgeTrace = withKnowledge.trace;
    const shouldAutoVisualization = inferQualityProfile(node, config) === "synthesis_final";
    const visualizationDirective = shouldAutoVisualization ? buildFinalVisualizationDirective() : "";
    if (visualizationDirective) {
      textToSend = `${textToSend}\n\n${visualizationDirective}`.trim();
      addNodeLog(node.id, "[시각화] 품질 프로필(최종 종합) 기반 시각화 지침 자동 적용");
    }
    const outputSchemaDirective = buildOutputSchemaDirective(String(config.outputSchemaJson ?? ""));
    if (outputSchemaDirective) {
      textToSend = `${textToSend}\n\n${outputSchemaDirective}`.trim();
      addNodeLog(node.id, "[스키마] 출력 스키마 지시를 프롬프트에 자동 주입했습니다.");
    }
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
        activeWebNodeByProviderRef.current[webProvider] = node.id;
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
          delete activeWebNodeByProviderRef.current[webProvider];
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
                output: normalizeWebEvidenceOutput(
                  webProvider,
                  {
                    provider: webProvider,
                    timestamp: new Date().toISOString(),
                    text: result.text,
                    raw: result.raw,
                    meta: result.meta,
                  },
                  "bridgeAssisted",
                ),
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
            ).then((fallback) => {
              const normalizedFallback =
                fallback.ok && fallback.output !== undefined
                  ? {
                      ...fallback,
                      output: normalizeWebEvidenceOutput(
                        webProvider,
                        fallback.output,
                        "manualPasteText",
                      ),
                    }
                  : fallback;
              return {
                ...normalizedFallback,
                executor,
                provider: webProvider,
                knowledgeTrace,
              };
            });
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
            ).then((fallback) => {
              const normalizedFallback =
                fallback.ok && fallback.output !== undefined
                  ? {
                      ...fallback,
                      output: normalizeWebEvidenceOutput(
                        webProvider,
                        fallback.output,
                        "manualPasteText",
                      ),
                    }
                  : fallback;
              return {
                ...normalizedFallback,
                executor,
                provider: webProvider,
                knowledgeTrace,
              };
            });
          } finally {
            clearWebBridgeStageWarnTimer(webProvider);
            delete activeWebNodeByProviderRef.current[webProvider];
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

  async function executeTurnNodeWithOutputSchemaRetry(
    node: GraphNode,
    input: unknown,
    options?: { maxRetry?: number },
  ): Promise<{
    result: Awaited<ReturnType<typeof executeTurnNode>>;
    normalizedOutput?: unknown;
    artifactWarnings: string[];
  }> {
    const config = node.config as TurnConfig;
    const executor = getTurnExecutor(config);
    const provider = resolveProviderByExecutor(executor);
    const artifactType = toArtifactType(config.artifactType);
    const warnings: string[] = [];
    const schemaRaw = String(config.outputSchemaJson ?? "").trim();

    let parsedSchema: unknown | null = null;
    if (schemaRaw) {
      try {
        parsedSchema = JSON.parse(schemaRaw);
      } catch (error) {
        return {
          result: {
            ok: false,
            error: `출력 스키마 JSON 형식 오류: ${String(error)}`,
            executor,
            provider,
          },
          artifactWarnings: warnings,
        };
      }
    }

    let result = await executeTurnNode(node, input);
    if (!result.ok) {
      return { result, artifactWarnings: warnings };
    }

    let normalized = normalizeArtifactOutput(node.id, artifactType, result.output);
    warnings.push(...normalized.warnings);
    let normalizedOutput = normalized.output;
    if (!parsedSchema) {
      return { result, normalizedOutput, artifactWarnings: warnings };
    }

    let schemaErrors = validateSimpleSchema(parsedSchema, extractSchemaValidationTarget(normalizedOutput));
    if (schemaErrors.length === 0) {
      return { result, normalizedOutput, artifactWarnings: warnings };
    }

    const maxRetry = Math.max(0, options?.maxRetry ?? TURN_OUTPUT_SCHEMA_MAX_RETRY);
    addNodeLog(node.id, `[스키마] 검증 실패: ${schemaErrors.join("; ")}`);
    if (maxRetry > 0) {
      addNodeLog(node.id, `[스키마] 재질문 ${maxRetry}회 제한 내에서 재시도합니다.`);
    } else {
      addNodeLog(node.id, "[스키마] 자동 재질문이 비활성화되어 즉시 실패 처리합니다.");
    }

    let attempts = 0;
    let accumulatedUsage = result.usage;

    while (attempts < maxRetry && schemaErrors.length > 0) {
      attempts += 1;
      const retryInput = buildSchemaRetryInput(input, normalizedOutput, parsedSchema, schemaErrors);
      const retryResult = await executeTurnNode(node, retryInput);
      accumulatedUsage = mergeUsageStats(accumulatedUsage, retryResult.usage);
      result = {
        ...retryResult,
        usage: accumulatedUsage,
      };
      if (!result.ok) {
        return {
          result: {
            ...result,
            error: `출력 스키마 재질문 실패: ${result.error ?? "턴 실행 실패"}`,
          },
          normalizedOutput,
          artifactWarnings: warnings,
        };
      }

      normalized = normalizeArtifactOutput(node.id, artifactType, result.output);
      warnings.push(...normalized.warnings);
      normalizedOutput = normalized.output;
      schemaErrors = validateSimpleSchema(parsedSchema, extractSchemaValidationTarget(normalizedOutput));
    }

    if (schemaErrors.length > 0) {
      return {
        result: {
          ...result,
          ok: false,
          output: normalizedOutput,
          error: `출력 스키마 검증 실패: ${schemaErrors.join("; ")}`,
          usage: accumulatedUsage,
        },
        normalizedOutput,
        artifactWarnings: warnings,
      };
    }

    addNodeLog(node.id, "[스키마] 출력 스키마 검증 PASS");
    return {
      result: {
        ...result,
        output: normalizedOutput,
        usage: accumulatedUsage,
      },
      normalizedOutput,
      artifactWarnings: warnings,
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
      const incoming = new Map<string, string[]>();
      const terminalStateByNodeId: Record<string, NodeExecutionStatus> = {};

      for (const node of graph.nodes) {
        indegree.set(node.id, 0);
        adjacency.set(node.id, []);
        incoming.set(node.id, []);
      }

      for (const edge of graph.edges) {
        indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
        const children = adjacency.get(edge.from.nodeId) ?? [];
        children.push(edge.to.nodeId);
        adjacency.set(edge.from.nodeId, children);
        const parents = incoming.get(edge.to.nodeId) ?? [];
        parents.push(edge.from.nodeId);
        incoming.set(edge.to.nodeId, parents);
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

      const dagMaxThreads = codexMultiAgentMode === "max" ? 4 : codexMultiAgentMode === "balanced" ? 2 : 1;
      const activeTasks = new Map<string, Promise<void>>();
      let activeTurnTasks = 0;

      const scheduleChildren = (nodeId: string) => {
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
      };

      const processNode = async (nodeId: string): Promise<void> => {
        const node = nodeMap.get(nodeId);
        if (!node) {
          return;
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
          terminalStateByNodeId[nodeId] = "cancelled";
          scheduleChildren(nodeId);
          return;
        }

        if (skipSet.has(nodeId)) {
          setNodeStatus(nodeId, "skipped", "분기 결과로 건너뜀");
          setNodeRuntimeFields(nodeId, {
            status: "skipped",
            finishedAt: new Date().toISOString(),
          });
          transition(runRecord, nodeId, "skipped", "분기 결과로 건너뜀");
          terminalStateByNodeId[nodeId] = "skipped";
          scheduleChildren(nodeId);
          return;
        }

        const parentIds = incoming.get(nodeId) ?? [];
        const missingParent = parentIds.find((parentId) => !(parentId in outputs));
        if (missingParent) {
          const blockedAtIso = new Date().toISOString();
          const blockedReason = `선행 노드(${missingParent}) 결과 없음으로 건너뜀`;
          setNodeStatus(nodeId, "skipped", blockedReason);
          setNodeRuntimeFields(nodeId, {
            status: "skipped",
            finishedAt: blockedAtIso,
          });
          transition(runRecord, nodeId, "skipped", blockedReason);
          const blockedFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            status: "cancelled",
            createdAt: blockedAtIso,
            summary: blockedReason,
            logs: runLogCollectorRef.current[nodeId] ?? [],
            inputSources: nodeInputSources,
            inputData: nodeInput,
          });
          runRecord.feedPosts?.push(blockedFeed.post);
          rememberFeedSource(blockedFeed.post);
          feedRawAttachmentRef.current[feedAttachmentRawKey(blockedFeed.post.id, "markdown")] =
            blockedFeed.rawAttachments.markdown;
          feedRawAttachmentRef.current[feedAttachmentRawKey(blockedFeed.post.id, "json")] =
            blockedFeed.rawAttachments.json;
          terminalStateByNodeId[nodeId] = "skipped";
          scheduleChildren(nodeId);
          return;
        }

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
          const isFinalTurnNode = (adjacency.get(nodeId)?.length ?? 0) === 0;
          const turnExecution = await executeTurnNodeWithOutputSchemaRetry(node, input, {
            maxRetry: isFinalTurnNode ? 1 : 0,
          });
          let result = turnExecution.result;
          const schemaFallbackUsed =
            !result.ok &&
            turnExecution.normalizedOutput !== undefined &&
            String(result.error ?? "").startsWith("출력 스키마 검증 실패");
          if (schemaFallbackUsed) {
            addNodeLog(nodeId, "[스키마] 검증 실패: 생성된 문서를 보존하고 후속 단계로 진행합니다.");
            result = {
              ...result,
              ok: true,
              output: turnExecution.normalizedOutput,
              error: undefined,
            };
          }
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
            terminalStateByNodeId[nodeId] = "failed";
            scheduleChildren(nodeId);
            return;
          }

          const config = node.config as TurnConfig;
          for (const warning of turnExecution.artifactWarnings) {
            addNodeLog(nodeId, `[아티팩트] ${warning}`);
          }
          const normalizedOutput = turnExecution.normalizedOutput ?? result.output;
          if (schemaFallbackUsed) {
            addNodeLog(nodeId, "[스키마] 경고: 스키마 불일치 상태의 문서를 채택했습니다.");
          }
          let qualityReport: QualityReport | undefined;
          if (isFinalTurnNode) {
            const finalQualityReport = await buildQualityReport({
              node,
              config,
              output: normalizedOutput,
              cwd: String(config.cwd ?? cwd).trim() || cwd,
            });
            qualityReport = finalQualityReport;
            const nodeMetric: NodeMetric = {
              nodeId,
              profile: finalQualityReport.profile,
              score: finalQualityReport.score,
              decision: finalQualityReport.decision,
              threshold: finalQualityReport.threshold,
              failedChecks: finalQualityReport.failures.length,
              warningCount: finalQualityReport.warnings.length,
            };
            runRecord.nodeMetrics = {
              ...(runRecord.nodeMetrics ?? {}),
              [nodeId]: nodeMetric,
            };
            for (const warning of finalQualityReport.warnings) {
              addNodeLog(nodeId, `[품질] ${warning}`);
            }
            if (finalQualityReport.decision !== "PASS") {
              const finishedAtIso = new Date().toISOString();
              setNodeStatus(nodeId, "failed", "품질 게이트 REJECT");
              setNodeRuntimeFields(nodeId, {
                status: "failed",
                output: normalizedOutput,
                qualityReport: finalQualityReport,
                error: `품질 게이트 REJECT (점수 ${finalQualityReport.score}/${finalQualityReport.threshold})`,
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
                summary: `품질 REJECT (${finalQualityReport.score}/${finalQualityReport.threshold})`,
              });
              transition(
                runRecord,
                nodeId,
                "failed",
                `품질 REJECT (${finalQualityReport.score}/${finalQualityReport.threshold})`,
              );
              const rejectedFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                status: "failed",
                createdAt: finishedAtIso,
                summary: `품질 REJECT (${finalQualityReport.score}/${finalQualityReport.threshold})`,
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: normalizedOutput,
                error: `품질 게이트 REJECT (점수 ${finalQualityReport.score}/${finalQualityReport.threshold})`,
                durationMs: Date.now() - startedAtMs,
                usage: result.usage,
                qualityReport: finalQualityReport,
                inputSources: nodeInputSources,
                inputData: input,
              });
              runRecord.feedPosts?.push(rejectedFeed.post);
              rememberFeedSource(rejectedFeed.post);
              feedRawAttachmentRef.current[feedAttachmentRawKey(rejectedFeed.post.id, "markdown")] =
                rejectedFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(rejectedFeed.post.id, "json")] =
                rejectedFeed.rawAttachments.json;
              terminalStateByNodeId[nodeId] = "failed";
              scheduleChildren(nodeId);
              return;
            }
          } else {
            addNodeLog(nodeId, "[품질] 중간 노드는 품질 게이트를 생략합니다. (최종 노드만 검증)");
          }

          const finishedAtIso = new Date().toISOString();
          outputs[nodeId] = normalizedOutput;
          if (qualityReport) {
            addNodeLog(nodeId, `[품질] PASS (${qualityReport.score}/${qualityReport.threshold})`);
          }
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
          setNodeStatus(nodeId, "done", t("run.turnCompleted"));
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
            summary: t("run.turnCompleted"),
          });
          transition(runRecord, nodeId, "done", t("run.turnCompleted"));
          const doneFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            status: "done",
            createdAt: finishedAtIso,
            summary: t("run.turnCompleted"),
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
          terminalStateByNodeId[nodeId] = "done";
          scheduleChildren(nodeId);
          return;
        }

        if (node.type === "transform") {
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
            feedRawAttachmentRef.current[feedAttachmentRawKey(transformFailedFeed.post.id, "markdown")] =
              transformFailedFeed.rawAttachments.markdown;
            feedRawAttachmentRef.current[feedAttachmentRawKey(transformFailedFeed.post.id, "json")] =
              transformFailedFeed.rawAttachments.json;
            terminalStateByNodeId[nodeId] = "failed";
            scheduleChildren(nodeId);
            return;
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
          terminalStateByNodeId[nodeId] = "done";
          scheduleChildren(nodeId);
          return;
        }

        const gateResult = executeGateNode({
          node,
          input,
          skipSet,
          graph,
          simpleWorkflowUi: SIMPLE_WORKFLOW_UI,
          addNodeLog,
          validateSimpleSchema,
        });
        if (!gateResult.ok) {
          const finishedAtIso = new Date().toISOString();
          setNodeStatus(nodeId, "failed", gateResult.error ?? "분기 실패");
          setNodeRuntimeFields(nodeId, {
            status: "failed",
            error: gateResult.error,
            finishedAt: finishedAtIso,
            durationMs: Date.now() - startedAtMs,
          });
          transition(runRecord, nodeId, "failed", gateResult.error ?? "분기 실패");
          const gateFailedFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            status: "failed",
            createdAt: finishedAtIso,
            summary: gateResult.error ?? "분기 실패",
            logs: runLogCollectorRef.current[nodeId] ?? [],
            output: gateResult.output,
            error: gateResult.error ?? "분기 실패",
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
          terminalStateByNodeId[nodeId] = "failed";
          scheduleChildren(nodeId);
          return;
        }

        const finishedAtIso = new Date().toISOString();
        outputs[nodeId] = gateResult.output;
        setNodeRuntimeFields(nodeId, {
          status: "done",
          output: gateResult.output,
          finishedAt: finishedAtIso,
          durationMs: Date.now() - startedAtMs,
        });
        setNodeStatus(nodeId, "done", gateResult.message ?? "분기 완료");
        transition(runRecord, nodeId, "done", gateResult.message ?? "분기 완료");
        const gateDoneFeed = buildFeedPost({
          runId: runRecord.runId,
          node,
          status: "done",
          createdAt: finishedAtIso,
          summary: gateResult.message ?? "분기 완료",
          logs: runLogCollectorRef.current[nodeId] ?? [],
          output: gateResult.output,
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
        terminalStateByNodeId[nodeId] = "done";
        scheduleChildren(nodeId);
      };

      while (queue.length > 0 || activeTasks.size > 0) {
        if (!cancelRequestedRef.current) {
          for (let index = 0; index < queue.length && activeTasks.size < dagMaxThreads; ) {
            const nodeId = queue[index];
            const node = nodeMap.get(nodeId);
            if (!node) {
              queue.splice(index, 1);
              continue;
            }
            const turnExecutor = node.type === "turn" ? getTurnExecutor(node.config as TurnConfig) : null;
            const isWebTurn = Boolean(turnExecutor && getWebProviderFromExecutor(turnExecutor));
            const requiresTurnLock = node.type === "turn" && !isWebTurn;
            if (requiresTurnLock && activeTurnTasks > 0) {
              index += 1;
              continue;
            }
            queue.splice(index, 1);
            if (requiresTurnLock) {
              activeTurnTasks += 1;
            }
            const task = processNode(nodeId)
              .catch((error) => {
                reportSoftError(`노드 실행 실패(${nodeId})`, error);
              })
              .finally(() => {
                activeTasks.delete(nodeId);
                if (requiresTurnLock) {
                  activeTurnTasks = Math.max(0, activeTurnTasks - 1);
                }
              });
            activeTasks.set(nodeId, task);
          }
        }

        if (activeTasks.size > 0) {
          await Promise.race(activeTasks.values());
          continue;
        }

        if (queue.length === 0) {
          break;
        }

        const fallbackNodeId = queue.shift() as string;
        await processNode(fallbackNodeId);
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
      let finalNodeId = "";
      if (sinkNodeIds.length === 1) {
        finalNodeId = sinkNodeIds[0];
      } else if (sinkNodeIds.length > 1) {
        const sinkSet = new Set(sinkNodeIds);
        for (let index = runRecord.transitions.length - 1; index >= 0; index -= 1) {
          const row = runRecord.transitions[index];
          if (!sinkSet.has(row.nodeId)) {
            continue;
          }
          finalNodeId = row.nodeId;
          break;
        }
      }
      if (!finalNodeId && lastDoneNodeId) {
        finalNodeId = lastDoneNodeId;
      }
      const finalNodeState = finalNodeId ? terminalStateByNodeId[finalNodeId] : undefined;
      if (finalNodeId && finalNodeState === "done" && finalNodeId in outputs) {
        runRecord.finalAnswer = extractFinalAnswer(outputs[finalNodeId]);
        setStatus("그래프 실행 완료");
      } else {
        const reason =
          finalNodeId && finalNodeState
            ? `최종 노드(${finalNodeId}) 상태=${nodeStatusLabel(finalNodeState)}`
            : "최종 노드를 확정하지 못했습니다.";
        setStatus(`그래프 실행 실패 (${reason})`);
        setError(`최종 노드 실패: ${reason}`);
      }
      runRecord.finishedAt = new Date().toISOString();
      runRecord.regression = await buildRegressionSummary(runRecord);
      await saveRunRecord(runRecord);
      const normalizedRunRecord = normalizeRunRecord(runRecord);
      const runFileName = `run-${runRecord.runId}.json`;
      feedRunCacheRef.current[runFileName] = normalizedRunRecord;
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
      activeWebNodeByProviderRef.current = {};
      turnTerminalResolverRef.current = null;
      webTurnResolverRef.current = null;
      webLoginResolverRef.current = null;
      clearQueuedWebTurnRequests("실행이 종료되어 대기 중인 웹 응답 입력을 취소했습니다.");
      setPendingWebTurn(null);
      setSuspendedWebTurn(null);
      setSuspendedWebResponseDraft("");
      setPendingWebLogin(null);
      setWebResponseDraft("");
      activeTurnNodeIdRef.current = "";
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

    const activeWebProviders = Object.keys(activeWebNodeByProviderRef.current) as WebProvider[];
    if (activeWebProviders.length > 0) {
      for (const provider of activeWebProviders) {
        const activeWebNodeId = activeWebNodeByProviderRef.current[provider];
        try {
          await invoke("web_provider_cancel", { provider });
          if (activeWebNodeId) {
            addNodeLog(activeWebNodeId, "[WEB] 취소 요청 전송");
          }
          clearWebBridgeStageWarnTimer(provider);
          delete activeWebPromptRef.current[provider];
          delete activeWebNodeByProviderRef.current[provider];
        } catch (e) {
          setError(String(e));
        }
      }
    }

    if (pendingWebTurn) {
      clearQueuedWebTurnRequests("사용자 취소");
      resolvePendingWebTurn({ ok: false, error: "사용자 취소" });
      return;
    }
    if (suspendedWebTurn) {
      clearQueuedWebTurnRequests("사용자 취소");
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

  const edgeLines = buildCanvasEdgeLines({
    entries: canvasDisplayEdges,
    nodeMap: canvasNodeMap,
    getNodeVisualSize,
  });
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
    { key: "all_posts", label: t("feed.category.all_posts") },
    { key: "completed_posts", label: t("feed.category.completed_posts") },
    { key: "web_posts", label: t("feed.category.web_posts") },
    { key: "error_posts", label: t("feed.category.error_posts") },
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
            <WorkflowCanvasPane
              boundedStageHeight={boundedStageHeight}
              boundedStageWidth={boundedStageWidth}
              canRunGraphNow={canRunGraphNow}
              canvasFullscreen={canvasFullscreen}
              canvasNodes={canvasNodes}
              canvasZoom={canvasZoom}
              connectPreviewLine={connectPreviewLine}
              deleteNode={deleteNode}
              draggingNodeIds={draggingNodeIds}
              edgeLines={edgeLines}
              formatNodeElapsedTime={formatNodeElapsedTime}
              graphCanvasRef={graphCanvasRef}
              isConnectingDrag={isConnectingDrag}
              isGraphRunning={isGraphRunning}
              isNodeDragAllowedTarget={isNodeDragAllowedTarget}
              isWorkflowBusy={isWorkflowBusy}
              marqueeSelection={marqueeSelection}
              nodeAnchorSides={NODE_ANCHOR_SIDES}
              nodeCardSummary={nodeCardSummary}
              nodeStates={nodeStates}
              nodeStatusLabel={nodeStatusLabel}
              nodeTypeLabel={nodeTypeLabel}
              onCancelGraphRun={onCancelGraphRun}
              onCanvasKeyDown={onCanvasKeyDown}
              onCanvasMouseDown={onCanvasMouseDown}
              onCanvasMouseMove={onCanvasMouseMove}
              onCanvasMouseUp={onCanvasMouseUp}
              onCanvasWheel={onCanvasWheel}
              onCanvasZoomIn={onCanvasZoomIn}
              onCanvasZoomOut={onCanvasZoomOut}
              onEdgeDragStart={onEdgeDragStart}
              onNodeAnchorDragStart={onNodeAnchorDragStart}
              onNodeAnchorDrop={onNodeAnchorDrop}
              onNodeConnectDrop={onNodeConnectDrop}
              onNodeDragStart={onNodeDragStart}
              onOpenFeedFromNode={onOpenFeedFromNode}
              onOpenWebInputForNode={onOpenWebInputForNode}
              onRedoGraph={onRedoGraph}
              onReopenPendingWebTurn={onReopenPendingWebTurn}
              onRunGraph={onRunGraph}
              onUndoGraph={onUndoGraph}
              panMode={panMode}
              pendingWebTurn={pendingWebTurn}
              questionDirectInputNodeIds={questionDirectInputNodeIds}
              questionInputRef={questionInputRef}
              redoStackLength={redoStack.length}
              runtimeNowMs={runtimeNowMs}
              selectedEdgeKey={selectedEdgeKey}
              selectedNodeIds={selectedNodeIds}
              setCanvasFullscreen={setCanvasFullscreen}
              setNodeSelection={setNodeSelection}
              setPanMode={setPanMode}
              setSelectedEdgeKey={setSelectedEdgeKey}
              setWorkflowQuestion={setWorkflowQuestion}
              stageInsetX={GRAPH_STAGE_INSET_X}
              stageInsetY={GRAPH_STAGE_INSET_Y}
              suspendedWebTurn={suspendedWebTurn}
              turnModelLabel={turnModelLabel}
              turnRoleLabel={turnRoleLabel}
              undoStackLength={undoStack.length}
              workflowQuestion={workflowQuestion}
            />

            <WorkflowInspectorPane
              canvasFullscreen={canvasFullscreen}
              nodeProps={{
                artifactTypeOptions: [...ARTIFACT_TYPE_OPTIONS],
                cwd,
                model,
                nodeSettingsTitle: t("workflow.nodeSettings"),
                normalizeQualityThreshold,
                outgoingNodeOptions,
                qualityProfileOptions: [...QUALITY_PROFILE_OPTIONS],
                qualityThresholdOptions: [...QUALITY_THRESHOLD_OPTIONS],
                selectedArtifactType,
                selectedNode,
                selectedQualityProfile,
                selectedQualityThresholdOption,
                selectedTurnConfig,
                selectedTurnExecutor,
                simpleWorkflowUI: SIMPLE_WORKFLOW_UI,
                turnExecutorLabel,
                turnExecutorOptions: [...TURN_EXECUTOR_OPTIONS],
                turnModelOptions: [...TURN_MODEL_OPTIONS],
                updateSelectedNodeConfig,
              }}
              toolsProps={{
                addNode,
                applyCostPreset,
                applyGraphChange,
                applyPreset,
                costPreset,
                costPresetOptions: [...COST_PRESET_OPTIONS],
                defaultKnowledgeConfig,
                deleteGraph,
                graphFiles,
                graphKnowledge,
                graphRenameDraft,
                graphRenameOpen,
                isCostPreset,
                isPresetKind,
                knowledgeDefaultMaxChars: KNOWLEDGE_DEFAULT_MAX_CHARS,
                knowledgeDefaultTopK: KNOWLEDGE_DEFAULT_TOP_K,
                knowledgeMaxCharsOptions: [...KNOWLEDGE_MAX_CHARS_OPTIONS],
                knowledgeTopKOptions: [...KNOWLEDGE_TOP_K_OPTIONS],
                loadGraph,
                onCloseRenameGraph,
                onOpenKnowledgeFilePicker,
                onOpenRenameGraph,
                onRemoveKnowledgeFile,
                onToggleKnowledgeFileEnabled,
                presetTemplateOptions: [...PRESET_TEMPLATE_OPTIONS],
                refreshGraphFiles,
                renameGraph,
                saveGraph,
                selectedGraphFileName,
                selectedKnowledgeMaxCharsOption,
                setGraphFileName,
                setGraphRenameDraft,
                setSelectedGraphFileName,
                simpleWorkflowUI: SIMPLE_WORKFLOW_UI,
              }}
            />
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
              feedReplySubmittingByPost,
              feedReplyFeedbackByPost,
              feedExpandedByPost,
              onSelectFeedInspectorPost,
              onShareFeedPost,
              onDeleteFeedRunGroup,
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
        modeLabel={pendingWebTurn?.mode === "manualPasteJson" ? "JSON" : t("feed.webMode.text")}
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
