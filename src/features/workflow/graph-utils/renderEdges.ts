import type { GraphEdge, GraphNode, NodeAnchorSide } from "../types";
import {
  alignAutoEdgePoints,
  buildManualEdgePath,
  buildRoundedEdgePath,
  edgeMidPoint,
  getAutoConnectionSides,
  getNodeAnchorPoint,
} from "./edges";
import type { LogicalPoint, NodeVisualSize } from "./shared";

export type CanvasEdgeEntry = {
  edge: GraphEdge;
  edgeKey: string;
  readOnly: boolean;
};

export type CanvasEdgeLine = {
  key: string;
  edgeKey: string;
  path: string;
  startPoint: LogicalPoint;
  endPoint: LogicalPoint;
  controlPoint: LogicalPoint;
  hasManualControl: boolean;
  readOnly: boolean;
};

type BuildCanvasEdgeLinesParams = {
  entries: CanvasEdgeEntry[];
  nodeMap: Map<string, GraphNode>;
  getNodeVisualSize: (nodeId: string) => NodeVisualSize;
};

export function buildCanvasEdgeLines(params: BuildCanvasEdgeLinesParams): CanvasEdgeLine[] {
  const { entries, nodeMap, getNodeVisualSize } = params;

  const groupedFrom = new Map<string, CanvasEdgeEntry[]>();
  const groupedTo = new Map<string, CanvasEdgeEntry[]>();
  for (const entry of entries) {
    const fromId = entry.edge.from.nodeId;
    const toId = entry.edge.to.nodeId;
    const fromRows = groupedFrom.get(fromId) ?? [];
    const toRows = groupedTo.get(toId) ?? [];
    fromRows.push(entry);
    toRows.push(entry);
    groupedFrom.set(fromId, fromRows);
    groupedTo.set(toId, toRows);
  }

  const bundledFromSideByNodeId = new Map<string, NodeAnchorSide>();
  groupedFrom.forEach((groupedEntries, fromId) => {
    if (groupedEntries.length < 2) {
      return;
    }
    const fromNode = nodeMap.get(fromId);
    if (!fromNode) {
      return;
    }
    const fromSize = getNodeVisualSize(fromNode.id);
    const fromCenterX = fromNode.position.x + fromSize.width / 2;
    const fromCenterY = fromNode.position.y + fromSize.height / 2;
    let sumDx = 0;
    let sumDy = 0;
    let targetCount = 0;
    for (const entry of groupedEntries) {
      const toNode = nodeMap.get(entry.edge.to.nodeId);
      if (!toNode) {
        continue;
      }
      const toSize = getNodeVisualSize(toNode.id);
      const toCenterX = toNode.position.x + toSize.width / 2;
      const toCenterY = toNode.position.y + toSize.height / 2;
      sumDx += toCenterX - fromCenterX;
      sumDy += toCenterY - fromCenterY;
      targetCount += 1;
    }
    if (targetCount === 0) {
      return;
    }
    const avgDx = sumDx / targetCount;
    const avgDy = sumDy / targetCount;
    const side: NodeAnchorSide =
      Math.abs(avgDx) >= Math.abs(avgDy) ? (avgDx >= 0 ? "right" : "left") : avgDy >= 0 ? "bottom" : "top";
    bundledFromSideByNodeId.set(fromId, side);
  });

  const bundledToSideByNodeId = new Map<string, NodeAnchorSide>();
  groupedTo.forEach((groupedEntries, toId) => {
    if (groupedEntries.length < 2) {
      return;
    }
    const toNode = nodeMap.get(toId);
    if (!toNode) {
      return;
    }
    const toSize = getNodeVisualSize(toNode.id);
    const toCenterX = toNode.position.x + toSize.width / 2;
    const toCenterY = toNode.position.y + toSize.height / 2;
    let sumDx = 0;
    let sumDy = 0;
    let sourceCount = 0;
    for (const entry of groupedEntries) {
      const fromNode = nodeMap.get(entry.edge.from.nodeId);
      if (!fromNode) {
        continue;
      }
      const fromSize = getNodeVisualSize(fromNode.id);
      const fromCenterX = fromNode.position.x + fromSize.width / 2;
      const fromCenterY = fromNode.position.y + fromSize.height / 2;
      sumDx += toCenterX - fromCenterX;
      sumDy += toCenterY - fromCenterY;
      sourceCount += 1;
    }
    if (sourceCount === 0) {
      return;
    }
    const avgDx = sumDx / sourceCount;
    const avgDy = sumDy / sourceCount;
    const side: NodeAnchorSide =
      Math.abs(avgDx) >= Math.abs(avgDy) ? (avgDx >= 0 ? "left" : "right") : avgDy >= 0 ? "top" : "bottom";
    bundledToSideByNodeId.set(toId, side);
  });

  const snapPoint = (point: LogicalPoint): LogicalPoint => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  });

  const bundledFromAnchorByNodeId = new Map<string, LogicalPoint>();
  bundledFromSideByNodeId.forEach((side, nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }
    const size = getNodeVisualSize(node.id);
    bundledFromAnchorByNodeId.set(nodeId, snapPoint(getNodeAnchorPoint(node, side, size)));
  });

  const bundledToAnchorByNodeId = new Map<string, LogicalPoint>();
  bundledToSideByNodeId.forEach((side, nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }
    const size = getNodeVisualSize(node.id);
    bundledToAnchorByNodeId.set(nodeId, snapPoint(getNodeAnchorPoint(node, side, size)));
  });

  return entries
    .map((entry, index) => {
      const edge = entry.edge;
      const fromNode = nodeMap.get(edge.from.nodeId);
      const toNode = nodeMap.get(edge.to.nodeId);
      if (!fromNode || !toNode) {
        return null;
      }

      const fromSize = getNodeVisualSize(fromNode.id);
      const toSize = getNodeVisualSize(toNode.id);
      const auto = getAutoConnectionSides(fromNode, toNode, fromSize, toSize);
      const hasManualControl =
        !entry.readOnly && typeof edge.control?.x === "number" && typeof edge.control?.y === "number";
      const bundledFromSide = hasManualControl ? null : bundledFromSideByNodeId.get(fromNode.id);
      const bundledToSide = hasManualControl ? null : bundledToSideByNodeId.get(toNode.id);
      const resolvedFromSide = hasManualControl
        ? (edge.from.side ?? auto.fromSide)
        : bundledFromSide ?? auto.fromSide;
      const resolvedToSide = hasManualControl ? (edge.to.side ?? auto.toSide) : bundledToSide ?? auto.toSide;
      let fromPoint = bundledFromSide
        ? (bundledFromAnchorByNodeId.get(fromNode.id) ??
          snapPoint(getNodeAnchorPoint(fromNode, resolvedFromSide, fromSize)))
        : snapPoint(getNodeAnchorPoint(fromNode, resolvedFromSide, fromSize));
      let toPoint = bundledToSide
        ? (bundledToAnchorByNodeId.get(toNode.id) ?? snapPoint(getNodeAnchorPoint(toNode, resolvedToSide, toSize)))
        : snapPoint(getNodeAnchorPoint(toNode, resolvedToSide, toSize));

      if (!hasManualControl && !bundledFromSide && !bundledToSide) {
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
        fromPoint = snapPoint(aligned.fromPoint);
        toPoint = snapPoint(aligned.toPoint);
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
              bundledFromSide || bundledToSide ? 0 : 8,
            ),
      } satisfies CanvasEdgeLine;
    })
    .filter(Boolean) as CanvasEdgeLine[];
}

