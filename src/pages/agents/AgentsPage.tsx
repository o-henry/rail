import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";

type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
};

type AgentThread = {
  id: string;
  name: string;
};

export default function AgentsPage({ onQuickAction }: AgentsPageProps) {
  const { t } = useI18n();
  const [threads, setThreads] = useState<AgentThread[]>([{ id: "agent-1", name: "Agent 1" }]);
  const [activeThreadId, setActiveThreadId] = useState("agent-1");
  const [draft, setDraft] = useState("");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null,
    [activeThreadId, threads],
  );

  const onAddThread = () => {
    const nextIndex = threads.length + 1;
    const next: AgentThread = { id: `agent-${nextIndex}`, name: `Agent ${nextIndex}` };
    setThreads((prev) => [...prev, next]);
    setActiveThreadId(next.id);
  };

  const onSend = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    onQuickAction(text);
    setDraft("");
  };

  return (
    <section className="agents-layout workspace-tab-panel">
      <div className="agents-thread-toolbar">
        <div className="agents-thread-list" role="tablist" aria-label="Agent threads">
          {threads.map((thread) => (
            <button
              key={thread.id}
              aria-selected={thread.id === activeThreadId}
              className={thread.id === activeThreadId ? "is-active" : ""}
              onClick={() => setActiveThreadId(thread.id)}
              role="tab"
              type="button"
            >
              {thread.name}
            </button>
          ))}
        </div>
        <button className="agents-add-thread-button" onClick={onAddThread} type="button">+ Agent</button>
      </div>

      <article className="panel-card agents-chat-stage">
        {activeThread ? (
          <p>{activeThread.name} ready.</p>
        ) : (
          <p>{t("common.noneSimple")}</p>
        )}
      </article>

      <div className="agents-input-shell">
        <textarea
          aria-label={t("agents.input.placeholder")}
          placeholder={t("agents.input.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="agents-send-row">
          <button onClick={onSend} type="button">Send</button>
        </div>
      </div>
    </section>
  );
}
