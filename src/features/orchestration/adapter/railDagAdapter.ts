import type { RailCompatibleDag, RailCompatibleDagEdge, RailCompatibleDagNode, TaskGraph } from "../types";

type CreateRailCompatibleDagParams = {
  taskGraph: TaskGraph;
  xSpacing?: number;
  ySpacing?: number;
};

function computeDepthMap(taskGraph: TaskGraph) {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const depth = new Map<string, number>();

  for (const node of taskGraph.nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
    depth.set(node.id, 0);
  }

  for (const edge of taskGraph.edges) {
    if (!indegree.has(edge.toId) || !indegree.has(edge.fromId)) {
      continue;
    }
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
    outgoing.get(edge.fromId)?.push(edge.toId);
  }

  const queue: string[] = [];
  for (const [id, count] of indegree.entries()) {
    if (count === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    const currentDepth = depth.get(nodeId) ?? 0;
    for (const childId of outgoing.get(nodeId) ?? []) {
      const nextDepth = Math.max(depth.get(childId) ?? 0, currentDepth + 1);
      depth.set(childId, nextDepth);
      indegree.set(childId, (indegree.get(childId) ?? 0) - 1);
      if ((indegree.get(childId) ?? 0) === 0) {
        queue.push(childId);
      }
    }
  }

  return depth;
}

export function createRailCompatibleDag(params: CreateRailCompatibleDagParams): RailCompatibleDag {
  const xSpacing = Math.max(120, params.xSpacing ?? 340);
  const ySpacing = Math.max(120, params.ySpacing ?? 220);
  const depthByNode = computeDepthMap(params.taskGraph);
  const rowByDepth = new Map<number, number>();

  const nodes: RailCompatibleDagNode[] = params.taskGraph.nodes.map((task) => {
    const depth = depthByNode.get(task.id) ?? 0;
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    return {
      id: task.id,
      role: task.role,
      depth,
      row,
      position: {
        x: depth * xSpacing,
        y: row * ySpacing,
      },
      status: task.status,
    };
  });

  const edges: RailCompatibleDagEdge[] = params.taskGraph.edges.map((edge) => ({
    fromId: edge.fromId,
    toId: edge.toId,
  }));

  return { nodes, edges };
}
