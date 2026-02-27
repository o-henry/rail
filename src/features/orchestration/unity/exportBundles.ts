import type { PatchBundle, UnityTaskBundle } from "../types";

type BuildUnityTaskBundleParams = {
  runId: string;
  tasks: Array<{
    id: string;
    title: string;
    instructions: string;
    targetPath?: string;
    risk?: "low" | "medium" | "high";
  }>;
  now?: string;
};

type BuildPatchBundleParams = {
  runId: string;
  files: Array<{ path: string; diff: string }>;
  now?: string;
};

export function buildUnityTaskBundle(params: BuildUnityTaskBundleParams): UnityTaskBundle {
  const createdAt = params.now ?? new Date().toISOString();
  return {
    bundleId: `unity-task-${params.runId}`,
    createdAt,
    tasks: params.tasks.map((task, index) => ({
      id: task.id,
      title: task.title,
      targetPath: task.targetPath,
      risk: task.risk ?? "medium",
      order: index + 1,
      instructions: task.instructions,
    })),
  };
}

export function buildPatchBundle(params: BuildPatchBundleParams): PatchBundle {
  const createdAt = params.now ?? new Date().toISOString();
  return {
    bundleId: `patch-${params.runId}`,
    createdAt,
    files: params.files.map((file) => ({
      path: file.path,
      diff: file.diff,
    })),
  };
}
