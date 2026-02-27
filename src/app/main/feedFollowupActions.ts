import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { executeTurnNodeWithOutputSchemaRetry } from "./turnExecutionUtils";
import { resolveTurnNodeForFollowup, buildFollowupInputText, buildFollowupDoneRunRecord, buildFollowupFailedRunRecord } from "./feedFollowupUtils";
import type { FeedPost, FeedViewPost, NodeRunState, RunRecord } from "./types";
import type { GraphNode, NodeExecutionStatus } from "../../features/workflow/types";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type FollowupBuildFeedPostResult = {
  post: FeedPost;
  rawAttachments: {
    markdown: string;
    json: string;
  };
};

export async function ensureFeedRunRecordFromCache(params: {
  sourceFile: string;
  feedRunCacheRef: MutableRefObject<Record<string, RunRecord>>;
  invokeFn: InvokeFn;
  normalizeRunRecordFn: (runRecord: RunRecord) => RunRecord;
}): Promise<RunRecord | null> {
  const target = params.sourceFile.trim();
  if (!target) {
    return null;
  }
  const cached = params.feedRunCacheRef.current[target];
  if (cached) {
    return cached;
  }
  try {
    const loaded = await params.invokeFn<RunRecord>("run_load", { name: target });
    const normalized = params.normalizeRunRecordFn(loaded);
    params.feedRunCacheRef.current[target] = normalized;
    return normalized;
  } catch {
    return null;
  }
}

export async function submitFeedAgentRequest(params: {
  post: FeedViewPost;
  graphNodes: GraphNode[];
  isGraphRunning: boolean;
  workflowQuestion: string;
  cwd: string;
  nodeStates: Record<string, NodeRunState>;
  feedReplyDraftByPost: Record<string, string>;
  feedReplySubmittingByPost: Record<string, boolean>;
  feedRunCacheRef: MutableRefObject<Record<string, RunRecord>>;
  feedRawAttachmentRef: MutableRefObject<Record<string, string>>;
  feedReplyFeedbackClearTimerRef: MutableRefObject<Record<string, ReturnType<typeof window.setTimeout>>>;
  setFeedReplySubmittingByPost: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  setFeedReplyFeedbackByPost: Dispatch<SetStateAction<Record<string, string>>>;
  setFeedReplyDraftByPost: Dispatch<SetStateAction<Record<string, string>>>;
  setFeedPosts: (updater: (prev: FeedViewPost[]) => FeedViewPost[]) => void;
  setError: (next: string) => void;
  setStatus: (next: string) => void;
  setNodeStatus: (nodeId: string, statusValue: NodeExecutionStatus, message?: string) => void;
  setNodeRuntimeFields: (nodeId: string, patch: Partial<NodeRunState>) => void;
  addNodeLog: (nodeId: string, message: string) => void;
  enqueueNodeRequest: (nodeId: string, text: string) => void;
  persistRunRecordFile: (name: string, runRecord: RunRecord) => Promise<void>;
  invokeFn: InvokeFn;
  executeTurnNode: (node: GraphNode, input: unknown) => Promise<any>;
  validateSimpleSchemaFn: (schema: unknown, data: unknown, path?: string) => string[];
  turnOutputSchemaEnabled: boolean;
  turnOutputSchemaMaxRetry: number;
  graphSchemaVersion: number;
  defaultKnowledgeConfig: () => any;
  buildFeedPostFn: (params: any) => FollowupBuildFeedPostResult;
  feedAttachmentRawKeyFn: (postId: string, kind: "markdown" | "json") => string;
  exportRunFeedMarkdownFilesFn: (params: {
    runRecord: RunRecord;
    cwd: string;
    invokeFn: InvokeFn;
    feedRawAttachment: Record<string, string>;
    setError: (value: string) => void;
  }) => Promise<void>;
  normalizeRunRecordFn: (runRecord: RunRecord) => RunRecord;
  cancelFeedReplyFeedbackClearTimerFn: (
    postId: string,
    timerRef: MutableRefObject<Record<string, ReturnType<typeof window.setTimeout>>>,
  ) => void;
  scheduleFeedReplyFeedbackAutoClearFn: (params: {
    postId: string;
    timerRef: MutableRefObject<Record<string, ReturnType<typeof window.setTimeout>>>;
    setFeedReplyFeedbackByPost: Dispatch<SetStateAction<Record<string, string>>>;
    delayMs?: number;
  }) => void;
  turnModelLabelFn: (node: GraphNode) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { post } = params;
  const postId = String(post.id ?? "");
  const draft = (params.feedReplyDraftByPost[postId] ?? "").trim();
  if (!draft || !postId || params.feedReplySubmittingByPost[postId]) {
    return;
  }
  params.cancelFeedReplyFeedbackClearTimerFn(postId, params.feedReplyFeedbackClearTimerRef);
  params.setFeedReplySubmittingByPost((prev) => ({ ...prev, [postId]: true }));
  params.setFeedReplyFeedbackByPost((prev) => ({ ...prev, [postId]: params.t("feed.followup.sending") }));
  let replyFeedbackText = "";
  let shouldAutoClearReplyFeedback = false;

  try {
    const resolved = await resolveTurnNodeForFollowup({
      graphNodes: params.graphNodes,
      postNodeId: post.nodeId,
      postSourceFile: post.sourceFile,
      ensureFeedRunRecord: (sourceFile) =>
        ensureFeedRunRecordFromCache({
          sourceFile,
          feedRunCacheRef: params.feedRunCacheRef,
          invokeFn: params.invokeFn,
          normalizeRunRecordFn: params.normalizeRunRecordFn,
        }),
    });
    const node = resolved.node;
    if (!node) {
      params.setError(params.t("feed.followup.error.nodeNotFound"));
      replyFeedbackText = params.t("feed.followup.error.nodeNotFoundShort");
      return;
    }

    if (params.isGraphRunning) {
      if (!resolved.existsInCurrentGraph) {
        params.setError(params.t("feed.followup.error.notInCurrentGraph"));
        replyFeedbackText = params.t("feed.followup.error.notInCurrentGraphShort");
        return;
      }
      params.enqueueNodeRequest(node.id, draft);
      params.setFeedReplyDraftByPost((prev) => ({ ...prev, [postId]: "" }));
      params.setStatus(`${params.turnModelLabelFn(node)} 에이전트 요청을 큐에 추가했습니다.`);
      replyFeedbackText = params.t("feed.followup.queued");
      return;
    }

    params.enqueueNodeRequest(node.id, draft);
    params.setFeedReplyDraftByPost((prev) => ({ ...prev, [postId]: "" }));

    const oneOffRunId = `manual-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const followupInput = buildFollowupInputText({
      draft,
      question: post.question,
      previousSummary: post.summary,
      originalQuestionLabel: params.t("feed.followup.originalQuestion"),
      previousSummaryLabel: params.t("feed.followup.previousSummary"),
      followupLabel: params.t("group.followup"),
    });
    const oneOffRunFileName = `run-${oneOffRunId}.json`;

    params.setNodeStatus(node.id, "running", params.t("feed.followup.run.started"));
    params.setNodeRuntimeFields(node.id, {
      status: "running",
      startedAt,
      finishedAt: undefined,
      durationMs: undefined,
      error: undefined,
    });
    const startedAtMs = Date.now();
    const turnExecution = await executeTurnNodeWithOutputSchemaRetry({
      node,
      input: followupInput,
      executeTurnNode: params.executeTurnNode,
      addNodeLog: params.addNodeLog,
      validateSimpleSchema: params.validateSimpleSchemaFn,
      outputSchemaEnabled: params.turnOutputSchemaEnabled,
      maxRetryDefault: params.turnOutputSchemaMaxRetry,
    });
    const result = turnExecution.result;
    const effectiveOutput = turnExecution.normalizedOutput ?? result.output;
    for (const warning of turnExecution.artifactWarnings) {
      params.addNodeLog(node.id, `[아티팩트] ${warning}`);
    }
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;

    if (!result.ok) {
      params.setNodeStatus(node.id, "failed", result.error ?? params.t("feed.followup.run.failed"));
      params.setNodeRuntimeFields(node.id, {
        status: "failed",
        error: result.error,
        finishedAt,
        durationMs,
        threadId: result.threadId,
        turnId: result.turnId,
        usage: result.usage as any,
      });
      const failed = params.buildFeedPostFn({
        runId: oneOffRunId,
        node,
        isFinalDocument: true,
        status: "failed",
        createdAt: finishedAt,
        summary: result.error ?? params.t("feed.followup.run.failed"),
        logs: params.nodeStates[node.id]?.logs ?? [],
        output: effectiveOutput,
        error: result.error,
        durationMs,
        usage: result.usage,
        inputSources: post.inputSources ?? [],
        inputData: followupInput,
      });
      params.feedRawAttachmentRef.current[params.feedAttachmentRawKeyFn(failed.post.id, "markdown")] =
        failed.rawAttachments.markdown;
      params.feedRawAttachmentRef.current[params.feedAttachmentRawKeyFn(failed.post.id, "json")] =
        failed.rawAttachments.json;
      const failedRunRecord = buildFollowupFailedRunRecord({
        runId: oneOffRunId,
        node,
        question: post.question ?? params.workflowQuestion,
        startedAt,
        finishedAt,
        errorMessage: result.error ?? params.t("feed.followup.run.failed"),
        failedShortMessage: result.error ?? params.t("feed.followup.run.failedShort"),
        nodeLogs: params.nodeStates[node.id]?.logs ?? [],
        threadId: result.threadId,
        turnId: result.turnId,
        executor: result.executor,
        provider: result.provider,
        post: failed.post,
        graphSchemaVersion: params.graphSchemaVersion,
        defaultKnowledgeConfig: params.defaultKnowledgeConfig,
        groupLabel: params.t("group.followup"),
      });
      await params.exportRunFeedMarkdownFilesFn({
        runRecord: failedRunRecord,
        cwd: params.cwd,
        invokeFn: params.invokeFn,
        feedRawAttachment: params.feedRawAttachmentRef.current,
        setError: params.setError,
      });
      await params.persistRunRecordFile(oneOffRunFileName, failedRunRecord);
      params.feedRunCacheRef.current[oneOffRunFileName] = params.normalizeRunRecordFn(failedRunRecord);
      params.setFeedPosts((prev) => [{ ...failed.post, sourceFile: oneOffRunFileName, question: post.question }, ...prev]);
      params.setStatus(params.t("feed.followup.run.failed"));
      replyFeedbackText = params.t("feed.followup.run.failedShort");
      return;
    }

    params.setNodeStatus(node.id, "done", params.t("feed.followup.run.done"));
    params.setNodeRuntimeFields(node.id, {
      status: "done",
      output: effectiveOutput,
      finishedAt,
      durationMs,
      threadId: result.threadId,
      turnId: result.turnId,
      usage: result.usage as any,
    });
    const done = params.buildFeedPostFn({
      runId: oneOffRunId,
      node,
      isFinalDocument: true,
      status: "done",
      createdAt: finishedAt,
      summary: params.t("feed.followup.run.done"),
      logs: params.nodeStates[node.id]?.logs ?? [],
      output: effectiveOutput,
      durationMs,
      usage: result.usage,
      inputSources: post.inputSources ?? [],
      inputData: followupInput,
    });
    params.feedRawAttachmentRef.current[params.feedAttachmentRawKeyFn(done.post.id, "markdown")] = done.rawAttachments.markdown;
    params.feedRawAttachmentRef.current[params.feedAttachmentRawKeyFn(done.post.id, "json")] = done.rawAttachments.json;
    const doneRunRecord = buildFollowupDoneRunRecord({
      runId: oneOffRunId,
      node,
      question: post.question ?? params.workflowQuestion,
      startedAt,
      finishedAt,
      doneMessage: params.t("feed.followup.run.done"),
      nodeLogs: params.nodeStates[node.id]?.logs ?? [],
      threadId: result.threadId,
      turnId: result.turnId,
      executor: result.executor,
      provider: result.provider,
      post: done.post,
      output: effectiveOutput,
      graphSchemaVersion: params.graphSchemaVersion,
      defaultKnowledgeConfig: params.defaultKnowledgeConfig,
      groupLabel: params.t("group.followup"),
    });
    await params.exportRunFeedMarkdownFilesFn({
      runRecord: doneRunRecord,
      cwd: params.cwd,
      invokeFn: params.invokeFn,
      feedRawAttachment: params.feedRawAttachmentRef.current,
      setError: params.setError,
    });
    await params.persistRunRecordFile(oneOffRunFileName, doneRunRecord);
    params.feedRunCacheRef.current[oneOffRunFileName] = params.normalizeRunRecordFn(doneRunRecord);
    params.setFeedPosts((prev) => [{ ...done.post, sourceFile: oneOffRunFileName, question: post.question }, ...prev]);
    params.setStatus(params.t("feed.followup.run.done"));
    replyFeedbackText = params.t("feed.followup.run.doneShort");
    shouldAutoClearReplyFeedback = true;
  } catch (error) {
    params.setError(`${params.t("feed.followup.run.failed")}: ${String(error)}`);
    replyFeedbackText = params.t("feed.followup.run.failedShort");
  } finally {
    params.setFeedReplySubmittingByPost((prev) => {
      if (!(postId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    if (replyFeedbackText) {
      params.setFeedReplyFeedbackByPost((prev) => ({ ...prev, [postId]: replyFeedbackText }));
      if (shouldAutoClearReplyFeedback) {
        params.scheduleFeedReplyFeedbackAutoClearFn({
          postId,
          timerRef: params.feedReplyFeedbackClearTimerRef,
          setFeedReplyFeedbackByPost: params.setFeedReplyFeedbackByPost,
        });
      }
    }
  }
}
