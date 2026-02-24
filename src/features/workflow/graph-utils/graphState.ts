import type { GraphData, GraphEdge } from "../types";

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

export function getGraphEdgeKey(edge: GraphEdge): string {
  return `${edge.from.nodeId}:${edge.from.port}->${edge.to.nodeId}:${edge.to.port}`;
}
