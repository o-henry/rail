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

  return (
    <aside className="inspector-pane">
      <div className="inspector-head">
        <div className="inspector-title-chip">{nodeProps.nodeSettingsTitle}</div>
      </div>
      <div className="inspector-content">
        <div className="inspector-section">
          <WorkflowInspectorTools {...toolsProps} />
          <WorkflowNodeInspector {...nodeProps} />
        </div>
      </div>
    </aside>
  );
}

