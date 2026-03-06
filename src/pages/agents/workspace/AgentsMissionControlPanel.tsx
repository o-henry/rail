import MissionControlPanel from "../../../components/MissionControlPanel";
import type { MissionControlState } from "../../../features/orchestration/agentic/missionControl";
import type { CompanionEventType } from "../../../features/orchestration/types";

type AgentsMissionControlPanelProps = {
  mission: MissionControlState | null;
  onClearMission: () => void;
  onExecuteTaskCommand: (command: string) => void;
  onRecordCompanionEvent: (type: Exclude<CompanionEventType, "unity_verification_completed">, message?: string) => void;
  onRecordUnityVerification: (success: boolean, message: string) => void;
};

export function AgentsMissionControlPanel(props: AgentsMissionControlPanelProps) {
  return (
    <MissionControlPanel
      emptyCopy="메시지를 전송하면 Planner, Implementer, Reviewer가 연결된 작업 관제 세션이 시작됩니다."
      mission={props.mission}
      onClearMission={props.onClearMission}
      onExecuteTaskCommand={props.onExecuteTaskCommand}
      onRecordCompanionEvent={props.onRecordCompanionEvent}
      onRecordUnityVerification={props.onRecordUnityVerification}
    />
  );
}
