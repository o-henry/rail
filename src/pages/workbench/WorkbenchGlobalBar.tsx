import type { ControlRoomOverview } from "./controlRoomState";

type WorkbenchGlobalBarProps = {
  overview: ControlRoomOverview;
};

const ITEMS: Array<{ key: keyof ControlRoomOverview; label: string }> = [
  { key: "totalSessions", label: "전체 세션" },
  { key: "activeSessions", label: "진행 중 세션" },
  { key: "unityPending", label: "Unity 확인 대기" },
  { key: "pendingApprovals", label: "승인 대기" },
  { key: "activeNodes", label: "활성 노드" },
  { key: "recentErrors", label: "최근 오류" },
];

export function WorkbenchGlobalBar({ overview }: WorkbenchGlobalBarProps) {
  return (
    <section className="panel-card workbench-global-bar" aria-label="워크스페이스 요약">
      <div className="workbench-global-copy">
        <strong>워크스페이스</strong>
        <p>에이전트 세션, 그래프 런타임, VS Code / Unity 확인 상태를 한 화면에서 추적합니다.</p>
      </div>
      <div className="workbench-global-metrics">
        {ITEMS.map((item) => (
          <article className="workbench-global-metric" key={item.key}>
            <small>{item.label}</small>
            <strong>{overview[item.key] as number}</strong>
          </article>
        ))}
        <article className="workbench-global-metric">
          <small>브리지 연결</small>
          <strong>{overview.connectedProviders}</strong>
        </article>
        <article className="workbench-global-metric">
          <small>그래프 실행</small>
          <strong>{overview.graphRunning ? "실행 중" : "대기"}</strong>
        </article>
      </div>
    </section>
  );
}
