import type { WorkSession, WorkSessionStatus } from "../../features/orchestration/workbench/types";
import { workbenchReviewLabel, workbenchStatusLabel, workbenchSurfaceLabel, workbenchVerificationLabel } from "./workbenchLabels";

type WorkbenchSessionDetailProps = {
  session: WorkSession | null;
  onArchiveSession: (sessionId: string) => void;
  onAddNote: (sessionId: string, note: string) => void;
  onAttachArtifact: (sessionId: string, path: string) => void;
  onOpenArtifact: (path: string) => void;
  onSetManualStatus: (sessionId: string, status: WorkSessionStatus) => void;
};

const MANUAL_STATUS_ACTIONS: Array<{ status: WorkSessionStatus; label: string }> = [
  { status: "active", label: "진행 시작" },
  { status: "review", label: "검토로 이동" },
  { status: "unity", label: "Unity 확인" },
  { status: "done", label: "완료" },
];

export function WorkbenchSessionDetail({
  session,
  onArchiveSession,
  onAddNote,
  onAttachArtifact,
  onOpenArtifact,
  onSetManualStatus,
}: WorkbenchSessionDetailProps) {
  if (!session) {
    return (
      <section className="panel-card workbench-detail">
        <header className="workbench-panel-head">
          <div>
            <strong>세션 상세</strong>
            <p>좌측 보드에서 세션을 선택하면 상세 정보와 액션이 열립니다.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="panel-card workbench-detail">
      <header className="workbench-panel-head">
        <div>
          <strong>{session.title}</strong>
          <p>{session.kind === "role_run" ? `${session.roleLabel ?? "역할"} 세션` : "일반 작업 카드"}</p>
        </div>
        <button className="mini-action-button" onClick={() => onArchiveSession(session.id)} type="button">
          <span className="mini-action-button-label">보드에서 숨기기</span>
        </button>
      </header>

      <div className="workbench-detail-summary">
        <article className="workbench-detail-card">
          <small>현재 역할</small>
          <strong>{session.roleLabel ?? "일반 작업"}</strong>
        </article>
        <article className="workbench-detail-card">
          <small>현재 작업 위치</small>
          <strong>{workbenchSurfaceLabel(session.surface)}</strong>
        </article>
        <article className="workbench-detail-card">
          <small>다음 행동</small>
          <strong>{session.nextAction.title}</strong>
          {session.nextAction.detail ? <p>{session.nextAction.detail}</p> : null}
        </article>
        <article className="workbench-detail-card">
          <small>검증 상태</small>
          <strong>{workbenchVerificationLabel(session.verificationStatus)}</strong>
          <p>{workbenchReviewLabel(session.reviewState)}</p>
        </article>
      </div>

      {session.kind === "manual_task" && (
        <section className="workbench-detail-section">
          <div className="workbench-detail-section-head">
            <strong>상태 이동</strong>
          </div>
          <div className="workbench-action-row">
            {MANUAL_STATUS_ACTIONS.map((action) => (
              <button
                className="mini-action-button"
                key={action.status}
                onClick={() => onSetManualStatus(session.id, action.status)}
                type="button"
              >
                <span className="mini-action-button-label">{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {session.kind === "role_run" && session.mission ? (
        <details className="workbench-detail-collapsible" open>
          <summary>내부 실행 단계</summary>
          <ul className="workbench-detail-list">
            {session.mission.childEnvelopes.map((envelope) => (
              <li key={envelope.record.runId}>
                <strong>{envelope.record.summary || envelope.record.agentRole || envelope.record.roleId}</strong>
                <span>{envelope.record.status}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="workbench-detail-collapsible">
        <summary>터미널</summary>
        {session.terminalResults.length === 0 ? (
          <p className="workbench-inline-empty">최근 실행 결과가 없습니다.</p>
        ) : (
          <ul className="workbench-detail-list">
            {session.terminalResults.map((result) => (
              <li key={result.id}>
                <strong>{result.command}</strong>
                <span>{result.exitCode === 0 ? "성공" : `실패 (${result.exitCode})`}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="workbench-detail-collapsible">
        <summary>산출물</summary>
        <div className="workbench-inline-form">
          <input className="workflow-handoff-task-input" defaultValue="" name="artifactPath" placeholder="산출물 경로 추가" />
          <button
            className="mini-action-button"
            onClick={(event) => {
              const input = (event.currentTarget.parentElement?.querySelector("input[name='artifactPath']") as HTMLInputElement | null);
              onAttachArtifact(session.id, input?.value ?? "");
              if (input) {
                input.value = "";
              }
            }}
            type="button"
          >
            <span className="mini-action-button-label">경로 추가</span>
          </button>
        </div>
        {session.artifactPaths.length === 0 ? (
          <p className="workbench-inline-empty">연결된 산출물이 없습니다.</p>
        ) : (
          <ul className="workbench-detail-list">
            {session.artifactPaths.map((path) => (
              <li key={path}>
                <strong>{path.split(/[\\/]/).filter(Boolean).pop() ?? path}</strong>
                <button className="mini-action-button" onClick={() => onOpenArtifact(path)} type="button">
                  <span className="mini-action-button-label">열기</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="workbench-detail-collapsible">
        <summary>메모</summary>
        <div className="workbench-inline-form">
          <textarea className="workflow-handoff-request-input" name="sessionNote" placeholder="세션 메모를 남기세요." />
          <button
            className="mini-action-button"
            onClick={(event) => {
              const input = (event.currentTarget.parentElement?.querySelector("textarea[name='sessionNote']") as HTMLTextAreaElement | null);
              onAddNote(session.id, input?.value ?? "");
              if (input) {
                input.value = "";
              }
            }}
            type="button"
          >
            <span className="mini-action-button-label">메모 추가</span>
          </button>
        </div>
        {session.notes.length === 0 ? (
          <p className="workbench-inline-empty">아직 메모가 없습니다.</p>
        ) : (
          <ul className="workbench-detail-note-list">
            {session.notes.map((note) => (
              <li key={note.id}>
                <strong>{new Date(note.createdAt).toLocaleString()}</strong>
                <p>{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </details>

      <footer className="workbench-detail-footer">
        <span>{workbenchStatusLabel(session.status)}</span>
        <span>{session.taskId}</span>
      </footer>
    </section>
  );
}
