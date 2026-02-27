import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../App.css";
import { invoke, listen, openUrl } from "../shared/tauri";
import AppNav from "../components/AppNav";
import ApprovalModal from "../components/modals/ApprovalModal";
import PendingWebLoginModal from "../components/modals/PendingWebLoginModal";
import PendingWebConnectModal from "../components/modals/PendingWebConnectModal";
import PendingWebTurnModal from "../components/modals/PendingWebTurnModal";
import BridgePage from "../pages/bridge/BridgePage";
import FeedPage from "../pages/feed/FeedPage";
import SettingsPage from "../pages/settings/SettingsPage";
import WorkflowPage from "../pages/workflow/WorkflowPage";
import { useFloatingPanel } from "../features/ui/useFloatingPanel";
import { useExecutionState } from "./hooks/useExecutionState";
import { useFeedRunActions } from "./hooks/useFeedRunActions";
import { useFeedInspectorEffects } from "./hooks/useFeedInspectorEffects";
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
import { localizePresetPromptTemplate } from "../features/workflow/presets/promptLocale";
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
  injectOutputLanguageDirective,
  replaceInputPlaceholder,
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
  getAutoConnectionSides,
  getGraphEdgeKey,
  getNodeAnchorPoint,
  graphEquals,
  nodeCardSummary,
  snapToLayoutGrid,
  snapToNearbyNodeAxis,
  turnModelLabel,
} from "../features/workflow/graph-utils";
import type {
  GraphNode,
  NodeExecutionStatus,
} from "../features/workflow/types";
import {
  AUTH_MODE_STORAGE_KEY,
  CODEX_MULTI_AGENT_MODE_STORAGE_KEY,
  LOGIN_COMPLETED_STORAGE_KEY,
  WORKSPACE_CWD_STORAGE_KEY,
  closestNumericOptionValue,
  extractAuthMode,
  extractDeltaText,
  extractStringByPaths,
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
  type WorkspaceTab,
  isTurnTerminalEvent,
  normalizeKnowledgeConfig,
  toWebBridgeStatus,
  validateSimpleSchema,
} from "./mainAppGraphHelpers";
import { useI18n } from "../i18n";
import {
  getArtifactTypeOptions,
  getCodexMultiAgentModeOptions,
  getCostPresetOptions,
  NODE_ANCHOR_SIDES,
  getPresetTemplateMeta,
  getPresetTemplateOptions,
  getQualityProfileOptions,
  getQualityThresholdOptions,
  buildFeedPost,
  buildQualityReport,
  defaultKnowledgeConfig,
  executeGateNode,
  executeTransformNode,
  feedAttachmentRawKey,
  inferRunGroupMeta,
  isCriticalTurnNode,
  normalizeEvidenceEnvelope,
  normalizeWebTurnOutput,
  buildConflictLedger,
  computeFinalConfidence,
  updateRunMemoryByEnvelope,
  normalizeQualityThreshold,
  normalizeRunRecord,
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
  GRAPH_STAGE_INSET_BOTTOM,
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
  TURN_OUTPUT_SCHEMA_ENABLED,
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
import { buildFeedPageVm, buildWorkflowInspectorPaneProps } from "./main/mainAppPropsBuilders";
import {
  cancelFeedReplyFeedbackClearTimer,
  scheduleFeedReplyFeedbackAutoClear,
} from "./main/feedFollowupUtils";
import { ensureFeedRunRecordFromCache, submitFeedAgentRequest as submitFeedAgentRequestAction } from "./main/feedFollowupActions";
import {
  clearDetachedWebTurnResolverAction,
  clearQueuedWebTurnRequestsAction,
  requestWebTurnResponseAction,
  resolvePendingWebTurnAction,
} from "./main/webTurnQueueActions";
import { createWebInteractionHandlers } from "./main/webInteractionHandlers";
import { createEngineBridgeHandlers } from "./main/engineBridgeHandlers";
import { createCanvasDragZoomHandlers } from "./main/canvasDragZoomHandlers";
import { createCanvasConnectionHandlers } from "./main/canvasConnectionHandlers";
import { createCoreStateHandlers } from "./main/coreStateHandlers";
import { createFeedKnowledgeHandlers } from "./main/feedKnowledgeHandlers";
import { useMainAppStateEffects } from "./main/useMainAppStateEffects";
import { createRunGraphControlHandlers } from "./main/runGraphControlHandlers";
import {
  PAUSE_ERROR_TOKEN,
  appendRunTransition,
  buildConnectPreviewLine,
  buildFinalTurnInputPacket,
  buildNodeInputForNode,
  cancelGraphRun,
  collectRequiredWebProviders,
  isPauseSignalError,
} from "./main/runGraphExecutionUtils";
import {
  appendNodeEvidenceWithMemory,
  buildFinalNodeFailureReason,
  buildGraphExecutionIndex,
  buildWebConnectPreflightReasons,
  createRunNodeStateSnapshot,
  createRunRecord,
  enqueueZeroIndegreeNodes,
  findDirectInputNodeIds,
  graphRequiresCodexEngine,
  rememberFeedSource,
  resolveDagMaxThreads,
  resolveFeedInputSources as resolveFeedInputSourcesForNode,
  resolveFinalNodeId,
  scheduleRunnableGraphNodes,
  scheduleChildrenWhenReady,
} from "./main/runGraphFlowUtils";
import {
  buildRegressionSummary,
  exportRunFeedMarkdownFiles,
  loadInternalMemoryCorpus,
  persistRunRecordFile as persistRunRecordFileHelper,
} from "./main/runHistoryUtils";
import {
  executeTurnNodeWithOutputSchemaRetry,
  injectKnowledgeContext,
  loadAgentRuleDocs,
} from "./main/turnExecutionUtils";
import { executeTurnNodeWithContext } from "./main/executeTurnNode";
import type {
  ApprovalDecision,
  CanvasDisplayEdge,
  EngineApprovalRequestEvent,
  EngineLifecycleEvent,
  EngineNotificationEvent,
  FeedCategory,
  FeedInputSource,
  EvidenceEnvelope,
  InternalMemorySnippet,
  NodeResponsibilityMemory,
  NodeMetric,
  QualityReport,
  RunRecord,
} from "./main";

function App() {
  const { locale, t, tp } = useI18n();
  const defaultCwd = useMemo(() => loadPersistedCwd(""), []);
  const defaultLoginCompleted = useMemo(() => loadPersistedLoginCompleted(), []);
  const defaultAuthMode = useMemo(() => loadPersistedAuthMode(), []);
  const defaultCodexMultiAgentMode = useMemo(() => loadPersistedCodexMultiAgentMode(), []);

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("workflow");
  const [pendingWebConnectCheck, setPendingWebConnectCheck] = useState<{
    providers: WebProvider[];
    reason: string;
  } | null>(null);
  const manualInputWaitNoticeByNodeRef = useRef<Record<string, boolean>>({});

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
    setStatus: setStatusState,
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
    isGraphPaused,
    setIsGraphPaused,
    isRunStarting,
    setIsRunStarting,
    runtimeNowMs,
    setRuntimeNowMs,
    cancelRequestedRef,
    pauseRequestedRef,
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
    activeWebProviderByNodeRef,
    activeWebPromptByNodeRef,
    manualWebFallbackNodeRef,
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
  const internalMemoryCorpusRef = useRef<InternalMemorySnippet[]>([]);
  const activeRunPresetKindRef = useRef<PresetKind | undefined>(undefined);
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
  const selectedEdgeNodeIdSet = useMemo(() => {
    const selected = canvasDisplayEdges.find((row) => row.edgeKey === selectedEdgeKey);
    if (!selected) {
      return new Set<string>();
    }
    return new Set([selected.edge.from.nodeId, selected.edge.to.nodeId]);
  }, [canvasDisplayEdges, selectedEdgeKey]);
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

  const {
    setStatus,
    setError,
    persistRunRecordFile,
    getNodeVisualSize,
    setNodeSelection,
    addNodeLog,
    setNodeStatus,
    setNodeRuntimeFields,
    enqueueNodeRequest,
    consumeNodeRequests,
    markCodexNodesStatusOnEngineIssue,
    applyGraphChange,
    onUndoGraph,
    onRedoGraph,
    onClearGraphCanvas,
    reportSoftError,
    normalizeWebBridgeProgressMessage,
    clearWebBridgeStageWarnTimer,
    scheduleWebBridgeStageWarn,
  } = createCoreStateHandlers({
    tp,
    setStatusState,
    setErrorState,
    setErrorLogs,
    invokeFn: invoke,
    persistRunRecordFileHelper,
    nodeSizeMapRef,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    setSelectedNodeIds,
    setSelectedNodeId,
    selectedNodeId,
    collectingRunRef,
    runLogCollectorRef,
    setNodeStates,
    pendingNodeRequestsRef,
    setPendingNodeRequests,
    graph,
    getTurnExecutor,
    setGraph,
    autoArrangeGraphLayout,
    graphEquals,
    setUndoStack,
    setRedoStack,
    cloneGraph,
    isGraphRunning,
    isRunStarting,
    setSelectedEdgeKey,
    toErrorText,
    webBridgeStageWarnTimerRef,
    activeWebNodeByProviderRef,
  });

  const {
    refreshGraphFiles,
    refreshFeedTimeline,
    onOpenRunsFolder,
    onOpenFeedMarkdownFile,
    ensureFeedRunRecord,
    onSubmitFeedAgentRequest,
    onOpenKnowledgeFilePicker,
    onRemoveKnowledgeFile,
    onToggleKnowledgeFileEnabled,
  } = createFeedKnowledgeHandlers({
    hasTauriRuntime,
    invokeFn: invoke,
    setGraphFiles,
    setFeedPosts,
    setFeedLoading,
    setStatus,
    setError,
    toOpenRunsFolderErrorMessage,
    feedRunCacheRef,
    normalizeRunRecordFn: normalizeRunRecord,
    ensureFeedRunRecordFromCacheFn: ensureFeedRunRecordFromCache,
    submitFeedAgentRequestAction,
    graph,
    isGraphRunning,
    workflowQuestion,
    cwd,
    nodeStates,
    feedReplyDraftByPost,
    feedReplySubmittingByPost,
    feedRawAttachmentRef,
    feedReplyFeedbackClearTimerRef,
    setFeedReplySubmittingByPost,
    setFeedReplyFeedbackByPost,
    setFeedReplyDraftByPost,
    setNodeStatus,
    setNodeRuntimeFields,
    addNodeLog,
    enqueueNodeRequest,
    persistRunRecordFile,
    executeTurnNode,
    validateSimpleSchemaFn: validateSimpleSchema,
    turnOutputSchemaEnabled: TURN_OUTPUT_SCHEMA_ENABLED,
    turnOutputSchemaMaxRetry: TURN_OUTPUT_SCHEMA_MAX_RETRY,
    graphSchemaVersion: GRAPH_SCHEMA_VERSION,
    defaultKnowledgeConfig,
    buildFeedPostFn: buildFeedPost,
    feedAttachmentRawKeyFn: feedAttachmentRawKey,
    exportRunFeedMarkdownFilesFn: exportRunFeedMarkdownFiles,
    cancelFeedReplyFeedbackClearTimerFn: cancelFeedReplyFeedbackClearTimer,
    scheduleFeedReplyFeedbackAutoClearFn: scheduleFeedReplyFeedbackAutoClear,
    turnModelLabelFn: turnModelLabel,
    t,
    applyGraphChange,
  });

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
              const hasBridgeStage = Boolean(stage?.startsWith("bridge_"));
              const progressMessage = hasBridgeStage
                ? normalizeWebBridgeProgressMessage(stage ?? "", message ?? "")
                : (message ?? "");
              if (activeWebNodeId && progressMessage && stage !== "bridge_waiting_user_send") {
                addNodeLog(activeWebNodeId, `[WEB] ${progressMessage}`);
              }
              if (hasBridgeStage) {
                const prefix = providerKey
                  ? `[${providerKey.toUpperCase()}] `
                  : "";
                const line = `${prefix}${progressMessage || stage}`;
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
                  setStatus(`${webProviderLabel(providerKey)} 자동 전송 확인 중`);
                  scheduleWebBridgeStageWarn(
                    providerKey,
                    1_600,
                    `${webProviderLabel(providerKey)} 탭에서 전송 1회가 필요합니다.`,
                    "[WEB] 자동 전송이 확인되지 않아 사용자 전송 클릭을 기다립니다.",
                  );
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

  const {
    ensureEngineStarted,
    onStartEngine,
    onStopEngine,
    refreshAuthStateFromEngine,
    onCheckUsage,
    onLoginCodex,
    onSelectCwdDirectory,
    onOpenPendingProviderWindow,
    onCloseProviderChildView,
    refreshWebWorkerHealth,
    refreshWebBridgeStatus,
    onRotateWebBridgeToken,
    onRestartWebBridge,
    onCopyWebBridgeConnectCode,
    onOpenProviderSession,
  } = createEngineBridgeHandlers({
    engineStarted,
    cwd,
    invokeFn: invoke,
    setEngineStarted,
    isEngineAlreadyStartedError,
    setError,
    setStatus,
    toErrorText,
    markCodexNodesStatusOnEngineIssue,
    setRunning,
    setIsGraphRunning,
    setUsageInfoText,
    extractAuthMode,
    setAuthMode,
    authLoginRequiredProbeCountRef,
    lastAuthenticatedAtRef,
    setLoginCompleted,
    loginCompleted,
    authLoginRequiredGraceMs: AUTH_LOGIN_REQUIRED_GRACE_MS,
    authLoginRequiredConfirmCount: AUTH_LOGIN_REQUIRED_CONFIRM_COUNT,
    formatUsageInfoForDisplay,
    setUsageResultClosed,
    toUsageCheckErrorMessage,
    codexAuthBusy,
    codexLoginLastAttemptAtRef,
    codexLoginCooldownMs: CODEX_LOGIN_COOLDOWN_MS,
    setCodexAuthBusy,
    openUrlFn: openUrl,
    setCwd,
    pendingWebTurn,
    webProviderHomeUrl,
    webProviderLabel,
    setProviderChildViewOpen,
    setWebWorkerHealth,
    setWebBridgeStatus,
    toWebBridgeStatus,
    setWebWorkerBusy,
    setWebBridgeConnectCode,
  });


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

  const {
    ensureWebWorkerReady,
    resolvePendingWebLogin,
    onCopyPendingWebPrompt,
    onSubmitPendingWebTurn,
    onDismissPendingWebTurn,
    onReopenPendingWebTurn,
    onOpenWebInputForNode,
    onCancelPendingWebTurn,
  } = createWebInteractionHandlers({
    invokeFn: invoke,
    refreshWebWorkerHealth,
    webLoginResolverRef,
    setPendingWebLogin,
    pendingWebTurn,
    webTurnResolverRef,
    manualInputWaitNoticeByNodeRef,
    setStatus,
    normalizeWebTurnOutput,
    webResponseDraft,
    setError,
    resolvePendingWebTurn,
    webTurnPanel,
    setSuspendedWebTurn,
    setSuspendedWebResponseDraft,
    setPendingWebTurn,
    suspendedWebTurn,
    setWebResponseDraft,
    suspendedWebResponseDraft,
    webProviderLabel,
    clearDetachedWebTurnResolver,
    webTurnFloatingDefaultX: WEB_TURN_FLOATING_DEFAULT_X,
    webTurnFloatingDefaultY: WEB_TURN_FLOATING_DEFAULT_Y,
    webTurnQueueRef,
    activeWebProviderByNodeRef,
    webProviderOptions: WEB_PROVIDER_OPTIONS,
    activeWebNodeByProviderRef,
    manualWebFallbackNodeRef,
    activeWebPromptByNodeRef,
    activeWebPromptRef,
    graphNodes: graph.nodes,
    getWebProviderFromExecutor,
    getTurnExecutor,
    injectOutputLanguageDirective,
    locale,
    workflowQuestion,
    replaceInputPlaceholder,
    addNodeLog,
    t,
  });

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
    const localizedPreset = {
      ...preset,
      nodes: preset.nodes.map((node) => {
        if (node.type !== "turn") {
          return node;
        }
        const config = node.config as TurnConfig;
        const localizedPromptTemplate = localizePresetPromptTemplate(
          kind,
          node,
          locale,
          String(config.promptTemplate ?? "{{input}}"),
        );
        return {
          ...node,
          config: {
            ...config,
            promptTemplate: injectOutputLanguageDirective(
              localizedPromptTemplate,
              locale,
            ),
          },
        };
      }),
    };
    const nextPreset = autoArrangeGraphLayout({
      ...localizedPreset,
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
    const templateMeta = presetTemplateMeta.find((row) => row.key === kind);
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

  const {
    clampCanvasZoom,
    scheduleZoomStatus,
    syncQuestionInputHeight,
    syncCanvasLogicalViewport,
    clientToLogicalPoint,
    snapConnectPreviewPoint,
    resolveConnectDropTarget,
    onEdgeDragStart,
    onAssignSelectedEdgeAnchor,
    reconnectSelectedEdgeEndpoint,
  } = createCanvasConnectionHandlers({
    minCanvasZoom: MIN_CANVAS_ZOOM,
    maxCanvasZoom: MAX_CANVAS_ZOOM,
    zoomStatusTimerRef,
    setStatus,
    questionInputRef,
    questionInputMaxHeight: QUESTION_INPUT_MAX_HEIGHT,
    graphCanvasRef,
    canvasZoom,
    graphStageInsetX: GRAPH_STAGE_INSET_X,
    graphStageInsetY: GRAPH_STAGE_INSET_Y,
    setCanvasLogicalViewport,
    getNodeVisualSize,
    canvasNodes,
    connectFromNodeId,
    getNodeAnchorPoint,
    setConnectPreviewPoint,
    panMode,
    isConnectingDrag,
    setNodeSelection,
    setSelectedEdgeKey,
    graph,
    getGraphEdgeKey,
    canvasNodeMap,
    getAutoConnectionSides,
    cloneGraph,
    edgeDragStartSnapshotRef,
    edgeDragRef,
    setConnectFromNodeId,
    setConnectFromSide,
    setConnectPreviewStartPoint,
    setIsConnectingDrag,
    selectedEdgeKey,
    applyGraphChange,
  });

  const {
    onNodeDragStart,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasMouseDown,
    onCanvasWheel,
    onCanvasZoomIn,
    onCanvasZoomOut,
    onCanvasKeyDown,
  } = createCanvasDragZoomHandlers({
    graphCanvasRef,
    setCanvasZoom,
    graphStageInsetX: GRAPH_STAGE_INSET_X,
    graphStageInsetY: GRAPH_STAGE_INSET_Y,
    canvasZoom,
    dragRef,
    clientToLogicalPoint,
    nodeDragMargin: NODE_DRAG_MARGIN,
    getNodeVisualSize,
    getBoundedStageWidth: () => boundedStageWidth,
    getBoundedStageHeight: () => boundedStageHeight,
    setGraph,
    snapToLayoutGrid,
    autoLayoutDragSnapThreshold: AUTO_LAYOUT_DRAG_SNAP_THRESHOLD,
    autoLayoutSnapThreshold: AUTO_LAYOUT_SNAP_THRESHOLD,
    snapToNearbyNodeAxis,
    autoLayoutNodeAxisSnapThreshold: AUTO_LAYOUT_NODE_AXIS_SNAP_THRESHOLD,
    dragAutoPanFrameRef,
    dragPointerRef,
    panMode,
    canvasNodes,
    selectedNodeIds,
    setNodeSelection,
    cloneGraph,
    graph,
    dragStartSnapshotRef,
    setDraggingNodeIds,
    setMarqueeSelection,
    dragWindowMoveHandlerRef,
    dragWindowUpHandlerRef,
    panRef,
    isConnectingDrag,
    connectFromNodeId,
    snapConnectPreviewPoint,
    marqueeSelection,
    edgeDragRef,
    connectPreviewPoint,
    resolveConnectDropTarget,
    reconnectSelectedEdgeEndpoint,
    onNodeConnectDrop,
    setIsConnectingDrag,
    setConnectPreviewStartPoint,
    setConnectPreviewPoint,
    setConnectFromNodeId,
    setConnectFromSide,
    edgeDragStartSnapshotRef,
    setSelectedEdgeKey,
    graphEquals,
    setUndoStack,
    setRedoStack,
    clampCanvasZoom,
    scheduleZoomStatus,
  });

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
    isGraphRunning,
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

  useMainAppStateEffects({
    canvasNodes,
    selectedNodeIds,
    selectedNodeId,
    setSelectedNodeIds,
    setSelectedNodeId,
    selectedEdgeKey,
    canvasDisplayEdges,
    setSelectedEdgeKey,
    cwd,
    workspaceCwdStorageKey: WORKSPACE_CWD_STORAGE_KEY,
    loginCompleted,
    loginCompletedStorageKey: LOGIN_COMPLETED_STORAGE_KEY,
    authMode,
    authModeStorageKey: AUTH_MODE_STORAGE_KEY,
    codexMultiAgentMode,
    codexMultiAgentModeStorageKey: CODEX_MULTI_AGENT_MODE_STORAGE_KEY,
    syncQuestionInputHeight,
    workflowQuestion,
    syncCanvasLogicalViewport,
    graphCanvasRef,
    canvasZoom,
    canvasFullscreen,
    workspaceTab,
    graph,
    nodeSizeMapRef,
    setNodeSizeVersion,
    dragAutoPanFrameRef,
    dragWindowMoveHandlerRef,
    dragWindowUpHandlerRef,
    edgeDragWindowMoveHandlerRef,
    edgeDragWindowUpHandlerRef,
    zoomStatusTimerRef,
    webTurnResolverRef,
    clearQueuedWebTurnRequests,
    isConnectingDrag,
    connectFromNodeId,
    clientToLogicalPoint,
    snapConnectPreviewPoint,
    onCanvasMouseUp,
  });

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


  async function saveRunRecord(runRecord: RunRecord) {
    const fileName = `run-${runRecord.runId}.json`;
    try {
      await exportRunFeedMarkdownFiles({
        runRecord,
        cwd,
        invokeFn: invoke,
        feedRawAttachment: feedRawAttachmentRef.current,
        setError,
      });
      await persistRunRecordFile(fileName, runRecord);
      setLastSavedRunFile(fileName);
      await refreshFeedTimeline();
    } catch (e) {
      setError(String(e));
    }
  }

  function resolvePendingWebTurn(result: { ok: boolean; output?: unknown; error?: string }) {
    resolvePendingWebTurnAction({
      result,
      pendingWebTurn,
      webTurnResolverRef,
      webTurnQueueRef,
      webTurnPanel,
      manualInputWaitNoticeByNodeRef,
      setPendingWebTurn,
      setSuspendedWebTurn,
      setSuspendedWebResponseDraft,
      setWebResponseDraft,
      setStatus,
      webProviderLabelFn: webProviderLabel,
      webTurnFloatingDefaultX: WEB_TURN_FLOATING_DEFAULT_X,
      webTurnFloatingDefaultY: WEB_TURN_FLOATING_DEFAULT_Y,
    });
  }

  function clearQueuedWebTurnRequests(reason: string) {
    clearQueuedWebTurnRequestsAction(reason, webTurnQueueRef);
  }

  function clearDetachedWebTurnResolver(reason: string) {
    clearDetachedWebTurnResolverAction({
      reason,
      pendingWebTurn,
      suspendedWebTurn,
      webTurnResolverRef,
    });
  }

  async function requestWebTurnResponse(
    nodeId: string,
    provider: WebProvider,
    prompt: string,
    mode: WebResultMode,
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    return requestWebTurnResponseAction({
      nodeId,
      provider,
      prompt,
      mode,
      pendingWebTurn,
      suspendedWebTurn,
      suspendedWebResponseDraft,
      webTurnResolverRef,
      webTurnQueueRef,
      webTurnPanel,
      manualInputWaitNoticeByNodeRef,
      setPendingWebTurn,
      setWebResponseDraft,
      setSuspendedWebTurn,
      setSuspendedWebResponseDraft,
      setStatus,
      addNodeLog,
      webProviderLabelFn: webProviderLabel,
      clearDetachedWebTurnResolver,
      webTurnFloatingDefaultX: WEB_TURN_FLOATING_DEFAULT_X,
      webTurnFloatingDefaultY: WEB_TURN_FLOATING_DEFAULT_Y,
    });
  }

  async function executeTurnNode(node: GraphNode, input: unknown) {
    return executeTurnNodeWithContext(node, input, {
      model,
      cwd,
      locale,
      workflowQuestion,
      codexMultiAgentMode,
      forceAgentRulesAllTurns: FORCE_AGENT_RULES_ALL_TURNS,
      turnOutputSchemaEnabled: TURN_OUTPUT_SCHEMA_ENABLED,
      pauseErrorToken: PAUSE_ERROR_TOKEN,
      nodeStates,
      activeRunPresetKindRef,
      internalMemoryCorpusRef,
      activeWebNodeByProviderRef,
      activeWebPromptRef,
      activeWebProviderByNodeRef,
      activeWebPromptByNodeRef,
      manualWebFallbackNodeRef,
      pauseRequestedRef,
      cancelRequestedRef,
      activeTurnNodeIdRef,
      activeRunDeltaRef,
      turnTerminalResolverRef,
      consumeNodeRequests,
      addNodeLog,
      setStatus,
      setNodeStatus,
      setNodeRuntimeFields,
      requestWebTurnResponse,
      ensureWebWorkerReady,
      clearWebBridgeStageWarnTimer,
      loadAgentRuleDocs: async (nodeCwd) =>
        loadAgentRuleDocs({
          nodeCwd,
          cwd,
          cacheTtlMs: AGENT_RULE_CACHE_TTL_MS,
          maxDocs: AGENT_RULE_MAX_DOCS,
          maxDocChars: AGENT_RULE_MAX_DOC_CHARS,
          agentRulesCacheRef,
          invokeFn: invoke,
        }),
      injectKnowledgeContext: (params) =>
        injectKnowledgeContext({
          ...params,
          workflowQuestion,
          activeRunPresetKind: activeRunPresetKindRef.current,
          internalMemoryCorpus: internalMemoryCorpusRef.current,
          enabledKnowledgeFiles,
          graphKnowledge,
          addNodeLog,
          invokeFn: invoke,
        }),
      invokeFn: invoke,
      openUrlFn: openUrl,
      t,
    });
  }

  const {
    prepareRunGraphStart,
    cleanupRunGraphExecutionState,
    handleRunPauseIfNeeded,
    onCancelGraphRun,
  } = createRunGraphControlHandlers({
    cwd,
    setError,
    setStatus,
    collectRequiredWebProviders,
    graph,
    refreshWebBridgeStatus,
    webBridgeStatus,
    buildWebConnectPreflightReasons,
    webProviderLabel,
    t,
    setPendingWebConnectCheck,
    inferRunGroupMeta,
    lastAppliedPresetRef,
    locale,
    findDirectInputNodeIds,
    webBridgeStageWarnTimerRef,
    activeWebPromptRef,
    activeWebNodeByProviderRef,
    turnTerminalResolverRef,
    webTurnResolverRef,
    webLoginResolverRef,
    clearQueuedWebTurnRequests,
    manualInputWaitNoticeByNodeRef,
    setPendingWebTurn,
    setSuspendedWebTurn,
    setSuspendedWebResponseDraft,
    setPendingWebLogin,
    setWebResponseDraft,
    internalMemoryCorpusRef,
    activeRunPresetKindRef,
    activeTurnNodeIdRef,
    setIsGraphRunning,
    setIsGraphPaused,
    setIsRunStarting,
    runStartGuardRef,
    cancelRequestedRef,
    pauseRequestedRef,
    collectingRunRef,
    setActiveFeedRunMeta,
    isGraphRunning,
    pendingWebLogin,
    resolvePendingWebLogin,
    invokeFn: invoke,
    addNodeLog,
    clearWebBridgeStageWarnTimer,
    pendingWebTurn,
    suspendedWebTurn,
    resolvePendingWebTurn,
    pauseErrorToken: PAUSE_ERROR_TOKEN,
    nodeStates,
    cancelGraphRun,
  });

  async function onRunGraph(skipWebConnectPreflight = false) {
    if (isGraphRunning && isGraphPaused) {
      pauseRequestedRef.current = false;
      setIsGraphPaused(false);
      setStatus("그래프 실행 재개");
      return;
    }

    if (isGraphRunning || runStartGuardRef.current) {
      return;
    }

    const runGroup = await prepareRunGraphStart(skipWebConnectPreflight);
    if (!runGroup) {
      return;
    }

    runStartGuardRef.current = true;
    setPendingWebConnectCheck(null);
    setIsRunStarting(true);
    setError("");
    setStatus("그래프 실행 시작");
    setIsGraphRunning(true);
    setIsGraphPaused(false);
    cancelRequestedRef.current = false;
    pauseRequestedRef.current = false;
    collectingRunRef.current = true;

    const runStateSnapshot = createRunNodeStateSnapshot(graph.nodes);
    runLogCollectorRef.current = runStateSnapshot.runLogs;
    setNodeStates(runStateSnapshot.nodeStates);

    const runRecord: RunRecord = createRunRecord({
      graph,
      question: workflowQuestion,
      workflowGroupName: runGroup.name,
      workflowGroupKind: runGroup.kind,
      workflowPresetKind: runGroup.presetKind,
    });
    setActiveFeedRunMeta({
      runId: runRecord.runId,
      question: workflowQuestion,
      startedAt: runRecord.startedAt,
      groupName: runGroup.name,
      groupKind: runGroup.kind,
      presetKind: runGroup.presetKind,
    });
    activeRunPresetKindRef.current = runGroup.presetKind;

    try {
      internalMemoryCorpusRef.current = await loadInternalMemoryCorpus({
        invokeFn: invoke,
        presetKind: runGroup.presetKind,
        onError: setError,
      });
      if (internalMemoryCorpusRef.current.length > 0) {
        setStatus(`그래프 실행 시작 (내부 메모리 ${internalMemoryCorpusRef.current.length}개 로드)`);
      }
      const requiresCodexEngine = graphRequiresCodexEngine(graph.nodes);
      if (requiresCodexEngine) {
        await ensureEngineStarted();
      }

      const { nodeMap, indegree, adjacency, incoming } = buildGraphExecutionIndex(graph);
      const terminalStateByNodeId: Record<string, NodeExecutionStatus> = {};

      const latestFeedSourceByNodeId = new Map<string, FeedInputSource>();

      const appendNodeEvidence = (params: {
        node: GraphNode;
        output: unknown;
        provider?: string;
        summary?: string;
        createdAt?: string;
      }): EvidenceEnvelope => {
        const result = appendNodeEvidenceWithMemory({
          ...params,
          normalizedEvidenceByNodeId,
          runMemoryByNodeId,
          runRecord,
          turnRoleLabelFn: turnRoleLabel,
          nodeTypeLabelFn: nodeTypeLabel,
          normalizeEvidenceEnvelopeFn: normalizeEvidenceEnvelope,
          updateRunMemoryByEnvelopeFn: updateRunMemoryByEnvelope,
        });
        runMemoryByNodeId = result.runMemoryByNodeId;
        return result.envelope;
      };

      const queue: string[] = [];
      enqueueZeroIndegreeNodes({
        indegree,
        queue,
        onQueued: (nodeId) => {
          setNodeStatus(nodeId, "queued");
          appendRunTransition(runRecord, nodeId, "queued");
        },
      });

      const outputs: Record<string, unknown> = {};
      const normalizedEvidenceByNodeId: Record<string, EvidenceEnvelope[]> = {};
      let runMemoryByNodeId: Record<string, NodeResponsibilityMemory> = {};
      const skipSet = new Set<string>();
      let lastDoneNodeId = "";

      const dagMaxThreads = resolveDagMaxThreads(codexMultiAgentMode);
      const activeTasks = new Map<string, Promise<void>>();
      let activeTurnTasks = 0;
      let pauseStatusShown = false;

      const scheduleChildren = (nodeId: string) => {
        scheduleChildrenWhenReady({
          nodeId,
          adjacency,
          indegree,
          queue,
          onQueued: (childId) => {
            setNodeStatus(childId, "queued");
            appendRunTransition(runRecord, childId, "queued");
          },
        });
      };

      const processNode = async (nodeId: string): Promise<void> => {
        const node = nodeMap.get(nodeId);
        if (!node) {
          return;
        }

        const nodeInputSources = resolveFeedInputSourcesForNode({
          targetNodeId: nodeId,
          edges: graph.edges,
          nodeMap,
          workflowQuestion,
          latestFeedSourceByNodeId,
          turnRoleLabelFn: turnRoleLabel,
          nodeTypeLabelFn: nodeTypeLabel,
          nodeSelectionLabelFn: nodeSelectionLabel,
        });
        const nodeInput = buildNodeInputForNode({
          edges: graph.edges,
          nodeId,
          outputs,
          rootInput: workflowQuestion,
        });
        const isFinalTurnNode = node.type === "turn" && (adjacency.get(nodeId)?.length ?? 0) === 0;

        if (pauseRequestedRef.current) {
          const pauseMessage = "사용자 일시정지 요청으로 대기열로 복귀";
          setNodeStatus(nodeId, "queued", pauseMessage);
          setNodeRuntimeFields(nodeId, {
            status: "queued",
            finishedAt: undefined,
            durationMs: undefined,
          });
          appendRunTransition(runRecord, nodeId, "queued", pauseMessage);
          if (!queue.includes(nodeId)) {
            queue.push(nodeId);
          }
          return;
        }

        if (cancelRequestedRef.current) {
          setNodeStatus(nodeId, "cancelled", "취소 요청됨");
          appendRunTransition(runRecord, nodeId, "cancelled", "취소 요청됨");
          const cancelledAt = new Date().toISOString();
          const cancelledEvidence = appendNodeEvidence({
            node,
            output: nodeInput,
            provider: "system",
            summary: t("run.cancelledByUser"),
            createdAt: cancelledAt,
          });
          const cancelledFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            isFinalDocument: isFinalTurnNode,
            status: "cancelled",
            createdAt: cancelledAt,
            summary: t("run.cancelledByUser"),
            logs: runLogCollectorRef.current[nodeId] ?? [],
            inputSources: nodeInputSources,
            inputData: nodeInput,
            verificationStatus: cancelledEvidence.verificationStatus,
            confidenceBand: cancelledEvidence.confidenceBand,
            dataIssues: cancelledEvidence.dataIssues,
          });
          runRecord.feedPosts?.push(cancelledFeed.post);
          rememberFeedSource(latestFeedSourceByNodeId, cancelledFeed.post);
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
          appendRunTransition(runRecord, nodeId, "skipped", "분기 결과로 건너뜀");
          appendNodeEvidence({
            node,
            output: nodeInput,
            provider: "system",
            summary: "분기 결과로 건너뜀",
          });
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
          appendRunTransition(runRecord, nodeId, "skipped", blockedReason);
          const blockedEvidence = appendNodeEvidence({
            node,
            output: nodeInput,
            provider: "system",
            summary: blockedReason,
            createdAt: blockedAtIso,
          });
          const blockedFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            isFinalDocument: isFinalTurnNode,
            status: "cancelled",
            createdAt: blockedAtIso,
            summary: blockedReason,
            logs: runLogCollectorRef.current[nodeId] ?? [],
            inputSources: nodeInputSources,
            inputData: nodeInput,
            verificationStatus: blockedEvidence.verificationStatus,
            confidenceBand: blockedEvidence.confidenceBand,
            dataIssues: blockedEvidence.dataIssues,
          });
          runRecord.feedPosts?.push(blockedFeed.post);
          rememberFeedSource(latestFeedSourceByNodeId, blockedFeed.post);
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
        appendRunTransition(runRecord, nodeId, "running");

        const input = isFinalTurnNode
          ? buildFinalTurnInputPacket({
              edges: graph.edges,
              nodeId,
              currentInput: nodeInput,
              outputs,
              rootInput: workflowQuestion,
              normalizedEvidenceByNodeId,
              runMemory: runMemoryByNodeId,
            })
          : nodeInput;

        if (node.type === "turn") {
          const hasOutputSchema = String((node.config as TurnConfig).outputSchemaJson ?? "").trim().length > 0;
          const turnExecution = await executeTurnNodeWithOutputSchemaRetry({
            node,
            input,
            executeTurnNode,
            addNodeLog,
            validateSimpleSchema,
            outputSchemaEnabled: TURN_OUTPUT_SCHEMA_ENABLED,
            maxRetryDefault: TURN_OUTPUT_SCHEMA_MAX_RETRY,
            options: {
              maxRetry: isFinalTurnNode || hasOutputSchema ? 1 : 0,
            },
          });
          let result = turnExecution.result;
          if (!result.ok && pauseRequestedRef.current && isPauseSignalError(result.error)) {
            const pauseMessage = "사용자 일시정지 요청으로 노드 실행을 보류했습니다.";
            addNodeLog(nodeId, `[중지] ${pauseMessage}`);
            setNodeStatus(nodeId, "queued", pauseMessage);
            setNodeRuntimeFields(nodeId, {
              status: "queued",
              finishedAt: undefined,
              durationMs: undefined,
            });
            appendRunTransition(runRecord, nodeId, "queued", pauseMessage);
            if (!queue.includes(nodeId)) {
              queue.push(nodeId);
            }
            return;
          }
          if (result.knowledgeTrace && result.knowledgeTrace.length > 0) {
            runRecord.knowledgeTrace?.push(...result.knowledgeTrace);
          }
          if (result.memoryTrace && result.memoryTrace.length > 0) {
            runRecord.internalMemoryTrace?.push(...result.memoryTrace);
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
            appendRunTransition(runRecord, nodeId, "failed", result.error ?? "턴 실행 실패");
            const failedEvidence = appendNodeEvidence({
              node,
              output: result.output ?? { error: result.error ?? "턴 실행 실패", input },
              provider: result.provider,
              summary: result.error ?? "턴 실행 실패",
              createdAt: finishedAtIso,
            });
            const failedFeed = buildFeedPost({
              runId: runRecord.runId,
              node,
              isFinalDocument: isFinalTurnNode,
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
              verificationStatus: failedEvidence.verificationStatus,
              confidenceBand: failedEvidence.confidenceBand,
              dataIssues: failedEvidence.dataIssues,
            });
            runRecord.feedPosts?.push(failedFeed.post);
            rememberFeedSource(latestFeedSourceByNodeId, failedFeed.post);
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
              const lowQualitySummary = t("run.qualityLowSummary", {
                score: finalQualityReport.score,
                threshold: finalQualityReport.threshold,
              });
              addNodeLog(
                nodeId,
                t("run.qualityRejectLog", {
                  score: finalQualityReport.score,
                  threshold: finalQualityReport.threshold,
                }),
              );
              outputs[nodeId] = normalizedOutput;
              setNodeStatus(nodeId, "low_quality", lowQualitySummary);
              setNodeRuntimeFields(nodeId, {
                status: "low_quality",
                output: normalizedOutput,
                qualityReport: finalQualityReport,
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
                status: "done",
                startedAt: startedAtIso,
                finishedAt: finishedAtIso,
                summary: lowQualitySummary,
              });
              appendRunTransition(runRecord, nodeId, "low_quality", lowQualitySummary);
              const lowQualityEvidence = appendNodeEvidence({
                node,
                output: normalizedOutput,
                provider: result.provider,
                summary: lowQualitySummary,
                createdAt: finishedAtIso,
              });
              const lowQualityFeed = buildFeedPost({
                runId: runRecord.runId,
                node,
                isFinalDocument: isFinalTurnNode,
                status: "low_quality",
                createdAt: finishedAtIso,
                summary: lowQualitySummary,
                logs: runLogCollectorRef.current[nodeId] ?? [],
                output: normalizedOutput,
                durationMs: Date.now() - startedAtMs,
                usage: result.usage,
                qualityReport: finalQualityReport,
                inputSources: nodeInputSources,
                inputData: input,
                verificationStatus: lowQualityEvidence.verificationStatus,
                confidenceBand: lowQualityEvidence.confidenceBand,
                dataIssues: lowQualityEvidence.dataIssues,
              });
              runRecord.feedPosts?.push(lowQualityFeed.post);
              rememberFeedSource(latestFeedSourceByNodeId, lowQualityFeed.post);
              feedRawAttachmentRef.current[feedAttachmentRawKey(lowQualityFeed.post.id, "markdown")] =
                lowQualityFeed.rawAttachments.markdown;
              feedRawAttachmentRef.current[feedAttachmentRawKey(lowQualityFeed.post.id, "json")] =
                lowQualityFeed.rawAttachments.json;
              lastDoneNodeId = nodeId;
              terminalStateByNodeId[nodeId] = "low_quality";
              scheduleChildren(nodeId);
              return;
            }
          } else {
            addNodeLog(nodeId, "[품질] 중간 노드는 품질 게이트를 생략합니다. (최종 노드만 검증)");
          }

          const finishedAtIso = new Date().toISOString();
          outputs[nodeId] = normalizedOutput;
          if (qualityReport) {
            addNodeLog(
              nodeId,
              t("run.qualityPassLog", {
                score: qualityReport.score,
                threshold: qualityReport.threshold,
              }),
            );
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
          appendRunTransition(runRecord, nodeId, "done", t("run.turnCompleted"));
          const doneEvidence = appendNodeEvidence({
            node,
            output: normalizedOutput,
            provider: result.provider,
            summary: t("run.turnCompleted"),
            createdAt: finishedAtIso,
          });
          const doneFeed = buildFeedPost({
            runId: runRecord.runId,
            node,
            isFinalDocument: isFinalTurnNode,
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
            verificationStatus: doneEvidence.verificationStatus,
            confidenceBand: doneEvidence.confidenceBand,
            dataIssues: doneEvidence.dataIssues,
          });
          runRecord.feedPosts?.push(doneFeed.post);
          rememberFeedSource(latestFeedSourceByNodeId, doneFeed.post);
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
            appendRunTransition(runRecord, nodeId, "failed", result.error ?? "변환 실패");
            const transformFailedEvidence = appendNodeEvidence({
              node,
              output: result.output ?? { error: result.error ?? "변환 실패", input },
              provider: "transform",
              summary: result.error ?? "변환 실패",
              createdAt: finishedAtIso,
            });
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
              verificationStatus: transformFailedEvidence.verificationStatus,
              confidenceBand: transformFailedEvidence.confidenceBand,
              dataIssues: transformFailedEvidence.dataIssues,
            });
            runRecord.feedPosts?.push(transformFailedFeed.post);
            rememberFeedSource(latestFeedSourceByNodeId, transformFailedFeed.post);
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
          appendRunTransition(runRecord, nodeId, "done", "변환 완료");
          const transformDoneEvidence = appendNodeEvidence({
            node,
            output: result.output,
            provider: "transform",
            summary: "변환 완료",
            createdAt: finishedAtIso,
          });
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
            verificationStatus: transformDoneEvidence.verificationStatus,
            confidenceBand: transformDoneEvidence.confidenceBand,
            dataIssues: transformDoneEvidence.dataIssues,
          });
          runRecord.feedPosts?.push(transformDoneFeed.post);
          rememberFeedSource(latestFeedSourceByNodeId, transformDoneFeed.post);
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
          appendRunTransition(runRecord, nodeId, "failed", gateResult.error ?? "분기 실패");
          const gateFailedEvidence = appendNodeEvidence({
            node,
            output: gateResult.output ?? { error: gateResult.error ?? "분기 실패", input },
            provider: "gate",
            summary: gateResult.error ?? "분기 실패",
            createdAt: finishedAtIso,
          });
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
            verificationStatus: gateFailedEvidence.verificationStatus,
            confidenceBand: gateFailedEvidence.confidenceBand,
            dataIssues: gateFailedEvidence.dataIssues,
          });
          runRecord.feedPosts?.push(gateFailedFeed.post);
          rememberFeedSource(latestFeedSourceByNodeId, gateFailedFeed.post);
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
        appendRunTransition(runRecord, nodeId, "done", gateResult.message ?? "분기 완료");
        const gateDoneEvidence = appendNodeEvidence({
          node,
          output: gateResult.output,
          provider: "gate",
          summary: gateResult.message ?? "분기 완료",
          createdAt: finishedAtIso,
        });
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
          verificationStatus: gateDoneEvidence.verificationStatus,
          confidenceBand: gateDoneEvidence.confidenceBand,
          dataIssues: gateDoneEvidence.dataIssues,
        });
        runRecord.feedPosts?.push(gateDoneFeed.post);
        rememberFeedSource(latestFeedSourceByNodeId, gateDoneFeed.post);
        feedRawAttachmentRef.current[feedAttachmentRawKey(gateDoneFeed.post.id, "markdown")] =
          gateDoneFeed.rawAttachments.markdown;
        feedRawAttachmentRef.current[feedAttachmentRawKey(gateDoneFeed.post.id, "json")] =
          gateDoneFeed.rawAttachments.json;
        lastDoneNodeId = nodeId;
        terminalStateByNodeId[nodeId] = "done";
        scheduleChildren(nodeId);
      };

      while (queue.length > 0 || activeTasks.size > 0) {
        const pauseResult = await handleRunPauseIfNeeded(activeTasks, pauseStatusShown);
        pauseStatusShown = pauseResult.pauseStatusShown;
        if (pauseResult.handled) {
          continue;
        }

        if (!cancelRequestedRef.current) {
          activeTurnTasks = scheduleRunnableGraphNodes({
            queue,
            activeTasks,
            dagMaxThreads,
            nodeMap,
            activeTurnTasks,
            processNode,
            reportSoftError,
          });
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
            if (!current || ["done", "low_quality", "failed", "skipped", "cancelled"].includes(current.status)) {
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
      const allEvidencePackets = Object.values(normalizedEvidenceByNodeId).flat();
      runRecord.normalizedEvidenceByNodeId = normalizedEvidenceByNodeId;
      runRecord.runMemory = runMemoryByNodeId;
      runRecord.conflictLedger = buildConflictLedger(allEvidencePackets);
      runRecord.finalConfidence = computeFinalConfidence(allEvidencePackets, runRecord.conflictLedger);
      if (runRecord.nodeMetrics && Object.keys(runRecord.nodeMetrics).length > 0) {
        runRecord.qualitySummary = summarizeQualityMetrics(runRecord.nodeMetrics);
      }
      const finalNodeId = resolveFinalNodeId({
        graph,
        transitions: runRecord.transitions,
        lastDoneNodeId,
      });
      const finalNodeState = finalNodeId ? terminalStateByNodeId[finalNodeId] : undefined;
      if (finalNodeId && (finalNodeState === "done" || finalNodeState === "low_quality") && finalNodeId in outputs) {
        runRecord.finalAnswer = extractFinalAnswer(outputs[finalNodeId]);
        setStatus(finalNodeState === "low_quality" ? t("run.graphCompletedLowQuality") : "그래프 실행 완료");
      } else {
        const reason = buildFinalNodeFailureReason({
          finalNodeId,
          finalNodeState,
          nodeStatusLabelFn: nodeStatusLabel,
        });
        setStatus(`그래프 실행 실패 (${reason})`);
        setError(`최종 노드 실패: ${reason}`);
      }
      runRecord.finishedAt = new Date().toISOString();
      runRecord.regression = await buildRegressionSummary({
        currentRun: runRecord,
        invokeFn: invoke,
      });
      await saveRunRecord(runRecord);
      const normalizedRunRecord = normalizeRunRecord(runRecord);
      const runFileName = `run-${runRecord.runId}.json`;
      feedRunCacheRef.current[runFileName] = normalizedRunRecord;
    } catch (e) {
      markCodexNodesStatusOnEngineIssue("failed", `그래프 실행 실패: ${String(e)}`, true);
      setError(String(e));
      setStatus("그래프 실행 실패");
    } finally {
      cleanupRunGraphExecutionState();
    }
  }
  const edgeLines = buildCanvasEdgeLines({
    entries: canvasDisplayEdges,
    nodeMap: canvasNodeMap,
    getNodeVisualSize,
  });
  const connectPreviewLine = buildConnectPreviewLine({
    connectFromNodeId,
    connectPreviewPoint,
    connectPreviewStartPoint,
    connectFromSide,
    canvasNodeMap,
    getNodeVisualSize,
    getNodeAnchorPointFn: getNodeAnchorPoint,
    buildRoundedEdgePathFn: buildRoundedEdgePath,
  });

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
  const qualityProfileOptions = useMemo(() => getQualityProfileOptions(locale), [locale]);
  const qualityThresholdOptions = useMemo(() => getQualityThresholdOptions(locale), [locale]);
  const artifactTypeOptions = useMemo(() => getArtifactTypeOptions(locale), [locale]);
  const costPresetOptions = useMemo(() => getCostPresetOptions(locale), [locale]);
  const codexMultiAgentModeOptions = useMemo(() => getCodexMultiAgentModeOptions(locale), [locale]);
  const presetTemplateMeta = useMemo(() => getPresetTemplateMeta(locale), [locale]);
  const presetTemplateOptions = useMemo(() => getPresetTemplateOptions(locale), [locale]);
  const knowledgeTopKOptions = useMemo(
    () => KNOWLEDGE_TOP_K_OPTIONS.map((option) => ({ ...option, label: tp(option.label) })),
    [locale],
  );
  const knowledgeMaxCharsOptions = useMemo(
    () => KNOWLEDGE_MAX_CHARS_OPTIONS.map((option) => ({ ...option, label: tp(option.label) })),
    [locale],
  );
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
      label: target ? nodeSelectionLabel(target) : t("workflow.node.connection"),
    };
  });
  const canResumeGraph = isGraphRunning && isGraphPaused;
  const isWorkflowBusy = (isGraphRunning && !isGraphPaused) || isRunStarting;
  const canClearGraph = !isWorkflowBusy && (graph.nodes.length > 0 || graph.edges.length > 0);
  const isWorkspaceCwdConfigured = String(cwd ?? "").trim().length > 0 && String(cwd ?? "").trim() !== ".";
  const canRunGraphNow =
    canResumeGraph ||
    (isWorkspaceCwdConfigured && !isWorkflowBusy && graph.nodes.length > 0 && workflowQuestion.trim().length > 0);
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

  const feedCategoryMeta: Array<{ key: FeedCategory; label: string }> = [
    { key: "all_posts", label: t("feed.category.all_posts") },
    { key: "completed_posts", label: t("feed.category.completed_posts") },
    { key: "web_posts", label: t("feed.category.web_posts") },
    { key: "error_posts", label: t("feed.category.error_posts") },
  ];

  useFeedInspectorEffects({
    groupedFeedRuns,
    setFeedGroupExpandedByRunId,
    setFeedGroupRenameRunId,
    workspaceTab,
    currentFeedPosts,
    setFeedInspectorPostId,
    feedInspectorPost,
    feedInspectorGraphNode,
    feedInspectorPostSourceFile,
    feedInspectorPostNodeId,
    feedInspectorPostKey,
    ensureFeedRunRecord,
    setFeedInspectorSnapshotNode,
    feedInspectorRuleCwd,
    setFeedInspectorRuleDocs,
    setFeedInspectorRuleLoading,
    loadAgentRuleDocsForCwd: (nodeCwd) =>
      loadAgentRuleDocs({
        nodeCwd,
        cwd,
        cacheTtlMs: AGENT_RULE_CACHE_TTL_MS,
        maxDocs: AGENT_RULE_MAX_DOCS,
        maxDocChars: AGENT_RULE_MAX_DOC_CHARS,
        agentRulesCacheRef,
        invokeFn: invoke,
      }),
  });

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
  const workflowInspectorPaneProps = buildWorkflowInspectorPaneProps({
    nodeProps: {
      artifactTypeOptions: [...artifactTypeOptions],
      cwd,
      model,
      nodeSettingsTitle: t("workflow.nodeSettings"),
      normalizeQualityThreshold,
      outgoingNodeOptions,
      qualityProfileOptions: [...qualityProfileOptions],
      qualityThresholdOptions: [...qualityThresholdOptions],
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
    },
    toolsProps: {
      addNode,
      applyCostPreset,
      applyGraphChange,
      applyPreset,
      costPreset,
      costPresetOptions: [...costPresetOptions],
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
      knowledgeMaxCharsOptions: [...knowledgeMaxCharsOptions],
      knowledgeTopKOptions: [...knowledgeTopKOptions],
      loadGraph,
      onCloseRenameGraph,
      onOpenKnowledgeFilePicker,
      onOpenRenameGraph,
      onRemoveKnowledgeFile,
      onToggleKnowledgeFileEnabled,
      presetTemplateOptions: [...presetTemplateOptions],
      refreshGraphFiles,
      renameGraph,
      saveGraph,
      selectedGraphFileName,
      selectedKnowledgeMaxCharsOption,
      setGraphFileName,
      setGraphRenameDraft,
      setSelectedGraphFileName,
      simpleWorkflowUI: SIMPLE_WORKFLOW_UI,
    },
  });
  const feedPageVm = buildFeedPageVm({
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
    QUALITY_PROFILE_OPTIONS: qualityProfileOptions,
    normalizeQualityThreshold,
    QUALITY_THRESHOLD_OPTIONS: qualityThresholdOptions,
    ARTIFACT_TYPE_OPTIONS: artifactTypeOptions,
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
    onOpenFeedMarkdownFile,
    graphNodes: graph.nodes,
    setFeedInspectorPostId,
    setNodeSelection,
  });
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
            <span>{t("feed.status.failed")}: {error}</span>
            <button
              aria-label={t("common.close")}
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
              onAssignSelectedEdgeAnchor={onAssignSelectedEdgeAnchor}
              onNodeAnchorDragStart={onNodeAnchorDragStart}
              onNodeAnchorDrop={onNodeAnchorDrop}
              onNodeDragStart={onNodeDragStart}
              onOpenFeedFromNode={(nodeId) => {
                setWorkspaceTab("feed");
                setFeedCategory("all_posts");
                setFeedStatusFilter("all");
                setFeedKeyword("");
                setStatus(`피드에서 ${nodeId} 노드 결과를 확인하세요.`);
              }}
              onOpenWebInputForNode={onOpenWebInputForNode}
              onClearGraph={onClearGraphCanvas}
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
              selectedEdgeNodeIdSet={selectedEdgeNodeIdSet}
              selectedNodeIds={selectedNodeIds}
              setCanvasFullscreen={setCanvasFullscreen}
              setNodeSelection={setNodeSelection}
              setPanMode={setPanMode}
              setSelectedEdgeKey={setSelectedEdgeKey}
              setWorkflowQuestion={setWorkflowQuestion}
              stageInsetX={GRAPH_STAGE_INSET_X}
              stageInsetY={GRAPH_STAGE_INSET_Y}
              stageInsetBottom={GRAPH_STAGE_INSET_BOTTOM}
              suspendedWebTurn={suspendedWebTurn}
              turnModelLabel={turnModelLabel}
              turnRoleLabel={turnRoleLabel}
              canClearGraph={canClearGraph}
              undoStackLength={undoStack.length}
              workflowQuestion={workflowQuestion}
            />

            <WorkflowInspectorPane
              canvasFullscreen={canvasFullscreen}
              nodeProps={workflowInspectorPaneProps.nodeProps}
              toolsProps={workflowInspectorPaneProps.toolsProps}
            />
          </WorkflowPage>
        )}

        {workspaceTab === "feed" && (
          <FeedPage vm={feedPageVm} />
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
              codexMultiAgentModeOptions={[...codexMultiAgentModeOptions]}
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

      <PendingWebConnectModal
        onCancel={() => {
          setPendingWebConnectCheck(null);
          setStatus("그래프 실행 대기");
        }}
        onContinue={() => {
          if (!pendingWebConnectCheck) {
            return;
          }
          setPendingWebConnectCheck(null);
          void onRunGraph(true);
        }}
        onOpenBridgeTab={() => {
          setPendingWebConnectCheck(null);
          setWorkspaceTab("bridge");
          void refreshWebBridgeStatus(false, true);
        }}
        open={Boolean(pendingWebConnectCheck)}
        providersLabel={
          pendingWebConnectCheck
            ? pendingWebConnectCheck.providers.map((provider) => webProviderLabel(provider)).join(", ")
            : ""
        }
        reason={pendingWebConnectCheck?.reason ?? ""}
      />

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
