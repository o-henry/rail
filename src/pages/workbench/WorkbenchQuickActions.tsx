import { useState } from "react";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";

type WorkbenchQuickActionsProps = {
  onCreateRoleSession: (input: {
    roleId: string;
    roleLabel: string;
    taskId: string;
    prompt: string;
  }) => void;
  onCreateManualSession: (input: {
    title: string;
    taskId: string;
    prompt?: string;
    commands?: string[];
  }) => void;
};

export function WorkbenchQuickActions({
  onCreateRoleSession,
  onCreateManualSession,
}: WorkbenchQuickActionsProps) {
  const [roleId, setRoleId] = useState(STUDIO_ROLE_TEMPLATES[0]?.id ?? "pm_planner");
  const [roleTaskId, setRoleTaskId] = useState(STUDIO_ROLE_TEMPLATES[0]?.defaultTaskId ?? "TASK-001");
  const [rolePrompt, setRolePrompt] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualTaskId, setManualTaskId] = useState("TASK-001");
  const [manualPrompt, setManualPrompt] = useState("");
  const [manualCommands, setManualCommands] = useState("dotnet build, npm run test");

  const selectedRole = STUDIO_ROLE_TEMPLATES.find((role) => role.id === roleId) ?? STUDIO_ROLE_TEMPLATES[0];

  return (
    <section className="panel-card workbench-quick-actions">
      <header className="workbench-panel-head">
        <div>
          <strong>세션 시작 패드</strong>
          <p>새 역할 실행 세션과 일반 작업 카드를 여기서 생성합니다.</p>
        </div>
      </header>

      <section className="workbench-quick-section">
        <strong>역할 실행 시작</strong>
        <select
          className="workflow-handoff-task-input"
          onChange={(event) => {
            const nextRole = STUDIO_ROLE_TEMPLATES.find((role) => role.id === event.target.value) ?? STUDIO_ROLE_TEMPLATES[0];
            setRoleId(nextRole.id);
            setRoleTaskId(nextRole.defaultTaskId);
          }}
          value={roleId}
        >
          {STUDIO_ROLE_TEMPLATES.map((role) => (
            <option key={role.id} value={role.id}>{role.label}</option>
          ))}
        </select>
        <input className="workflow-handoff-task-input" onChange={(event) => setRoleTaskId(event.target.value)} value={roleTaskId} />
        <textarea
          className="workflow-handoff-request-input"
          onChange={(event) => setRolePrompt(event.target.value)}
          placeholder="이번 역할이 처리할 요청을 적으세요."
          value={rolePrompt}
        />
        <button
          className="mini-action-button"
          onClick={() => onCreateRoleSession({
            roleId,
            roleLabel: selectedRole?.label ?? roleId,
            taskId: roleTaskId.trim() || selectedRole?.defaultTaskId || "TASK-001",
            prompt: rolePrompt.trim() || selectedRole?.goal || roleTaskId.trim(),
          })}
          type="button"
        >
          <span className="mini-action-button-label">세션 시작</span>
        </button>
      </section>

      <section className="workbench-quick-section">
        <strong>일반 작업 카드 추가</strong>
        <input
          className="workflow-handoff-task-input"
          onChange={(event) => setManualTitle(event.target.value)}
          placeholder="카드 제목"
          value={manualTitle}
        />
        <input className="workflow-handoff-task-input" onChange={(event) => setManualTaskId(event.target.value)} value={manualTaskId} />
        <textarea
          className="workflow-handoff-request-input"
          onChange={(event) => setManualPrompt(event.target.value)}
          placeholder="메모 또는 다음 행동"
          value={manualPrompt}
        />
        <input
          className="workflow-handoff-task-input"
          onChange={(event) => setManualCommands(event.target.value)}
          placeholder="쉼표로 명령 구분"
          value={manualCommands}
        />
        <button
          className="mini-action-button"
          onClick={() => onCreateManualSession({
            title: manualTitle,
            taskId: manualTaskId,
            prompt: manualPrompt,
            commands: manualCommands.split(",").map((item) => item.trim()).filter(Boolean),
          })}
          type="button"
        >
          <span className="mini-action-button-label">카드 생성</span>
        </button>
      </section>
    </section>
  );
}
