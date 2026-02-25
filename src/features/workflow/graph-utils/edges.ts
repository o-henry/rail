import type { GraphData, GraphNode, NodeAnchorSide } from "../types";
import {
  AUTO_LAYOUT_COLUMN_GAP,
  AUTO_LAYOUT_ROW_GAP,
  AUTO_LAYOUT_START_X,
  AUTO_LAYOUT_START_Y,
  AUTO_EDGE_STRAIGHTEN_THRESHOLD,
  NODE_ANCHOR_OFFSET,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LogicalPoint,
  type NodeVisualSize,
} from "./shared";

export function buildRoundedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  withArrow = true,
  fromSide: NodeAnchorSide,
  toSide: NodeAnchorSide,
  cornerRadius = 8,
): string {
  const offsetPoint = (point: LogicalPoint, side: NodeAnchorSide, distance: number): LogicalPoint => {
    if (side === "top") {
      return { x: point.x, y: point.y - distance };
    }
    if (side === "right") {
      return { x: point.x + distance, y: point.y };
    }
    if (side === "bottom") {
      return { x: point.x, y: point.y + distance };
    }
    return { x: point.x - distance, y: point.y };
  };

  const simplifyOrthogonalPoints = (points: LogicalPoint[]): LogicalPoint[] => {
    if (points.length <= 2) {
      return points;
    }
    const simplified: LogicalPoint[] = [points[0]];
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      if (simplified.length < 2) {
        simplified.push(point);
        continue;
      }
      const head = simplified[simplified.length - 2];
      const mid = simplified[simplified.length - 1];
      const isCollinearX = Math.abs(head.x - mid.x) <= 0.1 && Math.abs(mid.x - point.x) <= 0.1;
      const isCollinearY = Math.abs(head.y - mid.y) <= 0.1 && Math.abs(mid.y - point.y) <= 0.1;
      if (isCollinearX || isCollinearY) {
        simplified[simplified.length - 1] = point;
      } else {
        simplified.push(point);
      }
    }
    return simplified;
  };

  const roundedPathFromPoints = (points: LogicalPoint[], radius: number): string => {
    if (points.length < 2) {
      return "";
    }
    if (radius <= 0) {
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i += 1) {
        d += ` L ${points[i].x} ${points[i].y}`;
      }
      return d;
    }
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const next = points[i + 1];

      const inVec = { x: cur.x - prev.x, y: cur.y - prev.y };
      const outVec = { x: next.x - cur.x, y: next.y - cur.y };
      const inLen = Math.hypot(inVec.x, inVec.y);
      const outLen = Math.hypot(outVec.x, outVec.y);
      if (inLen < 0.1 || outLen < 0.1) {
        d += ` L ${cur.x} ${cur.y}`;
        continue;
      }

    const corner = Math.min(radius, inLen / 2, outLen / 2);
      const p1 = {
        x: cur.x - (inVec.x / inLen) * corner,
        y: cur.y - (inVec.y / inLen) * corner,
      };
      const p2 = {
        x: cur.x + (outVec.x / outLen) * corner,
        y: cur.y + (outVec.y / outLen) * corner,
      };
      d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  };

  const start = { x: Math.round(x1), y: Math.round(y1) };
  const end = { x: Math.round(x2), y: Math.round(y2) };
  const alignedVertical =
    (fromSide === "top" || fromSide === "bottom") &&
    (toSide === "top" || toSide === "bottom") &&
    Math.abs(x1 - x2) <= 24;
  const alignedHorizontal =
    (fromSide === "left" || fromSide === "right") &&
    (toSide === "left" || toSide === "right") &&
    Math.abs(y1 - y2) <= 24;
  if (alignedVertical || alignedHorizontal) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const baseDistance = Math.hypot(end.x - start.x, end.y - start.y);
  if (baseDistance <= 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const arrowLead = withArrow ? 10 : 0;
  const startStubDistance = 24;
  const endStubDistance = 24 + arrowLead;
  const startStub = offsetPoint(start, fromSide, startStubDistance);
  const endStub = offsetPoint(end, toSide, -endStubDistance);

  const fromHorizontal = fromSide === "left" || fromSide === "right";
  const toHorizontal = toSide === "left" || toSide === "right";

  const points: LogicalPoint[] = [start, startStub];
  if (fromHorizontal && toHorizontal) {
    const midX = Math.round((start.x + end.x) / 2);
    points.push({ x: midX, y: startStub.y }, { x: midX, y: endStub.y });
  } else if (!fromHorizontal && !toHorizontal) {
    const midY = Math.round((start.y + end.y) / 2);
    points.push({ x: startStub.x, y: midY }, { x: endStub.x, y: midY });
  } else if (fromHorizontal && !toHorizontal) {
    points.push({ x: endStub.x, y: startStub.y });
  } else {
    points.push({ x: startStub.x, y: endStub.y });
  }
  points.push(endStub);

  if (withArrow && arrowLead > 0) {
    const leadPoint = offsetPoint(end, toSide, -arrowLead);
    points.push(leadPoint);
  }
  points.push(end);

  const simplified = simplifyOrthogonalPoints(points);
  return roundedPathFromPoints(simplified, cornerRadius);
}

export function buildManualEdgePath(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1} ${y1} L ${cx} ${cy} L ${x2} ${y2}`;
}

export function edgeMidPoint(start: LogicalPoint, end: LogicalPoint): LogicalPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

export function getNodeAnchorPoint(
  node: GraphNode,
  side: NodeAnchorSide,
  size?: NodeVisualSize,
): LogicalPoint {
  const width = size?.width ?? NODE_WIDTH;
  const height = size?.height ?? NODE_HEIGHT;

  if (side === "top") {
    return { x: node.position.x + width / 2, y: node.position.y - NODE_ANCHOR_OFFSET };
  }
  if (side === "right") {
    return { x: node.position.x + width + NODE_ANCHOR_OFFSET, y: node.position.y + height / 2 };
  }
  if (side === "bottom") {
    return { x: node.position.x + width / 2, y: node.position.y + height + NODE_ANCHOR_OFFSET };
  }
  return { x: node.position.x - NODE_ANCHOR_OFFSET, y: node.position.y + height / 2 };
}

export function buildSimpleReadonlyTurnEdges(
  graph: GraphData,
  visibleNodeIdSet: Set<string>,
): Array<{ fromId: string; toId: string }> {
  if (visibleNodeIdSet.size === 0) {
    return [];
  }

  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    const children = outgoing.get(edge.from.nodeId) ?? [];
    children.push(edge.to.nodeId);
    outgoing.set(edge.from.nodeId, children);
  }

  const results: Array<{ fromId: string; toId: string }> = [];
  const seen = new Set<string>();

  for (const fromId of visibleNodeIdSet) {
    const queue: string[] = [];
    const initialChildren = outgoing.get(fromId) ?? [];
    for (const childId of initialChildren) {
      if (!visibleNodeIdSet.has(childId)) {
        queue.push(childId);
      }
    }

    const visitedHidden = new Set<string>();
    while (queue.length > 0) {
      const currentId = queue.shift() ?? "";
      if (!currentId || visitedHidden.has(currentId)) {
        continue;
      }
      visitedHidden.add(currentId);

      const children = outgoing.get(currentId) ?? [];
      for (const childId of children) {
        if (!childId || childId === fromId) {
          continue;
        }
        if (visibleNodeIdSet.has(childId)) {
          const key = `${fromId}->${childId}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ fromId, toId: childId });
          }
          continue;
        }
        if (!visitedHidden.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  return results;
}

export function getAutoConnectionSides(
  fromNode: GraphNode,
  toNode: GraphNode,
  fromSize?: NodeVisualSize,
  toSize?: NodeVisualSize,
): {
  fromSide: NodeAnchorSide;
  toSide: NodeAnchorSide;
} {
  const fromWidth = fromSize?.width ?? NODE_WIDTH;
  const fromHeight = fromSize?.height ?? NODE_HEIGHT;
  const toWidth = toSize?.width ?? NODE_WIDTH;
  const toHeight = toSize?.height ?? NODE_HEIGHT;
  const fromRect = {
    left: fromNode.position.x,
    right: fromNode.position.x + fromWidth,
    top: fromNode.position.y,
    bottom: fromNode.position.y + fromHeight,
  };
  const toRect = {
    left: toNode.position.x,
    right: toNode.position.x + toWidth,
    top: toNode.position.y,
    bottom: toNode.position.y + toHeight,
  };
  const overlapX = Math.min(fromRect.right, toRect.right) - Math.max(fromRect.left, toRect.left);
  const overlapY = Math.min(fromRect.bottom, toRect.bottom) - Math.max(fromRect.top, toRect.top);

  const fromCenterX = fromNode.position.x + fromWidth / 2;
  const fromCenterY = fromNode.position.y + fromHeight / 2;
  const toCenterX = toNode.position.x + toWidth / 2;
  const toCenterY = toNode.position.y + toHeight / 2;
  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  if (overlapX > 24) {
    return dy >= 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }
  if (overlapY > 24) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }
  return dy >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

export function alignAutoEdgePoints(
  fromNode: GraphNode,
  toNode: GraphNode,
  fromPoint: LogicalPoint,
  toPoint: LogicalPoint,
  fromSide: NodeAnchorSide,
  toSide: NodeAnchorSide,
  fromSize: NodeVisualSize,
  toSize: NodeVisualSize,
): { fromPoint: LogicalPoint; toPoint: LogicalPoint } {
  const fromHorizontal = fromSide === "left" || fromSide === "right";
  const toHorizontal = toSide === "left" || toSide === "right";
  const fromVertical = !fromHorizontal;
  const toVertical = !toHorizontal;

  if (fromHorizontal && toHorizontal) {
    const deltaY = Math.abs(fromPoint.y - toPoint.y);
    if (deltaY <= AUTO_EDGE_STRAIGHTEN_THRESHOLD) {
      const fromCenterY = fromNode.position.y + fromSize.height / 2;
      const toCenterY = toNode.position.y + toSize.height / 2;
      const laneY = Math.round((fromCenterY + toCenterY) / 2);
      return {
        fromPoint: { ...fromPoint, y: laneY },
        toPoint: { ...toPoint, y: laneY },
      };
    }
  }

  if (fromVertical && toVertical) {
    const deltaX = Math.abs(fromPoint.x - toPoint.x);
    if (deltaX <= AUTO_EDGE_STRAIGHTEN_THRESHOLD) {
      const fromCenterX = fromNode.position.x + fromSize.width / 2;
      const toCenterX = toNode.position.x + toSize.width / 2;
      const laneX = Math.round((fromCenterX + toCenterX) / 2);
      return {
        fromPoint: { ...fromPoint, x: laneX },
        toPoint: { ...toPoint, x: laneX },
      };
    }
  }

  return { fromPoint, toPoint };
}

export function snapToLayoutGrid(value: number, axis: "x" | "y", thresholdPx?: number): number {
  const start = axis === "x" ? AUTO_LAYOUT_START_X : AUTO_LAYOUT_START_Y;
  const gap = axis === "x" ? AUTO_LAYOUT_COLUMN_GAP : AUTO_LAYOUT_ROW_GAP;
  const normalized = (value - start) / gap;
  const snapped = Math.round(normalized) * gap + start;
  if (thresholdPx == null) {
    return snapped;
  }
  return Math.abs(value - snapped) <= thresholdPx ? snapped : value;
}

export function snapToNearbyNodeAxis(
  value: number,
  axis: "x" | "y",
  candidates: GraphNode[],
  thresholdPx: number,
): number {
  if (candidates.length === 0 || thresholdPx <= 0) {
    return value;
  }
  let nearest = value;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const node of candidates) {
    const candidateValue = axis === "x" ? node.position.x : node.position.y;
    const distance = Math.abs(value - candidateValue);
    if (distance < nearestDistance) {
      nearest = candidateValue;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= thresholdPx ? nearest : value;
}
