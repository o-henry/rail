export type NodeType = "turn" | "transform" | "gate";
export type PortType = "in" | "out";
export type NodeAnchorSide = "top" | "right" | "bottom" | "left";

export type GraphNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

export type GraphEdge = {
  from: { nodeId: string; port: PortType; side?: NodeAnchorSide };
  to: { nodeId: string; port: PortType; side?: NodeAnchorSide };
  control?: { x: number; y: number };
};

export type KnowledgeFileStatus = "ready" | "missing" | "unsupported" | "error";

export type KnowledgeFileRef = {
  id: string;
  name: string;
  path: string;
  ext: string;
  enabled: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  status?: KnowledgeFileStatus;
  statusMessage?: string;
};

export type KnowledgeConfig = {
  files: KnowledgeFileRef[];
  topK: number;
  maxChars: number;
};

export type GraphData = {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  knowledge: KnowledgeConfig;
};

export type TransformMode = "pick" | "merge" | "template";

export type TransformConfig = {
  mode?: TransformMode;
  pickPath?: string;
  mergeJson?: string;
  template?: string;
};

export type GateConfig = {
  decisionPath?: string;
  passNodeId?: string;
  rejectNodeId?: string;
  schemaJson?: string;
};

export type NodeExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting_user"
  | "done"
  | "low_quality"
  | "failed"
  | "skipped"
  | "cancelled";
