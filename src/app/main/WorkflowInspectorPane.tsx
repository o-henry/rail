import WorkflowInspectorTools from "./WorkflowInspectorTools";
import WorkflowNodeInspector from "./WorkflowNodeInspector";
import type { WorkflowInspectorNodeProps, WorkflowInspectorToolsProps } from "./workflowInspectorTypes";

type WorkflowInspectorPaneProps = {
  canvasFullscreen: boolean;
  toolsProps: WorkflowInspectorToolsProps;
  nodeProps: WorkflowInspectorNodeProps;
};

export default function WorkflowInspectorPane({ canvasFullscreen, toolsProps, nodeProps }: WorkflowInspectorPaneProps) {
  if (canvasFullscreen) {
    return null;
  }

  const hasSelectedNode = Boolean(nodeProps.selectedNode);

  return (
    <aside className="inspector-pane">
      <div className="inspector-head">
        <div className="inspector-title-chip">{nodeProps.nodeSettingsTitle}</div>
      </div>
      <div className="inspector-content">
        <div className="inspector-section inspector-switcher">
          <div className={`inspector-panel inspector-panel-tools ${hasSelectedNode ? "is-hidden" : "is-visible"}`}>
            <div className="inspector-panel-inner">
              <WorkflowInspectorTools {...toolsProps} />
            </div>
          </div>
          <div className={`inspector-panel inspector-panel-node ${hasSelectedNode ? "is-visible" : "is-hidden"}`}>
            <div className="inspector-panel-inner">
              <WorkflowNodeInspector {...nodeProps} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
