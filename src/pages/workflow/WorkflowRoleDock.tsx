import type { HandoffRecord, StudioRoleId } from "../../features/studio/handoffTypes";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";

type RoleDockStatus = "IDLE" | "RUNNING" | "VERIFY" | "DONE";

type WorkflowRoleDockProps = {
  roleId: StudioRoleId;
  onSelectRoleId: (roleId: StudioRoleId) => void;
  onOpenWorkbench: () => void;
  roleSelectionLockedTo?: StudioRoleId | null;
  taskId: string;
  onChangeTaskId: (value: string) => void;
  prompt: string;
  onChangePrompt: (value: string) => void;
  onRunRole: () => void;
  runDisabled: boolean;
  roleStatusById: Partial<Record<StudioRoleId, { status: RoleDockStatus; taskId?: string }>>;
  selectedRoleHandoffs: HandoffRecord[];
  selectedRoleBlockers: HandoffRecord[];
  onClearRecentHandoffs: () => void;
  onOpenKnowledge: () => void;
};

export default function WorkflowRoleDock(props: WorkflowRoleDockProps) {
  const selectedRole = STUDIO_ROLE_TEMPLATES.find((role) => role.id === props.roleId);
  const lockedRoleId = props.roleSelectionLockedTo ?? null;

  return (
    <aside className="panel-card workflow-role-dock" aria-label="작업 보드 안내">
      <header className="workflow-role-dock-head">
        <strong>작업 시작은 작업 보드에서</strong>
        <span>그래프 탭은 캔버스 편집과 실행 확인에 집중합니다.</span>
      </header>

      <section className="workflow-role-cards" aria-label="역할 참고 카드">
        {STUDIO_ROLE_TEMPLATES.map((role) => {
          const selected = role.id === props.roleId;
          const lockedOut = Boolean(lockedRoleId) && role.id !== lockedRoleId;
          const roleState = props.roleStatusById[role.id]?.status ?? "IDLE";
          return (
            <button
              key={role.id}
              className={`workflow-role-card${selected ? " is-selected" : ""}${lockedOut ? " is-locked-out" : ""}`}
              disabled={lockedOut}
              onClick={() => props.onSelectRoleId(role.id)}
              type="button"
            >
              <strong>{role.label}</strong>
              <span>{role.goal}</span>
              <div className="workflow-role-card-meta">
                <span className={`workflow-role-status-chip is-${roleState.toLowerCase()}`}>{roleState}</span>
              </div>
            </button>
          );
        })}
      </section>

      <section className="workflow-role-summary">
        <strong>현재 선택 역할</strong>
        <p className="workflow-role-summary-path">{selectedRole?.label ?? props.roleId}</p>
        <p className="workflow-role-summary-empty">새 역할 실행과 일반 작업 카드는 좌측 `작업 보드` 탭에서 시작하세요.</p>
        <button className="mini-action-button workflow-role-run-button" onClick={props.onOpenWorkbench} type="button">
          <span className="mini-action-button-label">작업 보드 열기</span>
        </button>
      </section>

      <section className="workflow-role-summary">
        <div className="workflow-role-summary-head">
          <strong>최근 인수인계</strong>
          <button className="mini-action-button workflow-role-summary-clear" onClick={props.onClearRecentHandoffs} type="button">
            <span className="mini-action-button-label">정리</span>
          </button>
        </div>
        {props.selectedRoleHandoffs.length === 0 ? (
          <p className="workflow-role-summary-empty">최근 인수인계 없음</p>
        ) : (
          <ul className="workflow-role-summary-list">
            {props.selectedRoleHandoffs.map((row) => (
              <li key={row.id}>
                <span>{row.taskId}</span>
                <code>{row.status.toUpperCase()}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="workflow-role-summary">
        <div className="workflow-role-summary-head">
          <strong>최근 산출물</strong>
          <button className="mini-action-button workflow-role-summary-open" onClick={props.onOpenKnowledge} type="button">
            <span className="mini-action-button-label">데이터베이스 열기</span>
          </button>
        </div>
        {props.selectedRoleBlockers.length === 0 ? (
          <p className="workflow-role-summary-empty">차단 이슈 없음</p>
        ) : (
          <ul className="workflow-role-summary-list">
            {props.selectedRoleBlockers.map((row) => (
              <li key={row.id}>
                <span>{row.taskId}</span>
                <code>{String(row.rejectReason ?? "REJECTED").trim() || "REJECTED"}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
