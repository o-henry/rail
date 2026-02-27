import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";

type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
};

type AgentThread = {
  id: string;
  name: string;
};

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M8 10V7.8C8 5.7 9.8 4 12 4C14.2 4 16 5.7 16 7.8V10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <rect
        x="6"
        y="10"
        width="12"
        height="10"
        rx="2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        x="9"
        y="4"
        width="6"
        height="10"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M7 11.5C7 14.2 9.1 16.4 12 16.4C14.9 16.4 17 14.2 17 11.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <path
        d="M12 16.5V20M9.5 20H14.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

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

  const onCloseThread = (threadId: string) => {
    const filtered = threads.filter((thread) => thread.id !== threadId);
    const nextThreads = filtered.length > 0 ? filtered : [{ id: "agent-1", name: "Agent 1" }];
    setThreads(nextThreads);
    if (!nextThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(nextThreads[0].id);
    }
  };

  const onSend = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const payload = activeThread ? `[${activeThread.name}] ${text}` : text;
    onQuickAction(payload);
    setDraft("");
  };

  return (
    <section className="agents-layout workspace-tab-panel">
      <div className="agents-topbar">
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
        <button className="agents-add-thread-button" onClick={onAddThread} type="button">
          + {t("agents.add")}
        </button>
      </div>

      <section className="agents-grid" aria-label="Agents grid">
        {threads.map((thread) => (
          <article
            key={thread.id}
            className={`panel-card agents-grid-card${thread.id === activeThreadId ? " is-active" : ""}`}
            onClick={() => setActiveThreadId(thread.id)}
          >
            <div className="agents-grid-card-head">
              <strong>{thread.name}</strong>
              <button
                aria-label={`${thread.name} ${t("agents.off")}`}
                className="agents-off-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseThread(thread.id);
                }}
                title={t("agents.off")}
                type="button"
              >
                <img alt="" aria-hidden="true" src="/xmark.svg" />
              </button>
            </div>
            <p>{thread.name} ready.</p>
          </article>
        ))}
      </section>

      <div className="agents-composer">
        <textarea
          aria-label={t("agents.input.placeholder")}
          placeholder={t("agents.input.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="agents-composer-row">
          <div className="agents-composer-left">
            <button aria-label={t("agents.add")} className="agents-icon-button" onClick={onAddThread} type="button">
              <img alt="" aria-hidden="true" src="/plus.svg" />
            </button>
            <button className="agents-model-button" type="button">
              <span>{t("agents.model.label")}</span>
              <img alt="" aria-hidden="true" src="/down-arrow.svg" />
            </button>
          </div>
          <div className="agents-composer-right">
            <button aria-label="lock" className="agents-icon-button" type="button">
              <LockIcon />
            </button>
            <button aria-label="voice" className="agents-icon-button" type="button">
              <MicIcon />
            </button>
            <button
              aria-label={t("agents.send")}
              className="agents-send-button"
              disabled={!draft.trim()}
              onClick={onSend}
              type="button"
            >
              <img alt="" aria-hidden="true" src="/up-arrow.svg" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
