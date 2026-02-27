import type { TaskEdge, TaskGraph, TaskNode } from "../types";

type BuildTaskGraphParams = {
  nodes: Array<Omit<TaskNode, "status"> & { status?: TaskNode["status"] }>;
  coordinatorRole?: string;
};

function dedupeDependsOn(dependsOn: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of dependsOn) {
    const key = String(item).trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function buildTaskGraph(params: BuildTaskGraphParams): TaskGraph {
  const coordinatorRole = String(params.coordinatorRole ?? "coordinator").trim().toLowerCase();
  const rawNodes = params.nodes.map((node) => ({
    ...node,
    id: String(node.id),
    role: String(node.role),
    title: String(node.title),
    dependsOn: dedupeDependsOn(node.dependsOn ?? []),
    status: node.status ?? "blocked",
  }));

  if (rawNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const coordinatorNode = rawNodes.find((node) => node.role.toLowerCase() === coordinatorRole);
  const rootTaskId = coordinatorNode?.id ?? rawNodes[0]?.id;

  const nodes = rawNodes.map((node, index) => {
    if (!rootTaskId) {
      return node;
    }
    if (node.id === rootTaskId) {
      return { ...node, status: "ready" as const };
    }
    if (coordinatorNode) {
      const nextDependsOn = dedupeDependsOn([...node.dependsOn, rootTaskId]);
      return {
        ...node,
        dependsOn: nextDependsOn,
        status: "blocked" as const,
      };
    }
    if (index === 0 && node.dependsOn.length === 0) {
      return { ...node, status: "ready" as const };
    }
    return {
      ...node,
      status: node.dependsOn.length === 0 ? ("ready" as const) : ("blocked" as const),
    };
  });

  const edges: TaskEdge[] = [];
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      edges.push({
        fromId: dependency,
        toId: node.id,
      });
    }
  }

  return {
    rootTaskId,
    nodes,
    edges,
  };
}
