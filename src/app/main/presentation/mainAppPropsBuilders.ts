import type { FeedViewPost } from "../types";
import type { GraphNode } from "../../../features/workflow/types";
import type { AgenticAction } from "../../../features/orchestration/agentic/actionBus";
import type { WorkflowInspectorNodeProps, WorkflowInspectorToolsProps } from "../workflowInspectorTypes";

export function buildWorkflowInspectorPaneProps(params: {
  nodeProps: WorkflowInspectorNodeProps;
  toolsProps: WorkflowInspectorToolsProps;
}) {
  return {
    nodeProps: params.nodeProps,
    toolsProps: params.toolsProps,
  };
}

export function buildFeedPageVm(params: Record<string, any> & {
  graphNodes: GraphNode[];
  setFeedInspectorPostId: (value: string) => void;
  setNodeSelection: (nextIds: string[], primaryId?: string) => void;
}) {
  return {
    ...params,
    onSelectFeedInspectorPost: (post: FeedViewPost) => {
      params.setFeedInspectorPostId(post.id);
      const graphNode = params.graphNodes.find((node: GraphNode) => node.id === post.nodeId);
      if (graphNode) {
        params.setNodeSelection([graphNode.id], graphNode.id);
      }
    },
  };
}

export function buildWorkbenchProps(params: Record<string, any> & {
  createRoleSession: (input: { roleId: string; roleLabel: string; taskId: string; prompt: string }) => {
    implementerRunId: string;
  };
  publishAction: (action: AgenticAction) => void;
  setStatus: (message: string) => void;
}) {
  return {
    sessions: params.sessions,
    selectedSession: params.selectedSession,
    selectedSessionId: params.selectedSessionId,
    launchRoleSession: ({ roleId, roleLabel, taskId, prompt }: {
      roleId: string;
      roleLabel: string;
      taskId: string;
      prompt: string;
    }) => {
      const handle = params.createRoleSession({
        roleId,
        roleLabel,
        taskId,
        prompt,
      });
      params.publishAction({
        type: "run_role",
        payload: {
          roleId,
          taskId,
          prompt,
          runId: handle.implementerRunId,
          sourceTab: "workbench",
        },
      });
      params.setStatus(`워크스페이스 역할 실행 요청: ${roleLabel} (${taskId})`);
    },
    createManualSession: params.createManualSession,
    openSession: params.openSession,
    archiveSession: params.archiveSession,
    addNote: params.attachSessionNote,
    attachArtifactPath: params.attachArtifactPath,
    setManualSessionStatus: params.setManualSessionStatus,
    setSessionReviewState: params.setSessionReviewState,
    recordCompanionEvent: params.recordCompanionEvent,
    recordUnityVerification: params.recordUnityVerification,
    executeSessionCommand: (sessionId: string, command: string) => {
      void params.executeSessionCommand(sessionId, command);
    },
  };
}
