import type { GraphData, NodeExecutionStatus } from "../../features/workflow/types";
import type { TurnConfig } from "../../features/workflow/domain";
import type { NodeRunState, NodeVisualSize, RunRecord } from "./types";

export function createCoreStateHandlers(params: any) {
  function setStatus(next: string) {
    params.setStatusState(params.tp(next));
  }

  function setError(next: string) {
    const localized = params.tp(next);
    params.setErrorState(localized);
    const trimmed = localized.trim();
    if (!trimmed) {
      return;
    }
    const at = new Date().toISOString();
    params.setErrorLogs((prev: string[]) => [`[${at}] ${trimmed}`, ...prev].slice(0, 600));
  }

  function persistRunRecordFile(name: string, runRecord: RunRecord) {
    return params.persistRunRecordFileHelper({
      invokeFn: params.invokeFn,
      name,
      runRecord,
    });
  }

  function getNodeVisualSize(nodeId: string): NodeVisualSize {
    return params.nodeSizeMapRef.current[nodeId] ?? { width: params.nodeWidth, height: params.nodeHeight };
  }

  function setNodeSelection(nextIds: string[], primaryId?: string) {
    const deduped = nextIds.filter((id, index, arr) => arr.indexOf(id) === index);
    params.setSelectedNodeIds(deduped);
    if (deduped.length === 0) {
      params.setSelectedNodeId("");
      return;
    }
    if (primaryId && deduped.includes(primaryId)) {
      params.setSelectedNodeId(primaryId);
      return;
    }
    if (params.selectedNodeId && deduped.includes(params.selectedNodeId)) {
      return;
    }
    params.setSelectedNodeId(deduped[deduped.length - 1]);
  }

  function addNodeLog(nodeId: string, message: string) {
    const localized = params.tp(message);
    if (params.collectingRunRef.current) {
      const current = params.runLogCollectorRef.current[nodeId] ?? [];
      params.runLogCollectorRef.current[nodeId] = [...current, localized].slice(-500);
    }
    params.setNodeStates((prev: Record<string, NodeRunState>) => {
      const current = prev[nodeId] ?? { status: "idle", logs: [] };
      const nextLogs = [...current.logs, localized].slice(-300);
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
    params.setNodeStates((prev: Record<string, NodeRunState>) => {
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
    params.setNodeStates((prev: Record<string, NodeRunState>) => {
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
    const next = [...(params.pendingNodeRequestsRef.current[nodeId] ?? []), trimmed];
    params.pendingNodeRequestsRef.current = {
      ...params.pendingNodeRequestsRef.current,
      [nodeId]: next,
    };
    params.setPendingNodeRequests((prev: Record<string, string[]>) => ({
      ...prev,
      [nodeId]: next,
    }));
    addNodeLog(nodeId, `[사용자 추가 요청] ${trimmed}`);
  }

  function consumeNodeRequests(nodeId: string): string[] {
    const queued = [...(params.pendingNodeRequestsRef.current[nodeId] ?? [])];
    params.pendingNodeRequestsRef.current = {
      ...params.pendingNodeRequestsRef.current,
      [nodeId]: [],
    };
    params.setPendingNodeRequests((prev: Record<string, string[]>) => ({
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
    const nodeById = new Map(params.graph.nodes.map((node: any) => [node.id, node]));

    const isTerminal = (status: NodeExecutionStatus) =>
      status === "done" || status === "low_quality" || status === "failed" || status === "skipped" || status === "cancelled";

    params.setNodeStates((prev: Record<string, NodeRunState>) => {
      const next: Record<string, NodeRunState> = { ...prev };
      let changed = false;

      for (const [nodeId, current] of Object.entries(prev)) {
        const node = nodeById.get(nodeId) as any;
        if (!node || node.type !== "turn") {
          continue;
        }
        if (params.getTurnExecutor(node.config as TurnConfig) !== "codex") {
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
    params.setGraph((prev: GraphData) => {
      const rawNext = updater(prev);
      const next = options?.autoLayout ? params.autoArrangeGraphLayout(rawNext) : rawNext;
      if (params.graphEquals(prev, next)) {
        return prev;
      }
      params.setUndoStack((stack: GraphData[]) => [...stack.slice(-79), params.cloneGraph(prev)]);
      params.setRedoStack([]);
      return next;
    });
  }

  function onUndoGraph() {
    params.setUndoStack((prevUndo: GraphData[]) => {
      if (prevUndo.length === 0) {
        return prevUndo;
      }
      const snapshot = prevUndo[prevUndo.length - 1];
      params.setGraph((current: GraphData) => {
        params.setRedoStack((redo: GraphData[]) => [...redo.slice(-79), params.cloneGraph(current)]);
        return params.cloneGraph(snapshot);
      });
      return prevUndo.slice(0, -1);
    });
  }

  function onRedoGraph() {
    params.setRedoStack((prevRedo: GraphData[]) => {
      if (prevRedo.length === 0) {
        return prevRedo;
      }
      const snapshot = prevRedo[prevRedo.length - 1];
      params.setGraph((current: GraphData) => {
        params.setUndoStack((undo: GraphData[]) => [...undo.slice(-79), params.cloneGraph(current)]);
        return params.cloneGraph(snapshot);
      });
      return prevRedo.slice(0, -1);
    });
  }

  function onClearGraphCanvas() {
    if (params.isGraphRunning || params.isRunStarting) {
      setStatus("워크플로우 실행 중에는 캔버스를 비울 수 없습니다.");
      return;
    }
    if (params.graph.nodes.length === 0 && params.graph.edges.length === 0) {
      setStatus("캔버스가 이미 비어 있습니다.");
      return;
    }
    applyGraphChange((prev) => ({
      ...prev,
      nodes: [],
      edges: [],
    }));
    setNodeSelection([]);
    params.setSelectedEdgeKey("");
    params.setNodeStates({});
    setStatus("캔버스의 노드와 연결선을 모두 지웠습니다.");
  }

  function reportSoftError(prefix: string, error: unknown) {
    const message = `${prefix}: ${params.toErrorText(error)}`;
    console.error(message, error);
    setError(message);
  }

  function normalizeWebBridgeProgressMessage(stage: string, message: string) {
    if (stage === "bridge_waiting_user_send") {
      return "자동 전송 확인 대기 중입니다. 웹 탭에서 전송 버튼을 클릭하면 계속 진행됩니다.";
    }
    return message.trim() || stage;
  }

  function clearWebBridgeStageWarnTimer(providerKey: string) {
    const current = params.webBridgeStageWarnTimerRef.current[providerKey];
    if (typeof current === "number") {
      window.clearTimeout(current);
      delete params.webBridgeStageWarnTimerRef.current[providerKey];
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
    params.webBridgeStageWarnTimerRef.current[providerKey] = window.setTimeout(() => {
      setStatus(statusMessage);
      const activeWebNodeId = params.activeWebNodeByProviderRef.current[providerKey];
      if (activeWebNodeId) {
        addNodeLog(activeWebNodeId, nodeLogMessage);
      }
      onTimeout?.();
      delete params.webBridgeStageWarnTimerRef.current[providerKey];
    }, timeoutMs);
  }

  return {
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
  };
}
