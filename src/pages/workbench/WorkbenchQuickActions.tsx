import { useState } from "react";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";
import type { WorkSession } from "../../features/orchestration/workbench/types";

type WorkbenchQuickActionsProps = {
  selectedSession: WorkSession | null;
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
  onExecuteCommand: (sessionId: string, command: string) => void;
  onSetReviewState: (sessionId: string, next: "approved" | "rejected") => void;
  onRecordCompanionEvent: (sessionId: string, type: "task_received" | "patch_ready" | "test_passed" | "test_failed" | "approval_requested", message?: string) => void;
  onRecordUnityVerification: (sessionId: string, success: boolean, message: string) => void;
};

export function WorkbenchQuickActions({
  selectedSession,
  onCreateRoleSession,
  onCreateManualSession,
  onExecuteCommand,
  onSetReviewState,
  onRecordCompanionEvent,
  onRecordUnityVerification,
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
          <strong>빠른 액션</strong>
          <p>작업 시작, 일반 카드 생성, 승인/검증 같은 반복 동작을 여기서 처리합니다.</p>
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

      {selectedSession ? (
        <section className="workbench-quick-section">
          <strong>선택 세션 액션</strong>
          <div className="workbench-action-row">
            {selectedSession.commands.map((command) => (
              <button className="mini-action-button" key={command} onClick={() => onExecuteCommand(selectedSession.id, command)} type="button">
                <span className="mini-action-button-label">{command}</span>
              </button>
            ))}
          </div>
          <div className="workbench-action-row">
            <button className="mini-action-button" onClick={() => onSetReviewState(selectedSession.id, "approved")} type="button">
              <span className="mini-action-button-label">승인</span>
            </button>
            <button className="mini-action-button" onClick={() => onSetReviewState(selectedSession.id, "rejected")} type="button">
              <span className="mini-action-button-label">반려</span>
            </button>
            <button className="mini-action-button" onClick={() => onRecordCompanionEvent(selectedSession.id, "patch_ready", "패치 초안 준비")} type="button">
              <span className="mini-action-button-label">패치 준비</span>
            </button>
          </div>
          <div className="workbench-action-row">
            <button className="mini-action-button" onClick={() => onRecordUnityVerification(selectedSession.id, true, "Unity 확인 완료")} type="button">
              <span className="mini-action-button-label">Unity 통과</span>
            </button>
            <button className="mini-action-button" onClick={() => onRecordUnityVerification(selectedSession.id, false, "Unity 확인 실패")} type="button">
              <span className="mini-action-button-label">Unity 실패</span>
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
