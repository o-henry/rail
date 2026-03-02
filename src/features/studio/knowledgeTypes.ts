import type { StudioRoleId, StudioTaskId } from "./handoffTypes";

export type KnowledgeEntry = {
  id: string;
  runId: string;
  taskId: StudioTaskId;
  roleId: StudioRoleId;
  title: string;
  summary: string;
  createdAt: string;
  markdownPath?: string;
  jsonPath?: string;
};

export type KnowledgeSourcePost = {
  id: string;
  runId: string;
  topic?: string | null;
  topicLabel?: string | null;
  summary: string;
  createdAt: string;
  agentName: string;
  attachments: Array<{
    kind: string;
    filePath?: string;
  }>;
};
