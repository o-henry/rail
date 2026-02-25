import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { invoke } from "../../shared/tauri";
import { autoArrangeGraphLayout, cloneGraph } from "../../features/workflow/graph-utils";
import type { GraphData, NodeAnchorSide } from "../../features/workflow/types";
import { normalizeGraph } from "../mainAppGraphHelpers";
import type { LogicalPoint, NodeRunState } from "../main";

type UseGraphFileActionsParams<TNode> = {
  graph: GraphData;
  graphFileName: string;
  selectedGraphFileName: string;
  graphRenameDraft: string;
  selectedNode: TNode | null;
  setError: (value: string) => void;
  refreshGraphFiles: () => Promise<void>;
  setGraphFileName: Dispatch<SetStateAction<string>>;
  setSelectedGraphFileName: Dispatch<SetStateAction<string>>;
  setStatus: (value: string) => void;
  setGraphRenameDraft: Dispatch<SetStateAction<string>>;
  setGraphRenameOpen: Dispatch<SetStateAction<boolean>>;
  setGraph: Dispatch<SetStateAction<GraphData>>;
  setUndoStack: Dispatch<SetStateAction<GraphData[]>>;
  setRedoStack: Dispatch<SetStateAction<GraphData[]>>;
  setNodeSelection: (nextIds: string[], primaryId?: string) => void;
  setSelectedEdgeKey: Dispatch<SetStateAction<string>>;
  setNodeStates: Dispatch<SetStateAction<Record<string, NodeRunState>>>;
  setConnectFromNodeId: Dispatch<SetStateAction<string>>;
  setConnectFromSide: Dispatch<SetStateAction<NodeAnchorSide | null>>;
  setConnectPreviewStartPoint: Dispatch<SetStateAction<LogicalPoint | null>>;
  setConnectPreviewPoint: Dispatch<SetStateAction<LogicalPoint | null>>;
  setIsConnectingDrag: Dispatch<SetStateAction<boolean>>;
  setMarqueeSelection: Dispatch<SetStateAction<{
    start: LogicalPoint;
    current: LogicalPoint;
    append: boolean;
  } | null>>;
  lastAppliedPresetRef: MutableRefObject<{ kind: string; graph: GraphData } | null>;
  pickDefaultCanvasNodeId: (nodes: GraphData["nodes"]) => string;
  extractSelectedNodeId: (selectedNode: TNode) => string;
};

export function useGraphFileActions<TNode>(params: UseGraphFileActionsParams<TNode>) {
  const {
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
    extractSelectedNodeId,
  } = params;

  const updateNodeConfigById = useCallback(
    (nodeId: string, key: string, value: unknown) => {
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
    },
    [setGraph],
  );

  const updateSelectedNodeConfig = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNode) {
        return;
      }
      updateNodeConfigById(extractSelectedNodeId(selectedNode), key, value);
    },
    [extractSelectedNodeId, selectedNode, updateNodeConfigById],
  );

  const onCloseRenameGraph = useCallback(() => {
    setGraphRenameOpen(false);
    setGraphRenameDraft("");
  }, [setGraphRenameDraft, setGraphRenameOpen]);

  const saveGraph = useCallback(async () => {
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
  }, [
    graph,
    graphFileName,
    refreshGraphFiles,
    setError,
    setGraphFileName,
    setSelectedGraphFileName,
    setStatus,
  ]);

  const renameGraph = useCallback(async () => {
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
  }, [
    graphRenameDraft,
    refreshGraphFiles,
    selectedGraphFileName,
    setError,
    setGraphFileName,
    setGraphRenameDraft,
    setGraphRenameOpen,
    setSelectedGraphFileName,
    setStatus,
  ]);

  const onOpenRenameGraph = useCallback(() => {
    const current = selectedGraphFileName.trim();
    if (!current) {
      setError("이름을 변경할 그래프 파일을 먼저 선택하세요.");
      return;
    }
    setError("");
    setGraphRenameDraft(current);
    setGraphRenameOpen(true);
  }, [selectedGraphFileName, setError, setGraphRenameDraft, setGraphRenameOpen]);

  const deleteGraph = useCallback(async () => {
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
  }, [
    onCloseRenameGraph,
    refreshGraphFiles,
    selectedGraphFileName,
    setError,
    setGraphFileName,
    setSelectedGraphFileName,
    setStatus,
  ]);

  const loadGraph = useCallback(
    async (name?: string) => {
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
        setMarqueeSelection(null);
        setStatus(`그래프 불러오기 완료 (${target})`);
        setGraphFileName(target);
        setSelectedGraphFileName(target);
        onCloseRenameGraph();
      } catch (e) {
        setError(String(e));
      }
    },
    [
      graphFileName,
      lastAppliedPresetRef,
      onCloseRenameGraph,
      pickDefaultCanvasNodeId,
      setConnectFromNodeId,
      setConnectFromSide,
      setConnectPreviewPoint,
      setConnectPreviewStartPoint,
      setError,
      setGraph,
      setGraphFileName,
      setIsConnectingDrag,
      setMarqueeSelection,
      setNodeSelection,
      setNodeStates,
      setRedoStack,
      setSelectedEdgeKey,
      setSelectedGraphFileName,
      setStatus,
      setUndoStack,
    ],
  );

  return {
    updateNodeConfigById,
    updateSelectedNodeConfig,
    saveGraph,
    renameGraph,
    onOpenRenameGraph,
    onCloseRenameGraph,
    deleteGraph,
    loadGraph,
  };
}
