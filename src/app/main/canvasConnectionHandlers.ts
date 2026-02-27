import type { MouseEvent as ReactMouseEvent } from "react";
import type { GraphNode, NodeAnchorSide } from "../../features/workflow/types";
import type { LogicalPoint } from "./types";

export function createCanvasConnectionHandlers(params: any) {
  function clampCanvasZoom(nextZoom: number): number {
    return Math.max(params.minCanvasZoom, Math.min(params.maxCanvasZoom, nextZoom));
  }

  function scheduleZoomStatus(nextZoom: number) {
    if (params.zoomStatusTimerRef.current != null) {
      window.clearTimeout(params.zoomStatusTimerRef.current);
    }
    params.zoomStatusTimerRef.current = window.setTimeout(() => {
      params.setStatus(`그래프 배율 ${Math.round(nextZoom * 100)}%`);
      params.zoomStatusTimerRef.current = null;
    }, 120);
  }

  function syncQuestionInputHeight() {
    const input = params.questionInputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "auto";
    const nextHeight = Math.min(params.questionInputMaxHeight, input.scrollHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > params.questionInputMaxHeight ? "auto" : "hidden";
  }

  function syncCanvasLogicalViewport() {
    const canvas = params.graphCanvasRef.current;
    if (!canvas) {
      return;
    }
    const visibleWidth = canvas.clientWidth / params.canvasZoom;
    const visibleHeight = canvas.clientHeight / params.canvasZoom;
    params.setCanvasLogicalViewport((prev: any) => {
      if (Math.abs(prev.width - visibleWidth) < 0.5 && Math.abs(prev.height - visibleHeight) < 0.5) {
        return prev;
      }
      return { width: visibleWidth, height: visibleHeight };
    });
  }

  function nearestNodeSideByPoint(point: { x: number; y: number }, node: GraphNode): NodeAnchorSide {
    const size = params.getNodeVisualSize(node.id);
    const left = node.position.x;
    const right = node.position.x + size.width;
    const top = node.position.y;
    const bottom = node.position.y + size.height;
    const sideDistances: Array<{ side: NodeAnchorSide; value: number }> = [
      { side: "left", value: Math.abs(point.x - left) },
      { side: "right", value: Math.abs(right - point.x) },
      { side: "top", value: Math.abs(point.y - top) },
      { side: "bottom", value: Math.abs(bottom - point.y) },
    ];
    sideDistances.sort((a, b) => a.value - b.value);
    return sideDistances[0]?.side ?? "right";
  }

  function resolveConnectDropTarget(point: { x: number; y: number }): { nodeId: string; side: NodeAnchorSide } | null {
    const snapMargin = 28;
    let bestTarget: { nodeId: string; side: NodeAnchorSide; distance: number } | null = null;
    for (const node of params.canvasNodes) {
      if (!node.id || node.id === params.connectFromNodeId) {
        continue;
      }
      const size = params.getNodeVisualSize(node.id);
      const expandedLeft = node.position.x - snapMargin;
      const expandedRight = node.position.x + size.width + snapMargin;
      const expandedTop = node.position.y - snapMargin;
      const expandedBottom = node.position.y + size.height + snapMargin;
      const insideExpandedBounds =
        point.x >= expandedLeft &&
        point.x <= expandedRight &&
        point.y >= expandedTop &&
        point.y <= expandedBottom;
      if (!insideExpandedBounds) {
        continue;
      }
      const side = nearestNodeSideByPoint(point, node);
      const anchorPoint = params.getNodeAnchorPoint(node, side, size);
      const distance = Math.hypot(anchorPoint.x - point.x, anchorPoint.y - point.y);
      if (!bestTarget || distance < bestTarget.distance) {
        bestTarget = { nodeId: node.id, side, distance };
      }
    }
    return bestTarget ? { nodeId: bestTarget.nodeId, side: bestTarget.side } : null;
  }

  function snapConnectPreviewPoint(point: { x: number; y: number }) {
    const target = resolveConnectDropTarget(point);
    if (!target) {
      params.setConnectPreviewPoint(point);
      return;
    }
    const node = params.canvasNodes.find((row: GraphNode) => row.id === target.nodeId);
    if (!node) {
      params.setConnectPreviewPoint(point);
      return;
    }
    const anchor = params.getNodeAnchorPoint(node, target.side, params.getNodeVisualSize(node.id));
    params.setConnectPreviewPoint(anchor);
  }

  function clientToLogicalPoint(clientX: number, clientY: number, zoomValue = params.canvasZoom): { x: number; y: number } | null {
    const canvas = params.graphCanvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const stageOffsetX = params.graphStageInsetX;
    const stageOffsetY = params.graphStageInsetY;
    return {
      x: (clientX - rect.left + canvas.scrollLeft - stageOffsetX) / zoomValue,
      y: (clientY - rect.top + canvas.scrollTop - stageOffsetY) / zoomValue,
    };
  }

  function onEdgeDragStart(
    event: ReactMouseEvent<SVGPathElement | SVGCircleElement>,
    edgeKey: string,
    startPoint: LogicalPoint,
    endPoint: LogicalPoint,
  ) {
    if (params.panMode || params.isConnectingDrag) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    params.setNodeSelection([]);
    params.setSelectedEdgeKey(edgeKey);
    const pointer = clientToLogicalPoint(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }
    const distanceToStart = Math.hypot(pointer.x - startPoint.x, pointer.y - startPoint.y);
    const distanceToEnd = Math.hypot(pointer.x - endPoint.x, pointer.y - endPoint.y);

    const currentEdge = params.graph.edges.find((edge: any) => params.getGraphEdgeKey(edge) === edgeKey);
    if (!currentEdge) {
      return;
    }
    const fromNode = params.canvasNodeMap.get(currentEdge.from.nodeId);
    const toNode = params.canvasNodeMap.get(currentEdge.to.nodeId);
    if (!fromNode || !toNode) {
      return;
    }
    const fromSize = params.getNodeVisualSize(fromNode.id);
    const toSize = params.getNodeVisualSize(toNode.id);
    const auto = params.getAutoConnectionSides(fromNode, toNode, fromSize, toSize);
    const fromSide = currentEdge.from.side ?? auto.fromSide;
    const toSide = currentEdge.to.side ?? auto.toSide;
    const reconnectFromSource = distanceToEnd <= distanceToStart;
    const previewSourceNode = reconnectFromSource ? fromNode : toNode;
    const previewSourceSize = reconnectFromSource ? fromSize : toSize;
    const previewSourceSide = reconnectFromSource ? fromSide : toSide;
    const sourceAnchor = params.getNodeAnchorPoint(previewSourceNode, previewSourceSide, previewSourceSize);

    event.preventDefault();
    event.stopPropagation();
    params.edgeDragStartSnapshotRef.current = params.cloneGraph(params.graph);
    params.edgeDragRef.current = {
      edgeKey,
      endpoint: reconnectFromSource ? "to" : "from",
      fixedNodeId: reconnectFromSource ? currentEdge.from.nodeId : currentEdge.to.nodeId,
      fixedSide: reconnectFromSource ? fromSide : toSide,
    };
    params.setConnectFromNodeId(previewSourceNode.id);
    params.setConnectFromSide(previewSourceSide);
    params.setConnectPreviewStartPoint(sourceAnchor);
    params.setConnectPreviewPoint(pointer);
    params.setIsConnectingDrag(true);
  }

  function onAssignSelectedEdgeAnchor(nodeId: string, side: NodeAnchorSide): boolean {
    if (!params.selectedEdgeKey) {
      return false;
    }
    const currentEdge = params.graph.edges.find((edge: any) => params.getGraphEdgeKey(edge) === params.selectedEdgeKey);
    if (!currentEdge) {
      return false;
    }
    const isSourceNode = currentEdge.from.nodeId === nodeId;
    const isTargetNode = currentEdge.to.nodeId === nodeId;
    if (!isSourceNode && !isTargetNode) {
      return false;
    }
    const currentSide = isSourceNode ? currentEdge.from.side : currentEdge.to.side;
    if (currentSide === side) {
      return true;
    }
    params.applyGraphChange((prev: any) => {
      const nextEdges = prev.edges.map((edge: any) => {
        if (params.getGraphEdgeKey(edge) !== params.selectedEdgeKey) {
          return edge;
        }
        if (edge.from.nodeId === nodeId) {
          return {
            ...edge,
            from: {
              ...edge.from,
              side,
            },
          };
        }
        if (edge.to.nodeId === nodeId) {
          return {
            ...edge,
            to: {
              ...edge.to,
              side,
            },
          };
        }
        return edge;
      });
      return {
        ...prev,
        edges: nextEdges,
      };
    });
    params.setStatus("선 연결 위치를 업데이트했습니다.");
    return true;
  }

  function reconnectSelectedEdgeEndpoint(
    dragState: {
      edgeKey: string;
      endpoint: "from" | "to";
      fixedNodeId: string;
      fixedSide: NodeAnchorSide;
    },
    dropNodeId: string,
    dropSide: NodeAnchorSide,
  ): boolean {
    let changed = false;
    let blockedReason = "";
    let nextSelectedEdgeKey = "";

    params.applyGraphChange((prev: any) => {
      const currentIndex = prev.edges.findIndex((edge: any) => params.getGraphEdgeKey(edge) === dragState.edgeKey);
      if (currentIndex < 0) {
        blockedReason = "대상 선을 찾지 못했습니다.";
        return prev;
      }
      const current = prev.edges[currentIndex];
      const reconnectTargetEndpoint = dragState.endpoint === "to";
      const fixedNodeId = reconnectTargetEndpoint ? current.from.nodeId : current.to.nodeId;
      if (!fixedNodeId || fixedNodeId === dropNodeId) {
        blockedReason = "동일 노드로는 연결할 수 없습니다.";
        return prev;
      }
      const candidateFromNodeId = reconnectTargetEndpoint ? fixedNodeId : dropNodeId;
      const candidateToNodeId = reconnectTargetEndpoint ? dropNodeId : fixedNodeId;
      const candidateFromSide = reconnectTargetEndpoint ? dragState.fixedSide : dropSide;
      const candidateToSide = reconnectTargetEndpoint ? dropSide : dragState.fixedSide;

      const duplicateExists = prev.edges.some(
        (edge: any, index: number) =>
          index !== currentIndex &&
          edge.from.nodeId === candidateFromNodeId &&
          edge.to.nodeId === candidateToNodeId,
      );
      if (duplicateExists) {
        blockedReason = "이미 동일한 방향의 연결이 있습니다.";
        return prev;
      }

      const reverseExists = prev.edges.some(
        (edge: any, index: number) =>
          index !== currentIndex &&
          edge.from.nodeId === candidateToNodeId &&
          edge.to.nodeId === candidateFromNodeId,
      );
      if (reverseExists) {
        blockedReason = "양방향 연결은 허용되지 않습니다.";
        return prev;
      }

      const nextEdge = {
        ...current,
        from: {
          ...current.from,
          nodeId: candidateFromNodeId,
          side: candidateFromSide,
        },
        to: {
          ...current.to,
          nodeId: candidateToNodeId,
          side: candidateToSide,
        },
        control: undefined,
      };
      const nextEdges = prev.edges.slice();
      nextEdges[currentIndex] = nextEdge;
      nextSelectedEdgeKey = params.getGraphEdgeKey(nextEdge);
      changed = true;
      return {
        ...prev,
        edges: nextEdges,
      };
    });

    if (blockedReason) {
      params.setStatus(blockedReason);
      return false;
    }
    if (changed) {
      if (nextSelectedEdgeKey) {
        params.setSelectedEdgeKey(nextSelectedEdgeKey);
      }
      params.setStatus("선 연결 대상을 업데이트했습니다.");
    }
    return changed;
  }

  return {
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
  };
}
