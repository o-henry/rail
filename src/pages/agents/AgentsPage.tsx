import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";

type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
};

type AgentThread = {
  id: string;
  name: string;
};

type AttachedFile = {
  id: string;
  name: string;
};

export default function AgentsPage({ onQuickAction }: AgentsPageProps) {
  const { t } = useI18n();
  const [threads, setThreads] = useState<AgentThread[]>([{ id: "agent-1", name: "Agent 1" }]);
  const [activeThreadId, setActiveThreadId] = useState("agent-1");
  const [draft, setDraft] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("5.3-Codex");
  const [selectedReasonLevel, setSelectedReasonLevel] = useState("보통");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptions = useMemo(
    () => [
      "5.3-Codex",
      "5.3-Codex-Spark",
      "5.2-Codex",
      "5.1-Codex-Max",
      "5.2",
      "5.1-Codex-Mini",
    ],
    [],
  );
  const reasonLevelOptions = useMemo(() => ["낮음", "보통", "높음"], []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null,
    [activeThreadId, threads],
  );

  useEffect(() => {
    if (!modelOptions.includes(selectedModel)) {
      setSelectedModel(modelOptions[0]);
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (!isModelMenuOpen && !isReasonMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (!reasonMenuRef.current?.contains(event.target as Node)) {
        setIsReasonMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isModelMenuOpen, isReasonMenuOpen]);

  const onAddThread = () => {
    const nextIndex = threads.length + 1;
    const next: AgentThread = {
      id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `Agent ${nextIndex}`,
    };
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
    if (!text && attachedFiles.length === 0) {
      return;
    }
    const filePrefix =
      attachedFiles.length > 0 ? `files: ${attachedFiles.map((file) => file.name).join(", ")}\n` : "";
    const content = `${filePrefix}${text}`.trim();
    const promptWithConfig = `[model=${selectedModel}, reason=${selectedReasonLevel}] ${content}`;
    const payload = activeThread ? `[${activeThread.name}] ${promptWithConfig}` : promptWithConfig;
    onQuickAction(payload);
    setDraft("");
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const nextFiles: AttachedFile[] = Array.from(files).map((file, index) => ({
      id: `${file.name}-${index}-${Date.now()}`,
      name: file.name,
    }));
    setAttachedFiles((prev) => {
      const seen = new Set(prev.map((file) => file.name));
      const merged = [...prev];
      nextFiles.forEach((file) => {
        if (!seen.has(file.name)) {
          seen.add(file.name);
          merged.push(file);
        }
      });
      return merged;
    });
    event.target.value = "";
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

      <section
        className={`agents-grid${threads.length === 1 ? " is-single" : threads.length === 2 ? " is-two" : ""}`}
        aria-label="Agents grid"
      >
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
            <div className="agents-grid-card-log" aria-label={`${thread.name} log`}>
              <p className="agents-grid-card-placeholder">
                {thread.id === activeThreadId ? "대화 로그가 여기에 표시됩니다." : "에이전트를 선택하면 로그가 표시됩니다."}
              </p>
            </div>
            <div className="agents-grid-card-foot">
              <span>{thread.id === activeThreadId ? "Active" : "Standby"}</span>
            </div>
          </article>
        ))}
      </section>

      <div className="agents-composer">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onAttachFiles}
          className="agents-file-input"
          tabIndex={-1}
          aria-hidden="true"
        />
        <textarea
          aria-label={t("agents.input.placeholder")}
          placeholder={t("agents.input.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {attachedFiles.length > 0 && (
          <div className="agents-file-list" aria-label="Attached files">
            {attachedFiles.map((file) => (
              <span key={file.id} className="agents-file-chip">
                {file.name}
              </span>
            ))}
          </div>
        )}
        <div className="agents-composer-row">
          <div className="agents-composer-left">
            <button aria-label="파일 추가" className="agents-icon-button" onClick={onOpenFilePicker} type="button">
              <img alt="" aria-hidden="true" src="/plus.svg" />
            </button>
            <div
              className={`agents-model-dropdown${isModelMenuOpen ? " is-open" : ""}`}
              ref={modelMenuRef}
            >
              <button
                aria-expanded={isModelMenuOpen}
                aria-haspopup="listbox"
                className="agents-model-button"
                onClick={() => setIsModelMenuOpen((prev) => !prev)}
                type="button"
              >
                <span>{selectedModel}</span>
                <img alt="" aria-hidden="true" src="/down-arrow.svg" />
              </button>
              {isModelMenuOpen && (
                <ul aria-label="Agent model" className="agents-model-menu" role="listbox">
                  {modelOptions.map((model) => (
                    <li key={model}>
                      <button
                        aria-selected={model === selectedModel}
                        className={model === selectedModel ? "is-selected" : ""}
                        onClick={() => {
                          setSelectedModel(model);
                          setIsModelMenuOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        {model}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className={`agents-reason-dropdown${isReasonMenuOpen ? " is-open" : ""}`}
              ref={reasonMenuRef}
            >
              <button
                aria-expanded={isReasonMenuOpen}
                aria-haspopup="listbox"
                className="agents-reason-button"
                onClick={() => setIsReasonMenuOpen((prev) => !prev)}
                type="button"
              >
                <span>{`이성 수준 · ${selectedReasonLevel}`}</span>
                <img alt="" aria-hidden="true" src="/down-arrow.svg" />
              </button>
              {isReasonMenuOpen && (
                <ul aria-label="Reasoning level" className="agents-reason-menu" role="listbox">
                  {reasonLevelOptions.map((level) => (
                    <li key={level}>
                      <button
                        aria-selected={level === selectedReasonLevel}
                        className={level === selectedReasonLevel ? "is-selected" : ""}
                        onClick={() => {
                          setSelectedReasonLevel(level);
                          setIsReasonMenuOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        {level}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="agents-composer-right">
            <button
              aria-label={t("agents.send")}
              className="agents-send-button"
              disabled={!draft.trim() && attachedFiles.length === 0}
              onClick={onSend}
              type="button"
            >
              <img alt="" aria-hidden="true" src="/up.svg" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
