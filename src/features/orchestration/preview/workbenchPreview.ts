import type { WorkbenchPreview, WorkbenchTimelineEvent } from "../types";

type BuildWorkbenchPreviewParams = {
  decomposeEvents?: WorkbenchTimelineEvent[];
  approvalEvents?: WorkbenchTimelineEvent[];
  executionEvents?: WorkbenchTimelineEvent[];
  collaborationEvents?: WorkbenchTimelineEvent[];
  memoryCatalog?: Array<{
    id: string;
    taskId: string;
    score: number;
    summary: string;
  }>;
  topNRecall?: number;
};

export function buildWorkbenchPreview(params: BuildWorkbenchPreviewParams): WorkbenchPreview {
  const timeline = [
    ...(params.decomposeEvents ?? []),
    ...(params.approvalEvents ?? []),
    ...(params.executionEvents ?? []),
    ...(params.collaborationEvents ?? []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const collaborationInbound = (params.collaborationEvents ?? []).filter((event) =>
    event.summary.toLowerCase().includes("inbound"),
  );
  const collaborationOutbound = (params.collaborationEvents ?? []).filter((event) =>
    event.summary.toLowerCase().includes("outbound"),
  );

  const topN = Math.max(1, params.topNRecall ?? 3);
  const recallByTask: WorkbenchPreview["recallByTask"] = {};
  for (const entry of params.memoryCatalog ?? []) {
    const taskId = String(entry.taskId || "");
    if (!taskId) {
      continue;
    }
    if (!recallByTask[taskId]) {
      recallByTask[taskId] = [];
    }
    recallByTask[taskId].push({
      memoryId: entry.id,
      score: entry.score,
      summary: entry.summary,
    });
  }

  for (const taskId of Object.keys(recallByTask)) {
    recallByTask[taskId] = recallByTask[taskId]
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  return {
    timeline,
    collaborationInbound,
    collaborationOutbound,
    recallByTask,
  };
}
