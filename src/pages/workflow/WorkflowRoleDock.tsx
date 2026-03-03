import type { StudioRoleId } from "../../features/studio/handoffTypes";
import type { SelectOption } from "../../app/main/workflowInspectorTypes";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";
import FancySelect from "../../components/FancySelect";

type WorkflowRoleDockProps = {
  roleId: StudioRoleId;
  onSelectRoleId: (roleId: StudioRoleId) => void;
  taskId: string;
  onChangeTaskId: (value: string) => void;
  prompt: string;
  onChangePrompt: (value: string) => void;
  onRunRole: () => void;
  runDisabled: boolean;
  handoffRoleOptions: SelectOption[];
  handoffFromRole: StudioRoleId;
  handoffToRole: StudioRoleId;
  onSelectHandoffFromRole: (value: StudioRoleId) => void;
  onSelectHandoffToRole: (value: StudioRoleId) => void;
  onAddHandoffNodes: (fromRole: StudioRoleId, toRole: StudioRoleId) => void;
};

export default function WorkflowRoleDock(props: WorkflowRoleDockProps) {
  return (
    <aside className="panel-card workflow-role-dock" aria-label="역할 워크스페이스">
      <header className="workflow-role-dock-head">
        <strong>역할 워크스페이스</strong>
        <span>그래프 + 에이전트 결합</span>
      </header>

      <section className="workflow-role-cards" aria-label="역할 카드">
        {STUDIO_ROLE_TEMPLATES.map((role) => {
          const selected = role.id === props.roleId;
          return (
            <button
              key={role.id}
              className={`workflow-role-card${selected ? " is-selected" : ""}`}
              onClick={() => props.onSelectRoleId(role.id)}
              type="button"
            >
              <strong>{role.label}</strong>
              <span>{role.goal}</span>
            </button>
          );
        })}
      </section>

      <section className="workflow-role-form">
        <label>
          TASK ID
          <input
            className="workflow-handoff-task-input"
            onChange={(event) => props.onChangeTaskId(event.currentTarget.value)}
            placeholder="TASK-001"
            value={props.taskId}
          />
        </label>
        <label>
          요청사항
          <textarea
            className="workflow-handoff-request-input"
            onChange={(event) => props.onChangePrompt(event.currentTarget.value)}
            placeholder="현재 역할에서 바로 처리할 요청을 입력하세요."
            value={props.prompt}
          />
        </label>
        <button
          className="mini-action-button workflow-role-run-button"
          disabled={props.runDisabled}
          onClick={props.onRunRole}
          type="button"
        >
          <span className="mini-action-button-label">역할 실행</span>
        </button>
      </section>

      <section className="workflow-role-handoff">
        <strong>핸드오프 노드 추가</strong>
        <div className="workflow-handoff-create-row">
          <FancySelect
            ariaLabel="핸드오프 보내는 역할"
            className="modern-select workflow-handoff-select"
            onChange={(next) => props.onSelectHandoffFromRole(next as StudioRoleId)}
            options={props.handoffRoleOptions}
            value={props.handoffFromRole}
          />
          <FancySelect
            ariaLabel="핸드오프 받는 역할"
            className="modern-select workflow-handoff-select"
            onChange={(next) => props.onSelectHandoffToRole(next as StudioRoleId)}
            options={props.handoffRoleOptions}
            value={props.handoffToRole}
          />
        </div>
        <button
          className="mini-action-button workflow-handoff-create-button"
          onClick={() => props.onAddHandoffNodes(props.handoffFromRole, props.handoffToRole)}
          type="button"
        >
          <span className="mini-action-button-label">핸드오프 노드 추가</span>
        </button>
      </section>
    </aside>
  );
}

