import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { GraphNode } from "../../features/workflow/types";
import type { FeedViewPost, RunRecord } from "../main/types";

type UseFeedInspectorEffectsParams = {
  groupedFeedRuns: Array<{ runId: string }>;
  setFeedGroupExpandedByRunId: Dispatch<SetStateAction<Record<string, boolean>>>;
  setFeedGroupRenameRunId: Dispatch<SetStateAction<string | null>>;
  workspaceTab: string;
  currentFeedPosts: FeedViewPost[];
  setFeedInspectorPostId: Dispatch<SetStateAction<string>>;
  feedInspectorPost: FeedViewPost | null;
  feedInspectorGraphNode: GraphNode | null;
  feedInspectorPostSourceFile: string;
  feedInspectorPostNodeId: string;
  feedInspectorPostKey: string;
  ensureFeedRunRecord: (file: string) => Promise<RunRecord | null | undefined>;
  setFeedInspectorSnapshotNode: Dispatch<SetStateAction<GraphNode | null>>;
  feedInspectorRuleCwd: string;
  setFeedInspectorRuleDocs: Dispatch<SetStateAction<Array<{ path: string; content: string }>>>;
  setFeedInspectorRuleLoading: Dispatch<SetStateAction<boolean>>;
  loadAgentRuleDocsForCwd: (nodeCwd: string) => Promise<Array<{ path: string; content: string }>>;
};

export function useFeedInspectorEffects({
  groupedFeedRuns,
  setFeedGroupExpandedByRunId,
  setFeedGroupRenameRunId,
  workspaceTab,
  currentFeedPosts,
  setFeedInspectorPostId,
  feedInspectorPost,
  feedInspectorGraphNode,
  feedInspectorPostSourceFile,
  feedInspectorPostNodeId,
  feedInspectorPostKey,
  ensureFeedRunRecord,
  setFeedInspectorSnapshotNode,
  feedInspectorRuleCwd,
  setFeedInspectorRuleDocs,
  setFeedInspectorRuleLoading,
  loadAgentRuleDocsForCwd,
}: UseFeedInspectorEffectsParams) {
  const groupedFeedRunIdsKey = groupedFeedRuns.map((group) => group.runId).join("|");

  useEffect(() => {
    setFeedGroupExpandedByRunId((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const runId of groupedFeedRuns.map((group) => group.runId)) {
        if (Object.prototype.hasOwnProperty.call(prev, runId)) {
          next[runId] = prev[runId];
        } else {
          next[runId] = true;
          changed = true;
        }
      }
      for (const runId of Object.keys(prev)) {
        if (!Object.prototype.hasOwnProperty.call(next, runId)) {
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
    setFeedGroupRenameRunId((prev) =>
      prev && groupedFeedRuns.some((group) => group.runId === prev) ? prev : null,
    );
  }, [groupedFeedRunIdsKey, groupedFeedRuns, setFeedGroupExpandedByRunId, setFeedGroupRenameRunId]);

  useEffect(() => {
    if (workspaceTab !== "feed") {
      return;
    }
    setFeedInspectorPostId((prev) => {
      if (currentFeedPosts.length === 0) {
        return "";
      }
      if (prev && currentFeedPosts.some((post) => post.id === prev)) {
        return prev;
      }
      return currentFeedPosts[0].id;
    });
  }, [currentFeedPosts, workspaceTab, setFeedInspectorPostId]);

  useEffect(() => {
    let cancelled = false;
    if (!feedInspectorPost) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }
    if (feedInspectorGraphNode) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }
    if (!feedInspectorPostSourceFile) {
      setFeedInspectorSnapshotNode(null);
      return () => {
        cancelled = true;
      };
    }

    const loadSnapshotNode = async () => {
      const run = await ensureFeedRunRecord(feedInspectorPostSourceFile);
      if (cancelled) {
        return;
      }
      const snapshotNode = run?.graphSnapshot.nodes.find((node) => node.id === feedInspectorPostNodeId) ?? null;
      setFeedInspectorSnapshotNode(snapshotNode);
    };
    void loadSnapshotNode();

    return () => {
      cancelled = true;
    };
  }, [
    ensureFeedRunRecord,
    feedInspectorGraphNode,
    feedInspectorPost,
    feedInspectorPostKey,
    feedInspectorPostNodeId,
    feedInspectorPostSourceFile,
    setFeedInspectorSnapshotNode,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (workspaceTab !== "feed" || !feedInspectorRuleCwd) {
      setFeedInspectorRuleDocs([]);
      setFeedInspectorRuleLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setFeedInspectorRuleLoading(true);
    const loadDocs = async () => {
      try {
        const docs = await loadAgentRuleDocsForCwd(feedInspectorRuleCwd);
        if (!cancelled) {
          setFeedInspectorRuleDocs(docs);
        }
      } finally {
        if (!cancelled) {
          setFeedInspectorRuleLoading(false);
        }
      }
    };
    void loadDocs();
    return () => {
      cancelled = true;
    };
  }, [
    feedInspectorPostKey,
    feedInspectorRuleCwd,
    loadAgentRuleDocsForCwd,
    setFeedInspectorRuleDocs,
    setFeedInspectorRuleLoading,
    workspaceTab,
  ]);
}
