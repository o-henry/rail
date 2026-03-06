import type { KnowledgeEntry } from "../../features/studio/knowledgeTypes";
import { toUpperSnakeToken } from "./knowledgeEntryMapping";

export type KnowledgeGroup = {
  id: string;
  runId: string;
  taskId: string;
  entries: KnowledgeEntry[];
};

export function sortKnowledgeEntries(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function groupKnowledgeEntries(entries: KnowledgeEntry[]): KnowledgeGroup[] {
  const byRun = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const runKey = String(entry.runId ?? "").trim() || "run-unknown";
    const bucket = byRun.get(runKey) ?? [];
    bucket.push(entry);
    byRun.set(runKey, bucket);
  }
  return [...byRun.entries()]
    .map(([runId, rows]) => {
      const taskId =
        rows
          .map((row) => toUpperSnakeToken(String(row.taskId ?? "")))
          .find((value) => value && value !== "TASK_UNKNOWN") ?? "TASK_UNKNOWN";
      return {
        id: `${runId}:${taskId}`,
        runId,
        taskId,
        entries: rows,
      };
    })
    .sort((a, b) => {
      const at = new Date(String(a.entries[0]?.createdAt ?? 0)).getTime();
      const bt = new Date(String(b.entries[0]?.createdAt ?? 0)).getTime();
      return bt - at;
    });
}

export function buildKnowledgeEntryStats(entries: KnowledgeEntry[]): {
  total: number;
  artifact: number;
  web: number;
  ai: number;
} {
  return {
    total: entries.length,
    artifact: entries.filter((row) => row.sourceKind === "artifact").length,
    web: entries.filter((row) => row.sourceKind === "web").length,
    ai: entries.filter((row) => row.sourceKind === "ai").length,
  };
}

export function shouldDeleteKnowledgeRunRecord(sourceFile: string): boolean {
  const normalizedSourceFile = String(sourceFile ?? "").trim();
  if (!normalizedSourceFile) {
    return false;
  }
  const lowered = normalizedSourceFile.toLowerCase();
  return (
    !normalizedSourceFile.includes("/") &&
    !normalizedSourceFile.includes("\\") &&
    lowered.endsWith(".json") &&
    !lowered.startsWith("dashboard-")
  );
}
