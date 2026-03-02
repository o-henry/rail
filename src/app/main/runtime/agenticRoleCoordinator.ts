import {
  createAgenticRunEnvelope,
  createAgenticRunId,
  patchRunStage,
  patchRunStatus,
  queueKeyForRole,
  type AgenticRunEnvelope,
  type AgenticRunEvent,
  type AgenticRunSourceTab,
} from "../../../features/orchestration/agentic/runContract";
import { persistAgenticRunEnvelope, persistAgenticRunEvents } from "./agenticRunStore";
import type { AgenticQueue } from "./agenticQueue";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type MutableRunContext = {
  envelope: AgenticRunEnvelope;
  events: AgenticRunEvent[];
};

export type AgenticRunRoleInput = {
  cwd: string;
  sourceTab: AgenticRunSourceTab;
  roleId: string;
  taskId: string;
  prompt?: string;
  queue: AgenticQueue;
  invokeFn: InvokeFn;
  execute: (params: { runId: string; roleId: string; taskId: string; prompt?: string }) => Promise<void>;
  appendWorkspaceEvent?: (params: {
    source: string;
    message: string;
    actor?: "user" | "ai" | "system";
    level?: "info" | "error";
    runId?: string;
  }) => void;
  onEvent?: (event: AgenticRunEvent, envelope: AgenticRunEnvelope) => void;
};

export type AgenticCoordinatorRunResult = {
  runId: string;
  envelope: AgenticRunEnvelope;
  events: AgenticRunEvent[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeError(error: unknown): string {
  const text = String(error ?? "").trim();
  return text || "unknown error";
}

async function persistRunContext(params: { cwd: string; invokeFn: InvokeFn; context: MutableRunContext }) {
  await Promise.all([
    persistAgenticRunEnvelope({
      cwd: params.cwd,
      invokeFn: params.invokeFn,
      envelope: params.context.envelope,
    }),
    persistAgenticRunEvents({
      cwd: params.cwd,
      invokeFn: params.invokeFn,
      runId: params.context.envelope.record.runId,
      runKind: params.context.envelope.record.runKind,
      events: params.context.events,
    }),
  ]);
}

function emitRunEvent(params: {
  context: MutableRunContext;
  type: AgenticRunEvent["type"];
  message?: string;
  stage?: "crawler" | "rag" | "codex" | "critic" | "save" | "approval";
  payload?: Record<string, unknown>;
  onEvent?: (event: AgenticRunEvent, envelope: AgenticRunEnvelope) => void;
}) {
  const event: AgenticRunEvent = {
    at: nowIso(),
    runId: params.context.envelope.record.runId,
    queueKey: params.context.envelope.record.queueKey,
    sourceTab: params.context.envelope.record.sourceTab,
    topic: params.context.envelope.record.topic,
    setId: params.context.envelope.record.setId,
    type: params.type,
    stage: params.stage,
    message: params.message,
    payload: params.payload,
  };
  params.context.events.push(event);
  params.onEvent?.(event, params.context.envelope);
}

function emitWorkspace(params: {
  appendWorkspaceEvent?: AgenticRunRoleInput["appendWorkspaceEvent"];
  source: string;
  message: string;
  runId: string;
  level?: "info" | "error";
}) {
  params.appendWorkspaceEvent?.({
    source: params.source,
    message: params.message,
    actor: "ai",
    level: params.level ?? "info",
    runId: params.runId,
  });
}

export async function runRoleWithCoordinator(input: AgenticRunRoleInput): Promise<AgenticCoordinatorRunResult> {
  const runId = createAgenticRunId("role");
  const queueKey = queueKeyForRole(input.roleId);
  const context: MutableRunContext = {
    envelope: createAgenticRunEnvelope({
      runId,
      runKind: "studio_role",
      sourceTab: input.sourceTab,
      queueKey,
      roleId: input.roleId,
      taskId: input.taskId,
      approvalState: "pending",
    }),
    events: [],
  };

  emitRunEvent({ context, type: "run_queued", message: "queued", onEvent: input.onEvent });
  emitWorkspace({
    appendWorkspaceEvent: input.appendWorkspaceEvent,
    source: "agentic",
    message: `역할 실행 대기열 등록: ${input.roleId} (${input.taskId})`,
    runId,
  });
  await persistRunContext({ cwd: input.cwd, invokeFn: input.invokeFn, context });

  return input.queue.enqueue(queueKey, async () => {
    context.envelope = patchRunStatus(context.envelope, "running");
    context.envelope = patchRunStage(context.envelope, "codex", "running", "역할 실행 시작");
    emitRunEvent({ context, type: "run_started", message: "started", onEvent: input.onEvent });
    emitRunEvent({ context, type: "stage_started", stage: "codex", message: "역할 실행 시작", onEvent: input.onEvent });

    try {
      await input.execute({
        runId,
        roleId: input.roleId,
        taskId: input.taskId,
        prompt: input.prompt,
      });
      context.envelope = patchRunStage(context.envelope, "codex", "done", "역할 실행 완료");
      context.envelope = patchRunStage(context.envelope, "save", "done", "저장 완료");
      context.envelope = patchRunStatus(context.envelope, "done");
      context.envelope.record.approvalState = "pending";
      emitRunEvent({ context, type: "stage_done", stage: "codex", message: "역할 실행 완료", onEvent: input.onEvent });
      emitRunEvent({ context, type: "run_done", message: "done", onEvent: input.onEvent });
      emitWorkspace({
        appendWorkspaceEvent: input.appendWorkspaceEvent,
        source: "agentic",
        message: `[${runId}] 역할 실행 완료: ${input.roleId}/${input.taskId}`,
        runId,
      });
    } catch (error) {
      const errorText = normalizeError(error);
      context.envelope = patchRunStage(context.envelope, "codex", "error", errorText, errorText);
      context.envelope = patchRunStatus(context.envelope, "error");
      emitRunEvent({
        context,
        type: "stage_error",
        stage: "codex",
        message: errorText,
        payload: { error: errorText },
        onEvent: input.onEvent,
      });
      emitRunEvent({
        context,
        type: "run_error",
        message: errorText,
        payload: { error: errorText },
        onEvent: input.onEvent,
      });
      emitWorkspace({
        appendWorkspaceEvent: input.appendWorkspaceEvent,
        source: "agentic",
        message: `[${runId}] 역할 실행 실패: ${errorText}`,
        runId,
        level: "error",
      });
    }

    await persistRunContext({ cwd: input.cwd, invokeFn: input.invokeFn, context });
    return {
      runId,
      envelope: context.envelope,
      events: [...context.events],
    };
  });
}

