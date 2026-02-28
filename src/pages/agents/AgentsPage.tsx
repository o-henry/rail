import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { DASHBOARD_TOPIC_IDS, type DashboardTopicId, type DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
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

type AgentModelOption = {
  value: string;
  label: string;
  allowsReasonLevel: boolean;
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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function mergeRowPreview(description: string, snapshotLine: string): string {
  const desc = String(description ?? "").trim();
  const snap = String(snapshotLine ?? "").trim();
  if (!desc && !snap) {
    return "no snapshot";
  }
  if (!desc) {
    return snap;
  }
  if (!snap) {
    return desc;
  }
  const normalizedDesc = normalizeText(desc);
  const normalizedSnap = normalizeText(snap);
  if (normalizedSnap.includes(normalizedDesc)) {
    return snap;
  }
  if (normalizedDesc.includes(normalizedSnap)) {
    return desc;
  }
  return `${desc} · ${snap}`;
}

function isDevSetOption(option: AgentSetOption): boolean {
  const normalizedId = normalizeText(option.id);
  const normalizedLabel = normalizeText(option.label);
  return normalizedId.includes("dev") || normalizedLabel.includes("개발");
}

function createDefaultSetState(): AgentSetState {
  return {
    threads: [{ id: "agent-1", name: "agent-1" }],
    activeThreadId: "agent-1",
    draft: "",
    attachedFiles: [],
    dashboardInsights: [],
  };
}

function createInitialSetStateMap(setOptions: AgentSetOption[]): Record<string, AgentSetState> {
  return Object.fromEntries(setOptions.map((setOption) => [setOption.id, createDefaultSetState()])) as Record<
    string,
    AgentSetState
  >;
}

export default function AgentsPage({ onQuickAction, topicSnapshots }: AgentsPageProps) {
  const { t } = useI18n();
  const setOptions = useMemo<AgentSetOption[]>(() => {
    const dataSetOptions = DASHBOARD_TOPIC_IDS.map((topic) => ({
      id: `data-${topic}`,
      label: `${t(`dashboard.widget.${topic}.title`)} 세트`,
      description: "데이터 주제 기반 분석/실행 에이전트 세트",
    }));
    const byId = new Map<string, AgentSetOption>();
    const byContentKey = new Set<string>();
    [...AGENT_SET_OPTIONS, ...dataSetOptions].forEach((option) => {
      const contentKey = `${normalizeText(option.label)}::${normalizeText(option.description)}`;
      if (byContentKey.has(contentKey)) {
        return;
      }
      if (!byId.has(option.id)) {
        byContentKey.add(contentKey);
        byId.set(option.id, option);
      }
    });
    return Array.from(byId.values());
  }, [t]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [setStateMap, setSetStateMap] = useState<Record<string, AgentSetState>>(() => {
    return createInitialSetStateMap(setOptions);
  });
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("5.3-Codex");
  const [selectedReasonLevel, setSelectedReasonLevel] = useState("보통");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptions = useMemo<AgentModelOption[]>(
    () => [
      { value: "5.3-Codex", label: "5.3-Codex", allowsReasonLevel: true },
      { value: "5.3-Codex-Spark", label: "5.3-Codex-Spark", allowsReasonLevel: true },
      { value: "5.2-Codex", label: "5.2-Codex", allowsReasonLevel: true },
      { value: "5.1-Codex-Max", label: "5.1-Codex-Max", allowsReasonLevel: true },
      { value: "5.2", label: "5.2", allowsReasonLevel: true },
      { value: "5.1-Codex-Mini", label: "5.1-Codex-Mini", allowsReasonLevel: true },
      { value: "WEB", label: "WEB", allowsReasonLevel: false },
      { value: "Gemini", label: "AI · Gemini", allowsReasonLevel: false },
      { value: "Grok", label: "AI · Grok", allowsReasonLevel: false },
      { value: "Perplexity", label: "AI · Perplexity", allowsReasonLevel: false },
      { value: "Kimi", label: "AI · Kimi", allowsReasonLevel: false },
      { value: "Claude", label: "AI · Claude", allowsReasonLevel: false },
    ],
    [],
  );
  const reasonLevelOptions = useMemo(() => ["낮음", "보통", "높음"], []);
  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.value === selectedModel) ?? modelOptions[0],
    [modelOptions, selectedModel],
  );
  const isReasonLevelSelectable = selectedModelOption?.allowsReasonLevel !== false;
  const setOrderIndexById = useMemo(
    () =>
      setOptions.reduce<Record<string, number>>((acc, option, index) => {
        acc[option.id] = index;
        return acc;
      }, {}),
    [setOptions],
  );
  const groupedSetOptions = useMemo(
    () => [
      {
        id: "general",
        title: "일반",
        items: setOptions.filter((option) => !isDevSetOption(option)),
      },
      {
        id: "dev",
        title: "개발 전용",
        items: setOptions.filter((option) => isDevSetOption(option)),
      },
    ].filter((group) => group.items.length > 0),
    [setOptions],
  );

  useEffect(() => {
    setSetStateMap((prev) => {
      const next = { ...prev };
      for (const setOption of setOptions) {
        if (!next[setOption.id]) {
          next[setOption.id] = createDefaultSetState();
        }
      }
      return next;
    });
  }, [setOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      setSetStateMap((prev) => {
        const next = { ...prev };
        for (const setOption of setOptions) {
          const saved = parsed[setOption.id];
          if (Array.isArray(saved)) {
            const current = next[setOption.id] ?? createDefaultSetState();
            next[setOption.id] = {
              ...current,
              dashboardInsights: saved
                .map((item) => String(item ?? "").trim())
                .filter((item) => item.length > 0)
                .slice(0, 7),
            };
          }
        }
        return next;
      });
    } catch {
      // ignore invalid local storage
    }
  }, [setOptions]);

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
      for (const setOption of setOptions) {
        const current = next[setOption.id] ?? createDefaultSetState();
        next[setOption.id] = {
          ...current,
          dashboardInsights: snapshots,
        };
      }
      if (typeof window !== "undefined") {
        try {
          const toStore: Record<string, string[]> = {};
          for (const setOption of setOptions) {
            toStore[setOption.id] = next[setOption.id]?.dashboardInsights ?? [];
          }
          window.localStorage.setItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY, JSON.stringify(toStore));
        } catch {
          // ignore local storage failures
        }
      }
      return next;
    });
  }, [setOptions, topicSnapshots]);

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
    if (!modelOptions.some((option) => option.value === selectedModel)) {
      setSelectedModel(modelOptions[0].value);
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (isReasonLevelSelectable) {
      return;
    }
    setIsReasonMenuOpen(false);
  }, [isReasonLevelSelectable]);

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
    const reasonTag = isReasonLevelSelectable ? selectedReasonLevel : "N/A";
    const promptWithConfig = `[model=${selectedModel}, reason=${reasonTag}] ${content}`;
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
            <h2>AGENT INDEX</h2>
            <p>세트를 선택하면 해당 에이전트 워크스페이스가 열립니다.</p>
          </header>
          <div className="agents-set-groups">
            {groupedSetOptions.map((group) => (
              <section className="agents-set-group" key={group.id}>
                <h3 className="agents-set-group-title">{group.title}</h3>
                <div className="agents-set-index-head" role="presentation">
                  <span>NO</span>
                  <span>SET</span>
                </div>
                <div className="agents-set-list" role="list" aria-label={`${group.title} Agent sets`}>
                  {group.items.map((setOption) => {
                    const snapshotLine = (setStateMap[setOption.id]?.dashboardInsights[0] ?? "").trim();
                    const mergedPreview = mergeRowPreview(setOption.description, snapshotLine);
                    const orderNo = setOrderIndexById[setOption.id] ?? 0;
                    return (
                      <button
                        className="agents-set-index-row"
                        key={setOption.id}
                        onClick={() => onSelectSet(setOption.id)}
                        role="listitem"
                        type="button"
                      >
                        <span className="agents-set-index-no">{String(orderNo + 1).padStart(2, "0")}</span>
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
                <span>{selectedModelOption?.label ?? selectedModel}</span>
                <img alt="" aria-hidden="true" src="/down-arrow.svg" />
              </button>
              {isModelMenuOpen && (
                <ul aria-label="Agent model" className="agents-model-menu" role="listbox">
                  {modelOptions.map((option) => (
                    <li key={option.value}>
                      <button
                        aria-selected={option.value === selectedModel}
                        className={option.value === selectedModel ? "is-selected" : ""}
                        onClick={() => {
                          setSelectedModel(option.value);
                          setIsModelMenuOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        {option.label}
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
                disabled={!isReasonLevelSelectable}
                onClick={() => {
                  if (!isReasonLevelSelectable) {
                    return;
                  }
                  setIsReasonMenuOpen((prev) => !prev);
                }}
                type="button"
              >
                <span>{isReasonLevelSelectable ? `이성 수준 · ${selectedReasonLevel}` : "이성 수준 · 선택 불가"}</span>
                <img alt="" aria-hidden="true" src="/down-arrow.svg" />
              </button>
              {isReasonMenuOpen && isReasonLevelSelectable && (
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
