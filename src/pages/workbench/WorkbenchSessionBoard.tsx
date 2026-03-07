import type { WorkSession, WorkSessionStatus } from "../../features/orchestration/workbench/types";
import { workbenchStatusLabel, workbenchSurfaceLabel, workbenchVerificationLabel } from "./workbenchLabels";

const BOARD_COLUMNS: WorkSessionStatus[] = ["waiting", "active", "review", "unity", "done"];

type WorkbenchSessionBoardProps = {
  sessions: WorkSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
};

export function WorkbenchSessionBoard({
  sessions,
  selectedSessionId,
  onSelectSession,
}: WorkbenchSessionBoardProps) {
  return (
    <section className="panel-card workbench-board" aria-label="작업 세션 보드">
      <header className="workbench-panel-head">
        <div>
          <strong>세션 보드</strong>
          <p>역할 실행 세션과 일반 작업 카드를 같은 흐름에서 관리합니다.</p>
        </div>
      </header>
      <div className="workbench-board-columns">
        {BOARD_COLUMNS.map((column) => {
          const columnSessions = sessions.filter((session) => session.status === column);
          return (
            <section className="workbench-column" key={column}>
              <header className="workbench-column-head">
                <strong>{workbenchStatusLabel(column)}</strong>
                <span>{columnSessions.length}</span>
              </header>
              <div className="workbench-column-body">
                {columnSessions.length === 0 ? (
                  <p className="workbench-column-empty">세션 없음</p>
                ) : (
                  columnSessions.map((session) => (
                    <button
                      className={`workbench-session-card${selectedSessionId === session.id ? " is-selected" : ""}`}
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      type="button"
                    >
                      <div className="workbench-session-card-head">
                        <strong>{session.title}</strong>
                        <span>{session.kind === "role_run" ? "역할" : "일반"}</span>
                      </div>
                      <p className="workbench-session-task">{session.taskId}</p>
                      <p className="workbench-session-action">{session.nextAction.title}</p>
                      <div className="workbench-session-meta">
                        <span>{workbenchSurfaceLabel(session.surface)}</span>
                        <span>{workbenchVerificationLabel(session.verificationStatus)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
