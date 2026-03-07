import type { GraphMonitorRow } from "./controlRoomState";
import { workbenchRuntimeStatusLabel } from "./workbenchLabels";

type WorkbenchGraphMonitorProps = {
  graphName: string;
  rows: GraphMonitorRow[];
  onOpenWorkflow: () => void;
};

export function WorkbenchGraphMonitor({
  graphName,
  rows,
  onOpenWorkflow,
}: WorkbenchGraphMonitorProps) {
  return (
    <section className="panel-card workbench-graph-monitor" aria-label="오케스트레이션 맵">
      <header className="workbench-panel-head">
        <div>
          <strong>오케스트레이션 맵</strong>
          <p>{graphName || "default"} 그래프의 현재 노드 상태를 모니터링합니다.</p>
        </div>
        <button className="mini-action-button" onClick={onOpenWorkflow} type="button">
          <span className="mini-action-button-label">그래프 편집 열기</span>
        </button>
      </header>
      <div className="workbench-graph-grid">
        {rows.length === 0 ? (
          <p className="workbench-inline-empty">그래프에 아직 노드가 없습니다.</p>
        ) : (
          rows.map((row) => (
            <article className={`workbench-graph-tile${row.active ? " is-active" : ""}`} key={row.id}>
              <div className="workbench-graph-tile-head">
                <strong>{row.title}</strong>
                <span>{workbenchRuntimeStatusLabel(row.status)}</span>
              </div>
              <div className="workbench-session-meta">
                <span>{row.type}</span>
                <span>로그 {row.logCount}</span>
              </div>
              <p className="workbench-session-action">{row.lastLog || "최근 로그 없음"}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
