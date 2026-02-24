import type { GraphData, GraphNode } from "../types";
import {
  AUTO_LAYOUT_COLUMN_GAP,
  AUTO_LAYOUT_ROW_GAP,
  AUTO_LAYOUT_START_X,
  AUTO_LAYOUT_START_Y,
} from "./shared";

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

