import type { DashboardTopicId, DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
import type { CodexMultiAgentMode } from "./agentPrompt";
import type { AgentSetOptionLike, AgentThreadPreset } from "./agentSetPresets";

export type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
  topicSnapshots: Partial<Record<DashboardTopicId, DashboardTopicSnapshot>>;
  codexMultiAgentMode: CodexMultiAgentMode;
};

export type AgentThread = AgentThreadPreset & {
  status: "preset" | "custom";
};

export type AttachedFile = {
  id: string;
  name: string;
};

export type AgentSetOption = AgentSetOptionLike;

export type AgentSetState = {
  setMission: string;
  threads: AgentThread[];
  activeThreadId: string;
  draft: string;
  attachedFiles: AttachedFile[];
  dashboardInsights: string[];
};

export type AgentSetPresetSnapshot = {
  mission: string;
  defaultDraft: string;
  threads: AgentThread[];
};

export type AgentModelOption = {
  value: string;
  label: string;
  allowsReasonLevel: boolean;
};

export type AgentSetGroup = {
  id: string;
  title: string;
  items: AgentSetOption[];
};
