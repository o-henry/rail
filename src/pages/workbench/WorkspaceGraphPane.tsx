type WorkspaceGraphPaneProps = {
  graphName: string;
  body: string;
};

export function WorkspaceGraphPane(props: WorkspaceGraphPaneProps) {
  return (
    <section className="workspace-terminal-pane workspace-terminal-pane-graph" aria-label="그래프 관찰 로그">
      <header className="workspace-terminal-pane-head">
        <div className="workspace-terminal-pane-copy">
          <strong>GRAPH</strong>
          <span>{props.graphName || "default"} 실행 로그 관찰</span>
        </div>
      </header>
      <div className="workspace-terminal-pane-body">
        <pre>{props.body || "그래프 이벤트가 아직 없습니다."}</pre>
      </div>
    </section>
  );
}
