import type { FeedViewPost } from "./types";
import type { GraphNode } from "../../features/workflow/types";
import type { WorkflowInspectorNodeProps, WorkflowInspectorToolsProps } from "./workflowInspectorTypes";

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
