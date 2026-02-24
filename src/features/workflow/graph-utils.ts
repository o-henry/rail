import {
  DEFAULT_TURN_MODEL,
  getTurnExecutor,
  toTurnModelDisplayName,
  turnExecutorLabel,
  type TurnConfig,
} from "./domain";
import type {
  GateConfig,
  GraphData,
  GraphEdge,
  GraphNode,
  NodeAnchorSide,
  NodeType,
  TransformConfig,
} from "./types";

export type LogicalPoint = {
  x: number;
  y: number;
};

export type NodeVisualSize = {
  width: number;
  height: number;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 136;
const NODE_ANCHOR_OFFSET = 15;
const QUALITY_DEFAULT_THRESHOLD = 70;
const SIMPLE_WORKFLOW_UI = true;
const AUTO_LAYOUT_START_X = 40;
const AUTO_LAYOUT_START_Y = 40;
const AUTO_LAYOUT_COLUMN_GAP = 320;
const AUTO_LAYOUT_ROW_GAP = 184;
const AUTO_EDGE_STRAIGHTEN_THRESHOLD = 72;

export function cloneGraph(input: GraphData): GraphData {
  return {
    ...input,
    nodes: input.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      config: JSON.parse(JSON.stringify(node.config ?? {})),
    })),
    edges: input.edges.map((edge) => ({
      from: { ...edge.from },
      to: { ...edge.to },
      control: edge.control ? { ...edge.control } : undefined,
    })),
    knowledge: {
      ...input.knowledge,
      files: input.knowledge.files.map((file) => ({ ...file })),
    },
  };
}

export function graphEquals(a: GraphData, b: GraphData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildRoundedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  withArrow = true,
  fromSide: NodeAnchorSide,
  toSide: NodeAnchorSide,
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

  const start = { x: x1, y: y1 };
  const end = { x: x2, y: y2 };
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
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: startStub.y }, { x: midX, y: endStub.y });
  } else if (!fromHorizontal && !toHorizontal) {
    const midY = (start.y + end.y) / 2;
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
  return roundedPathFromPoints(simplified, 8);
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

export function getGraphEdgeKey(edge: GraphEdge): string {
  return `${edge.from.nodeId}:${edge.from.port}->${edge.to.nodeId}:${edge.to.port}`;
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

export function autoArrangeGraphLayout(input: GraphData): GraphData {
  if (input.nodes.length <= 1) {
    return input;
  }

  const nodeIds = input.nodes.map((node) => node.id);
  const nodeIdSet = new Set(nodeIds);
  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const depth = new Map<string, number>();

  for (const id of nodeIds) {
    incomingCount.set(id, 0);
    outgoing.set(id, []);
    depth.set(id, 0);
  }

  for (const edge of input.edges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) {
      continue;
    }
    outgoing.get(fromId)?.push(toId);
    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1);
  }

  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const));
  const roots = nodeIds
    .filter((id) => (incomingCount.get(id) ?? 0) === 0)
    .sort((a, b) => {
      const nodeA = nodeById.get(a);
      const nodeB = nodeById.get(b);
      const dy = (nodeA?.position.y ?? 0) - (nodeB?.position.y ?? 0);
      if (dy !== 0) {
        return dy;
      }
      const dx = (nodeA?.position.x ?? 0) - (nodeB?.position.x ?? 0);
      if (dx !== 0) {
        return dx;
      }
      return a.localeCompare(b);
    });

  const queue = [...roots];
  let cursor = 0;
  while (cursor < queue.length) {
    const currentId = queue[cursor];
    cursor += 1;
    const currentDepth = depth.get(currentId) ?? 0;
    const children = outgoing.get(currentId) ?? [];
    for (const childId of children) {
      const nextDepth = Math.max(depth.get(childId) ?? 0, currentDepth + 1);
      depth.set(childId, nextDepth);
      const nextIncoming = (incomingCount.get(childId) ?? 0) - 1;
      incomingCount.set(childId, nextIncoming);
      if (nextIncoming === 0) {
        queue.push(childId);
      }
    }
  }

  for (const id of nodeIds) {
    if ((incomingCount.get(id) ?? 0) > 0) {
      const parentDepths = input.edges
        .filter((edge) => edge.to.nodeId === id && nodeIdSet.has(edge.from.nodeId))
        .map((edge) => depth.get(edge.from.nodeId) ?? 0);
      const inferredDepth = parentDepths.length > 0 ? Math.max(...parentDepths) + 1 : 0;
      depth.set(id, Math.max(depth.get(id) ?? 0, inferredDepth));
    }
  }

  const columns = new Map<number, GraphNode[]>();
  for (const node of input.nodes) {
    const col = depth.get(node.id) ?? 0;
    const bucket = columns.get(col) ?? [];
    bucket.push(node);
    columns.set(col, bucket);
  }

  for (const [, nodes] of columns) {
    nodes.sort((a, b) => {
      const dy = a.position.y - b.position.y;
      if (dy !== 0) {
        return dy;
      }
      const dx = a.position.x - b.position.x;
      if (dx !== 0) {
        return dx;
      }
      return a.id.localeCompare(b.id);
    });
  }

  const nextNodes = input.nodes.map((node) => {
    const col = depth.get(node.id) ?? 0;
    const rows = columns.get(col) ?? [];
    const row = Math.max(0, rows.findIndex((item) => item.id === node.id));
    return {
      ...node,
      position: {
        x: AUTO_LAYOUT_START_X + col * AUTO_LAYOUT_COLUMN_GAP,
        y: AUTO_LAYOUT_START_Y + row * AUTO_LAYOUT_ROW_GAP,
      },
    };
  });

  const hasChanged = nextNodes.some((node, index) => {
    const before = input.nodes[index];
    return before.position.x !== node.position.x || before.position.y !== node.position.y;
  });
  if (!hasChanged) {
    return input;
  }
  return {
    ...input,
    nodes: nextNodes,
  };
}

export function makeNodeId(type: NodeType): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}-${suffix}`;
}

export function defaultNodeConfig(type: NodeType): Record<string, unknown> {
  if (type === "turn") {
    return {
      executor: "codex",
      model: DEFAULT_TURN_MODEL,
      role: "",
      cwd: ".",
      promptTemplate: "{{input}}",
      outputSchemaJson: "",
      knowledgeEnabled: true,
      qualityThreshold: QUALITY_DEFAULT_THRESHOLD,
      artifactType: "none",
      qualityCommandEnabled: false,
      qualityCommands: "npm run build",
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
    decisionPath: "DECISION",
    passNodeId: "",
    rejectNodeId: "",
    schemaJson: "",
  };
}

export function nodeCardSummary(node: GraphNode): string {
  if (node.type === "turn") {
    return "";
  }
  if (SIMPLE_WORKFLOW_UI) {
    return "";
  }
  if (node.type === "transform") {
    const config = node.config as TransformConfig;
    const mode = String(config.mode ?? "pick");
    if (mode === "merge") {
      return "정리 방식: 고정 정보 덧붙이기";
    }
    if (mode === "template") {
      return "정리 방식: 문장 틀로 다시 쓰기";
    }
    return "정리 방식: 필요한 값만 꺼내기";
  }
  const config = node.config as GateConfig;
  const path = String(config.decisionPath ?? "DECISION");
  return `판단값 위치: ${path === "decision" ? "DECISION" : path}`;
}

export function turnModelLabel(node: GraphNode): string {
  const config = node.config as TurnConfig;
  const executor = getTurnExecutor(config);
  if (executor === "ollama") {
    return `Ollama · ${String(config.ollamaModel ?? "llama3.1:8b")}`;
  }
  if (executor !== "codex") {
    return turnExecutorLabel(executor);
  }
  return toTurnModelDisplayName(String(config.model ?? DEFAULT_TURN_MODEL));
}
