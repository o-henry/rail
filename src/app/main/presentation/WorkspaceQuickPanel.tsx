import type { FormEvent } from "react";

type QuickPanelPostRow = {
  id: string;
  title: string;
  meta: string;
};

type WorkspaceQuickPanelProps = {
  isOpen: boolean;
  query: string;
  workspaceLabel: string;
  recentPosts: QuickPanelPostRow[];
  onToggle: () => void;
  onClose: () => void;
  onChangeQuery: (value: string) => void;
  onSubmitQuery: () => void;
  onOpenFeed: () => void;
  onOpenAgents: () => void;
};

export function WorkspaceQuickPanel(props: WorkspaceQuickPanelProps) {
  const {
    isOpen,
    query,
    workspaceLabel,
    recentPosts,
    onToggle,
    onClose,
    onChangeQuery,
    onSubmitQuery,
    onOpenFeed,
    onOpenAgents,
  } = props;

  const onComposerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitQuery();
  };

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label="우측 패널 열기"
        className={`workspace-quick-toggle${isOpen ? " is-open" : ""}`}
        onClick={onToggle}
        type="button"
      >
        ⌘K
      </button>

      <aside className={`workspace-quick-panel${isOpen ? " is-open" : ""}`}>
        <header className="workspace-quick-panel-head">
          <div>
            <h2>{workspaceLabel}</h2>
            <p>작업표시줄 아래 우측 확장 패널</p>
          </div>
          <button aria-label="우측 패널 닫기" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="workspace-quick-panel-actions">
          <button onClick={onOpenFeed} type="button">요약 피드 열기</button>
          <button onClick={onOpenAgents} type="button">에이전트 열기</button>
        </div>

        <section className="workspace-quick-panel-content">
          <h3>최근 요약</h3>
          {recentPosts.length > 0 ? (
            <ul>
              {recentPosts.map((row) => (
                <li key={row.id}>
                  <button onClick={onOpenFeed} type="button">
                    <strong>{row.title}</strong>
                    <span>{row.meta}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="workspace-quick-panel-empty">표시할 요약이 아직 없습니다.</p>
          )}
        </section>

        <form className="workspace-quick-composer" onSubmit={onComposerSubmit}>
          <textarea
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder="Ask, search, or make anything..."
            rows={2}
            value={query}
          />
          <div className="workspace-quick-composer-row">
            <span>Workflow 입력으로 전송</span>
            <button type="submit">↑</button>
          </div>
        </form>
      </aside>
    </>
  );
}
