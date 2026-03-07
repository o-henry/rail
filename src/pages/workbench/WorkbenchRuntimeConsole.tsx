import type { WorkSession } from "../../features/orchestration/workbench/types";
import type { WorkbenchWorkspaceEvent } from "./workbenchRuntimeTypes";

type WorkbenchRuntimeConsoleProps = {
  session: WorkSession | null;
  workspaceEvents: WorkbenchWorkspaceEvent[];
  onExecuteCommand: (sessionId: string, command: string) => void;
  onSetReviewState: (sessionId: string, next: "approved" | "rejected") => void;
  onRecordCompanionEvent: (sessionId: string, type: "task_received" | "patch_ready" | "test_passed" | "test_failed" | "approval_requested", message?: string) => void;
  onRecordUnityVerification: (sessionId: string, success: boolean, message: string) => void;
};

export function WorkbenchRuntimeConsole({
  session,
  workspaceEvents,
  onExecuteCommand,
  onSetReviewState,
  onRecordCompanionEvent,
  onRecordUnityVerification,
}: WorkbenchRuntimeConsoleProps) {
  return (
    <section className="panel-card workbench-runtime-console" aria-label="런타임 콘솔">
      <header className="workbench-panel-head">
        <div>
          <strong>런타임 콘솔</strong>
          <p>터미널, 브리지 이벤트, 전체 이벤트 스트림을 같은 영역에서 확인합니다.</p>
        </div>
      </header>

      <div className="workbench-console-grid">
        <section className="workbench-console-panel">
          <div className="workbench-detail-section-head">
            <strong>작업용 터미널</strong>
          </div>
          {!session ? (
            <p className="workbench-inline-empty">세션을 선택하면 허용 명령과 결과가 나타납니다.</p>
          ) : (
            <>
              <div className="workbench-action-row">
                {session.commands.length === 0 ? (
                  <p className="workbench-inline-empty">연결된 명령이 없습니다.</p>
                ) : (
                  session.commands.map((command) => (
                    <button className="mini-action-button" key={command} onClick={() => onExecuteCommand(session.id, command)} type="button">
                      <span className="mini-action-button-label">{command}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="workbench-console-log">
                {session.terminalResults.length === 0 ? (
                  <p className="workbench-inline-empty">최근 실행 결과가 없습니다.</p>
                ) : (
                  session.terminalResults.map((result) => (
                    <article key={result.id}>
                      <strong>{result.command}</strong>
                      <pre>{result.stderrTail || result.stdoutTail || "출력 없음"}</pre>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="workbench-console-panel">
          <div className="workbench-detail-section-head">
            <strong>세션 이벤트</strong>
          </div>
          {!session ? (
            <p className="workbench-inline-empty">세션을 선택하면 companion / Unity 상태를 기록할 수 있습니다.</p>
          ) : (
            <>
              <div className="workbench-action-row">
                <button className="mini-action-button" onClick={() => onSetReviewState(session.id, "approved")} type="button">
                  <span className="mini-action-button-label">승인</span>
                </button>
                <button className="mini-action-button" onClick={() => onSetReviewState(session.id, "rejected")} type="button">
                  <span className="mini-action-button-label">반려</span>
                </button>
                <button className="mini-action-button" onClick={() => onRecordCompanionEvent(session.id, "patch_ready", "패치 초안 준비")} type="button">
                  <span className="mini-action-button-label">패치 준비</span>
                </button>
                <button className="mini-action-button" onClick={() => onRecordUnityVerification(session.id, true, "Unity 확인 완료")} type="button">
                  <span className="mini-action-button-label">Unity 통과</span>
                </button>
                <button className="mini-action-button" onClick={() => onRecordUnityVerification(session.id, false, "Unity 확인 실패")} type="button">
                  <span className="mini-action-button-label">Unity 실패</span>
                </button>
              </div>
              <ul className="workbench-console-event-list">
                {session.bridgeEvents.length === 0 ? (
                  <li className="workbench-inline-empty">브리지 이벤트가 없습니다.</li>
                ) : (
                  session.bridgeEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{event.type}</strong>
                      <span>{event.message}</span>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </section>

        <section className="workbench-console-panel">
          <div className="workbench-detail-section-head">
            <strong>전체 이벤트 스트림</strong>
          </div>
          <ul className="workbench-console-event-list">
            {workspaceEvents.slice(0, 12).map((event) => (
              <li key={event.id}>
                <strong>{event.source}</strong>
                <span>{event.message}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
