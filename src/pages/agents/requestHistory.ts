import type { AgentRequestHistoryItem } from "./agentTypes";

export function prependAgentRequest(
  history: AgentRequestHistoryItem[],
  prompt: string,
  threadId: string,
  threadName: string,
): AgentRequestHistoryItem[] {
  const normalized = String(prompt ?? "").trim();
  if (!normalized) {
    return history;
  }
  return [
    {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      threadId: threadId || "agent",
      threadName: threadName || "agent",
      prompt: normalized,
      createdAt: new Date().toISOString(),
    },
    ...history,
  ].slice(0, 30);
}
