import { useEffect } from "react";
import type { NodeVisualSize } from "../types";

export function useMainAppStateEffects(params: any) {
  useEffect(() => {
    const nodeIdSet = new Set(params.canvasNodes.map((node: any) => node.id));
    const filteredSelected = params.selectedNodeIds.filter((id: string) => nodeIdSet.has(id));
    if (filteredSelected.length !== params.selectedNodeIds.length) {
      params.setSelectedNodeIds(filteredSelected);
    }

    if (params.selectedNodeId && !nodeIdSet.has(params.selectedNodeId)) {
      params.setSelectedNodeId(filteredSelected[0] ?? "");
      return;
    }

    if (!params.selectedNodeId && filteredSelected.length > 0) {
      params.setSelectedNodeId(filteredSelected[0]);
      return;
    }

    if (params.selectedNodeId && !filteredSelected.includes(params.selectedNodeId)) {
      params.setSelectedNodeIds((prev: string[]) => [...prev, params.selectedNodeId]);
    }
  }, [params.canvasNodes, params.selectedNodeIds, params.selectedNodeId]);

  useEffect(() => {
    if (!params.selectedEdgeKey) {
      return;
    }
    const exists = params.canvasDisplayEdges.some(
      (row: any) => !row.readOnly && row.edgeKey === params.selectedEdgeKey,
    );
    if (!exists) {
      params.setSelectedEdgeKey("");
    }
  }, [params.canvasDisplayEdges, params.selectedEdgeKey]);

  useEffect(() => {
    try {
      const next = params.cwd.trim();
      if (!next || next === ".") {
        window.localStorage.removeItem(params.workspaceCwdStorageKey);
        return;
      }
      window.localStorage.setItem(params.workspaceCwdStorageKey, next);
    } catch {
      // ignore persistence failures
    }
  }, [params.cwd]);

  useEffect(() => {
    try {
      window.localStorage.setItem(params.loginCompletedStorageKey, params.loginCompleted ? "1" : "0");
    } catch {
      // ignore persistence failures
    }
  }, [params.loginCompleted]);

  useEffect(() => {
    try {
      window.localStorage.setItem(params.authModeStorageKey, params.authMode);
    } catch {
      // ignore persistence failures
    }
  }, [params.authMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(params.codexMultiAgentModeStorageKey, params.codexMultiAgentMode);
    } catch {
      // ignore persistence failures
    }
  }, [params.codexMultiAgentMode]);

  useEffect(() => {
    params.syncQuestionInputHeight();
  }, [params.workflowQuestion]);

  useEffect(() => {
    params.syncCanvasLogicalViewport();
    const canvas = params.graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    const onScrollOrResize = () => params.syncCanvasLogicalViewport();
    canvas.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      canvas.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [params.canvasZoom, params.canvasFullscreen, params.workspaceTab]);

  useEffect(() => {
    params.syncCanvasLogicalViewport();
  }, [params.graph.nodes, params.canvasZoom]);

  useEffect(() => {
    if (params.workspaceTab !== "workflow") {
      return;
    }
    const canvas = params.graphCanvasRef.current;
    if (!canvas) {
      return;
    }

    const elements = Array.from(canvas.querySelectorAll(".graph-node[data-node-id]")) as HTMLDivElement[];
    const seen = new Set<string>();
    let changed = false;

    for (const element of elements) {
      const nodeId = element.dataset.nodeId;
      if (!nodeId) {
        continue;
      }
      seen.add(nodeId);
      const nextSize: NodeVisualSize = { width: element.offsetWidth, height: element.offsetHeight };
      const prevSize = params.nodeSizeMapRef.current[nodeId];
      if (!prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height) {
        params.nodeSizeMapRef.current[nodeId] = nextSize;
        changed = true;
      }
    }

    for (const knownId of Object.keys(params.nodeSizeMapRef.current)) {
      if (!seen.has(knownId)) {
        delete params.nodeSizeMapRef.current[knownId];
        changed = true;
      }
    }

    if (changed) {
      params.setNodeSizeVersion((version: number) => version + 1);
    }
  });

  useEffect(() => {
    return () => {
      if (params.dragAutoPanFrameRef.current != null) {
        cancelAnimationFrame(params.dragAutoPanFrameRef.current);
      }
      if (params.dragWindowMoveHandlerRef.current) {
        window.removeEventListener("mousemove", params.dragWindowMoveHandlerRef.current);
      }
      if (params.dragWindowUpHandlerRef.current) {
        window.removeEventListener("mouseup", params.dragWindowUpHandlerRef.current);
      }
      if (params.edgeDragWindowMoveHandlerRef.current) {
        window.removeEventListener("mousemove", params.edgeDragWindowMoveHandlerRef.current);
      }
      if (params.edgeDragWindowUpHandlerRef.current) {
        window.removeEventListener("mouseup", params.edgeDragWindowUpHandlerRef.current);
      }
      if (params.zoomStatusTimerRef.current != null) {
        window.clearTimeout(params.zoomStatusTimerRef.current);
      }
      if (params.webTurnResolverRef.current) {
        params.webTurnResolverRef.current({ ok: false, error: "화면이 닫혀 실행이 취소되었습니다." });
        params.webTurnResolverRef.current = null;
      }
      params.clearQueuedWebTurnRequests("화면이 닫혀 실행이 취소되었습니다.");
    };
  }, []);

  useEffect(() => {
    if (!params.isConnectingDrag || !params.connectFromNodeId) {
      return;
    }
    const onWindowMove = (event: MouseEvent) => {
      const point = params.clientToLogicalPoint(event.clientX, event.clientY);
      if (point) {
        params.snapConnectPreviewPoint(point);
      }
    };
    const onWindowUp = (event: MouseEvent) => {
      params.onCanvasMouseUp({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", onWindowUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMove);
      window.removeEventListener("mouseup", onWindowUp);
    };
  }, [params.isConnectingDrag, params.connectFromNodeId, params.canvasZoom]);
}
