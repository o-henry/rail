import type { WorkspaceTerminalPane } from "./workspaceTerminalTypes";

type WorkspaceTerminalPaneProps = {
  pane: WorkspaceTerminalPane;
  statusLabel: string;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onChangeInput: (value: string) => void;
  onSend: () => void;
};

export function WorkspaceTerminalPane(props: WorkspaceTerminalPaneProps) {
  return (
    <section className="workspace-terminal-pane" aria-label={props.pane.title}>
      <header className="workspace-terminal-pane-head">
        <div className="workspace-terminal-pane-copy">
          <strong>{props.pane.title}</strong>
          <span>{props.pane.subtitle}</span>
        </div>
        <div className="workspace-terminal-pane-meta">
          <b>{props.statusLabel}</b>
          <button className="mini-action-button" onClick={props.onStart} type="button">
            <span className="mini-action-button-label">Codex 시작</span>
          </button>
          <button className="mini-action-button" onClick={props.onStop} type="button">
            <span className="mini-action-button-label">중지</span>
          </button>
          <button className="mini-action-button" onClick={props.onClear} type="button">
            <span className="mini-action-button-label">비우기</span>
          </button>
        </div>
      </header>

      <div className="workspace-terminal-pane-body">
        <pre>{props.pane.buffer || "Codex CLI 세션을 시작하면 출력이 여기에 표시됩니다."}</pre>
      </div>

      <footer className="workspace-terminal-pane-input">
        <input
          className="workflow-handoff-task-input"
          onChange={(event) => props.onChangeInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              props.onSend();
            }
          }}
          placeholder="명령 또는 메시지를 입력하고 Enter"
          value={props.pane.input}
        />
        <button className="mini-action-button" onClick={props.onSend} type="button">
          <span className="mini-action-button-label">전송</span>
        </button>
      </footer>
    </section>
  );
}
