import MissionControlPanel from "../../../components/MissionControlPanel";
import WorkflowInspectorTools from "./WorkflowInspectorTools";
import WorkflowNodeInspector from "./WorkflowNodeInspector";
import type { WorkflowInspectorNodeProps, WorkflowInspectorToolsProps } from "../workflowInspectorTypes";
import type { MissionControlState } from "../../../features/orchestration/agentic/missionControl";
import type { CompanionEventType } from "../../../features/orchestration/types";
import { useI18n } from "../../../i18n";

type WorkflowInspectorPaneProps = {
  canvasFullscreen: boolean;
  toolsProps: WorkflowInspectorToolsProps;
  nodeProps: WorkflowInspectorNodeProps;
  mission: MissionControlState | null;
  onClearMission: () => void;
  onExecuteTaskCommand: (command: string) => void;
  onRecordCompanionEvent: (type: Exclude<CompanionEventType, "unity_verification_completed">, message?: string) => void;
  onRecordUnityVerification: (success: boolean, message: string) => void;
};

export default function WorkflowInspectorPane({
  canvasFullscreen,
  toolsProps,
  nodeProps,
  mission,
  onClearMission,
  onExecuteTaskCommand,
  onRecordCompanionEvent,
  onRecordUnityVerification,
}: WorkflowInspectorPaneProps) {
  const { t } = useI18n();
  if (canvasFullscreen) {
    return null;
  }

  const hasSelectedNode = Boolean(nodeProps.selectedNode);

  return (
    <aside className={`inspector-pane ${hasSelectedNode ? "is-node-selected" : ""}`.trim()}>
      <MissionControlPanel
        emptyCopy="그래프 탭에서 역할 실행을 시작하면 현재 미션이 이 인스펙터에서 바로 이어집니다."
        mission={mission}
        onClearMission={onClearMission}
        onExecuteTaskCommand={onExecuteTaskCommand}
        onRecordCompanionEvent={onRecordCompanionEvent}
        onRecordUnityVerification={onRecordUnityVerification}
      />
      {!hasSelectedNode ? (
        <div className="inspector-head">
          <div className="inspector-head-title">
            <div className="inspector-title-chip">{nodeProps.nodeSettingsTitle}</div>
            <span
              aria-label={`${nodeProps.nodeSettingsTitle} ${t("common.help")}`}
              className="help-tooltip"
              role="note"
              tabIndex={0}
            >
              ?
            </span>
            <div className="help-tooltip-panel inspector-head-tooltip-panel" role="tooltip">
              {t("workflow.nodeSettings.help")}
            </div>
          </div>
        </div>
      ) : null}
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
