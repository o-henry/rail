import { mergeRowPreview } from "./agentSetState";
import type { AgentSetGroup, AgentSetState } from "./agentTypes";

type AgentSetIndexViewProps = {
  groupedSetOptions: AgentSetGroup[];
  setStateMap: Record<string, AgentSetState>;
  onSelectSet: (setId: string) => void;
};

export function AgentSetIndexView({
  groupedSetOptions,
  setStateMap,
  onSelectSet,
}: AgentSetIndexViewProps) {
  return (
    <section className="agents-layout agents-set-mode workspace-tab-panel">
      <div className="agents-set-picker">
        <header className="agents-set-picker-head">
          <h2>에이전트 세트</h2>
          <p>세트를 선택하면 해당 에이전트 워크스페이스가 열립니다.</p>
        </header>
        <div className="agents-set-groups">
          {groupedSetOptions.map((group) => (
            <section className="agents-set-group" key={group.id}>
              <div className="agents-set-group-head">
                <h3 className="agents-set-group-title">{group.title}</h3>
                <div className="agents-set-index-head" role="presentation">
                  <span>SET</span>
                </div>
              </div>
              <div className="agents-set-list" role="list" aria-label={`${group.title} Agent sets`}>
                {group.items.map((setOption) => {
                  const snapshotLine = (setStateMap[setOption.id]?.dashboardInsights[0] ?? "").trim();
                  const mergedPreview = mergeRowPreview(setOption.description, snapshotLine);
                  return (
                    <button
                      className="agents-set-index-row"
                      key={setOption.id}
                      onClick={() => onSelectSet(setOption.id)}
                      role="listitem"
                      type="button"
                    >
                      <div className="agents-set-index-meta">
                        <strong>{setOption.label}</strong>
                        <code>{mergedPreview}</code>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
