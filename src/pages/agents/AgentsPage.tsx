import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardTopicId, DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
import { useI18n } from "../../i18n";

type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
  topicSnapshots: Partial<Record<DashboardTopicId, DashboardTopicSnapshot>>;
};

type AgentThread = {
  id: string;
  name: string;
};

type AttachedFile = {
  id: string;
  name: string;
};

type AgentSetOption = {
  id: string;
  label: string;
  description: string;
};

type AgentSetState = {
  threads: AgentThread[];
  activeThreadId: string;
  draft: string;
  attachedFiles: AttachedFile[];
  dashboardInsights: string[];
};

const AGENT_SET_DASHBOARD_DATA_STORAGE_KEY = "RAIL_AGENT_SET_DASHBOARD_DATA_V1";

const AGENT_SET_OPTIONS: AgentSetOption[] = [
  {
    id: "market-research",
    label: "시장 조사 세트",
    description: "트렌드 탐색, 경쟁사 분석, 주간 브리핑 에이전트 묶음",
  },
  {
    id: "content-ops",
    label: "콘텐츠 운영 세트",
    description: "콘텐츠 생성, 교정, 배포 체크 에이전트 묶음",
  },
  {
    id: "dev-delivery",
    label: "개발 전달 세트",
    description: "요구사항 정리, 구현, 검증 에이전트 묶음",
  },
];

function createDefaultSetState(): AgentSetState {
  return {
    threads: [{ id: "agent-1", name: "agent-1" }],
    activeThreadId: "agent-1",
    draft: "",
    attachedFiles: [],
    dashboardInsights: [],
  };
}

function createInitialSetStateMap(): Record<string, AgentSetState> {
  return Object.fromEntries(AGENT_SET_OPTIONS.map((setOption) => [setOption.id, createDefaultSetState()])) as Record<
    string,
    AgentSetState
  >;
}

export default function AgentsPage({ onQuickAction, topicSnapshots }: AgentsPageProps) {
  const { t } = useI18n();
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [setStateMap, setSetStateMap] = useState<Record<string, AgentSetState>>(() => {
    const initial = createInitialSetStateMap();
    if (typeof window === "undefined") {
      return initial;
    }
    try {
      const raw = window.localStorage.getItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY);
      if (!raw) {
        return initial;
      }
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      for (const setOption of AGENT_SET_OPTIONS) {
        const saved = parsed[setOption.id];
        if (Array.isArray(saved)) {
          initial[setOption.id].dashboardInsights = saved
            .map((item) => String(item ?? "").trim())
            .filter((item) => item.length > 0)
            .slice(0, 7);
        }
      }
    } catch {
      // ignore invalid local storage
    }
    return initial;
  });
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("5.3-Codex");
  const [selectedReasonLevel, setSelectedReasonLevel] = useState("보통");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptions = useMemo(
    () => ["5.3-Codex", "5.3-Codex-Spark", "5.2-Codex", "5.1-Codex-Max", "5.2", "5.1-Codex-Mini"],
    [],
  );
  const reasonLevelOptions = useMemo(() => ["낮음", "보통", "높음"], []);

  const currentSetState = useMemo(() => {
    if (!activeSetId) {
      return null;
    }
    return setStateMap[activeSetId] ?? createDefaultSetState();
  }, [activeSetId, setStateMap]);

  const threads = currentSetState?.threads ?? [];
  const activeThreadId = currentSetState?.activeThreadId ?? "";
  const draft = currentSetState?.draft ?? "";
  const attachedFiles = currentSetState?.attachedFiles ?? [];

  useEffect(() => {
    const snapshots = Object.values(topicSnapshots)
      .filter((snapshot): snapshot is DashboardTopicSnapshot => Boolean(snapshot))
      .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())
      .slice(0, 7)
      .map((snapshot) => `${snapshot.topic}: ${snapshot.summary}`);
    if (snapshots.length === 0) {
      return;
    }
    setSetStateMap((prev) => {
      const next = { ...prev };
      for (const setOption of AGENT_SET_OPTIONS) {
        const current = next[setOption.id] ?? createDefaultSetState();
        next[setOption.id] = {
          ...current,
          dashboardInsights: snapshots,
        };
      }
      if (typeof window !== "undefined") {
        try {
          const toStore: Record<string, string[]> = {};
          for (const setOption of AGENT_SET_OPTIONS) {
            toStore[setOption.id] = next[setOption.id]?.dashboardInsights ?? [];
          }
          window.localStorage.setItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY, JSON.stringify(toStore));
        } catch {
          // ignore local storage failures
        }
      }
      return next;
    });
  }, [topicSnapshots]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null,
    [activeThreadId, threads],
  );

  const updateActiveSetState = (updater: (current: AgentSetState) => AgentSetState) => {
    if (!activeSetId) {
      return;
    }
    setSetStateMap((prev) => {
      const current = prev[activeSetId] ?? createDefaultSetState();
      return {
        ...prev,
        [activeSetId]: updater(current),
      };
    });
  };

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

  const onSelectSet = (setId: string) => {
    setActiveSetId(setId);
    setIsModelMenuOpen(false);
    setIsReasonMenuOpen(false);
  };

  const onBackToSetList = () => {
    setActiveSetId(null);
    setIsModelMenuOpen(false);
    setIsReasonMenuOpen(false);
  };

  const onAddThread = () => {
    updateActiveSetState((current) => {
      const nextIndex =
        current.threads.reduce((max, thread) => {
          const byName = /^agent-(\d+)$/.exec(thread.name)?.[1];
          const byId = /^agent-(\d+)$/.exec(thread.id)?.[1];
          const parsed = Number(byName ?? byId ?? 0);
          return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
        }, 0) + 1;
      const nextLabel = `agent-${nextIndex}`;
      const nextThread: AgentThread = {
        id: nextLabel,
        name: nextLabel,
      };
      return {
        ...current,
        threads: [...current.threads, nextThread],
        activeThreadId: nextThread.id,
      };
    });
  };

  const onCloseThread = (threadId: string) => {
    updateActiveSetState((current) => {
      const filtered = current.threads.filter((thread) => thread.id !== threadId);
      const nextThreads = filtered.length > 0 ? filtered : [{ id: "agent-1", name: "agent-1" }];
      const nextActive = nextThreads.some((thread) => thread.id === current.activeThreadId)
        ? current.activeThreadId
        : nextThreads[0].id;
      return {
        ...current,
        threads: nextThreads,
        activeThreadId: nextActive,
      };
    });
  };

  const onSetActiveThreadId = (threadId: string) => {
    updateActiveSetState((current) => ({
      ...current,
      activeThreadId: threadId,
    }));
  };

  const onSetDraft = (value: string) => {
    updateActiveSetState((current) => ({
      ...current,
      draft: value,
    }));
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
    updateActiveSetState((current) => ({
      ...current,
      draft: "",
      attachedFiles: [],
    }));
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

    updateActiveSetState((current) => {
      const seen = new Set(current.attachedFiles.map((file) => file.name));
      const merged = [...current.attachedFiles];
      nextFiles.forEach((file) => {
        if (!seen.has(file.name)) {
          seen.add(file.name);
          merged.push(file);
        }
      });
      return {
        ...current,
        attachedFiles: merged,
      };
    });

    event.target.value = "";
  };

  if (!activeSetId) {
    return (
      <section className="agents-layout agents-set-mode workspace-tab-panel">
        <div className="agents-set-picker">
          <header className="agents-set-picker-head">
            <h2>에이전트 세트</h2>
            <p>먼저 세트를 선택하면 해당 세트의 에이전트 뷰가 열립니다.</p>
          </header>
          <div className="agents-set-list" role="list" aria-label="Agent sets">
            {AGENT_SET_OPTIONS.map((setOption) => (
              <button
                className="agents-set-card"
                key={setOption.id}
                onClick={() => onSelectSet(setOption.id)}
                role="listitem"
                type="button"
              >
                <strong>{setOption.label}</strong>
                <span>{setOption.description}</span>
                {(setStateMap[setOption.id]?.dashboardInsights.length ?? 0) > 0 ? (
                  <ul className="agents-set-insight-list">
                    {setStateMap[setOption.id].dashboardInsights.slice(0, 3).map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="agents-layout agents-workspace-mode workspace-tab-panel">
      <div className="agents-topbar">
        <div className="agents-thread-list" role="tablist" aria-label="Agent threads">
          {threads.map((thread) => (
            <button
              key={thread.id}
              aria-selected={thread.id === activeThreadId}
              className={thread.id === activeThreadId ? "is-active" : ""}
              onClick={() => onSetActiveThreadId(thread.id)}
              role="tab"
              type="button"
            >
              {thread.name}
            </button>
          ))}
        </div>
        <div className="agents-topbar-actions">
          <button className="agents-back-button" onClick={onBackToSetList} type="button">
            ← 세트 목록
          </button>
          <button className="agents-add-thread-button" onClick={onAddThread} type="button">
            + {t("agents.add")}
          </button>
        </div>
      </div>

      <section
        className={`agents-grid${threads.length === 1 ? " is-single" : threads.length === 2 ? " is-two" : ""}`}
        aria-label="Agents grid"
      >
        {threads.map((thread) => (
          <article
            key={thread.id}
            className={`panel-card agents-grid-card${thread.id === activeThreadId ? " is-active" : ""}`}
            onClick={() => onSetActiveThreadId(thread.id)}
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
          onChange={(event) => onSetDraft(event.target.value)}
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
              <img alt="" aria-hidden="true" src="/plus-large-svgrepo-com.svg" />
            </button>
            <div className={`agents-model-dropdown${isModelMenuOpen ? " is-open" : ""}`} ref={modelMenuRef}>
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
            <div className={`agents-reason-dropdown${isReasonMenuOpen ? " is-open" : ""}`} ref={reasonMenuRef}>
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
