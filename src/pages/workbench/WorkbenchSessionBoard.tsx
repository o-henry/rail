import type { WorkSession } from "../../features/orchestration/workbench/types";
import { workbenchStatusLabel, workbenchSurfaceLabel } from "./workbenchLabels";

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
    <section className="panel-card workbench-session-rail" aria-label="세션 레일">
      <header className="workbench-panel-head">
        <div>
          <strong>세션 레일</strong>
          <p>역할별 에이전트 세션과 일반 작업을 실시간으로 추적합니다.</p>
        </div>
      </header>

      <div className="workbench-session-rail-list">
        {sessions.length === 0 ? (
          <p className="workbench-inline-empty">아직 시작된 세션이 없습니다.</p>
        ) : (
          sessions.map((session) => (
            <button
              className={`workbench-rail-card${selectedSessionId === session.id ? " is-selected" : ""}`}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              type="button"
            >
              <div className="workbench-rail-card-head">
                <strong>{session.roleLabel ?? session.title}</strong>
                <span>{workbenchStatusLabel(session.status)}</span>
              </div>
              <p className="workbench-rail-card-title">{session.title}</p>
              <div className="workbench-session-meta">
                <span>{session.taskId}</span>
                <span>{workbenchSurfaceLabel(session.surface)}</span>
              </div>
              <p className="workbench-session-action">{session.nextAction.title}</p>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
