import type { GraphNode } from "../../features/workflow/types";
import { WorkspaceGraphPane } from "./WorkspaceGraphPane";
import { WorkspaceTerminalPane } from "./WorkspaceTerminalPane";
import { useWorkspaceTerminalGrid } from "./useWorkspaceTerminalGrid";
import type { WorkbenchNodeState, WorkbenchWorkspaceEvent } from "./workbenchRuntimeTypes";

type WorkbenchPageProps = {
  cwd: string;
  graphFileName: string;
  graphNodes: GraphNode[];
  nodeStates: Record<string, WorkbenchNodeState>;
  workspaceEvents: WorkbenchWorkspaceEvent[];
};

export default function WorkbenchPage(props: WorkbenchPageProps) {
  const terminal = useWorkspaceTerminalGrid({
    cwd: props.cwd,
    graphFileName: props.graphFileName,
    graphNodes: props.graphNodes,
    nodeStates: props.nodeStates,
    workspaceEvents: props.workspaceEvents,
  });

  return (
    <section className="workspace-terminal-grid workspace-tab-panel">
      <header className="workspace-terminal-toolbar panel-card">
        <div className="workspace-terminal-toolbar-copy">
          <strong>워크스페이스</strong>
          <p>Codex CLI 세션과 그래프 실행 로그를 같은 멀티 터미널 화면에서 추적합니다.</p>
        </div>
        <div className="workspace-terminal-toolbar-actions">
          <button className="mini-action-button" onClick={terminal.startAllPanes} type="button">
            <span className="mini-action-button-label">모든 Codex 시작</span>
          </button>
          <button className="mini-action-button" onClick={terminal.stopAllPanes} type="button">
            <span className="mini-action-button-label">모든 세션 중지</span>
          </button>
        </div>
      </header>

      {terminal.panes.map((pane) => (
        <WorkspaceTerminalPane
          key={pane.id}
          onChangeInput={(value) => terminal.setPaneInput(pane.id, value)}
          onClear={() => terminal.clearPane(pane.id)}
          onSend={() => terminal.sendPaneInput(pane.id)}
          onStart={() => terminal.startPane(pane.id)}
          onStop={() => terminal.stopPane(pane.id)}
          pane={pane}
          statusLabel={terminal.statusMessage(pane.status, pane.exitCode)}
        />
      ))}

      <WorkspaceGraphPane body={terminal.graphObserverText} graphName={props.graphFileName} />
    </section>
  );
}
