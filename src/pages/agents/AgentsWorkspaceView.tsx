import { useEffect, useState, type ChangeEvent, type RefObject } from "react";
import type { CodexMultiAgentMode } from "./agentPrompt";
import type { AgentModelOption, AgentSetOption, AgentThread, AttachedFile } from "./agentTypes";

const THREAD_NAME_KO_LABELS: Record<string, string> = {
  "crawler-agent": "크롤러 에이전트",
  "rag-analyst": "RAG 분석 에이전트",
  "snapshot-synthesizer": "스냅샷 합성 에이전트",
  "signal-scout": "시그널 스카우트",
  "risk-analyst": "리스크 분석 에이전트",
  "briefing-lead": "브리핑 리드",
  "content-planner": "콘텐츠 기획 에이전트",
  "content-writer": "콘텐츠 작성 에이전트",
  "quality-reviewer": "품질 검수 에이전트",
  "spec-architect": "명세 설계 에이전트",
  "implementation-agent": "구현 에이전트",
  "verification-agent": "검증 에이전트",
  "planner-agent": "계획 에이전트",
  "executor-agent": "실행 에이전트",
};

function toKoreanThreadName(name: string): string {
  const normalized = String(name ?? "").trim();
  if (!normalized) {
    return "에이전트";
  }
  const mapped = THREAD_NAME_KO_LABELS[normalized];
  if (mapped) {
    return mapped;
  }
  const customMatch = /^agent-(\d+)$/i.exec(normalized);
  if (customMatch) {
    return `에이전트-${customMatch[1]}`;
  }
  return normalized;
}

type AgentsWorkspaceViewProps = {
  t: (key: string) => string;
  threads: AgentThread[];
  activeThread: AgentThread | null;
  activeThreadId: string;
  activeSetOption: AgentSetOption | null;
  setMission: string;
  dashboardInsights: string[];
  codexMultiAgentMode: CodexMultiAgentMode;
  onSetActiveThreadId: (threadId: string) => void;
  onBackToSetList: () => void;
  onRestoreTemplateSet: () => void;
  onAddThread: () => void;
  onCloseThread: (threadId: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  draft: string;
  onSetDraft: (value: string) => void;
  attachedFiles: AttachedFile[];
  onOpenFilePicker: () => void;
  isModelMenuOpen: boolean;
  setIsModelMenuOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  modelMenuRef: RefObject<HTMLDivElement | null>;
  selectedModelOptionLabel: string;
  selectedModel: string;
  modelOptions: AgentModelOption[];
  onSelectModel: (model: string) => void;
  isReasonMenuOpen: boolean;
  setIsReasonMenuOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  reasonMenuRef: RefObject<HTMLDivElement | null>;
  isReasonLevelSelectable: boolean;
  selectedReasonLevel: string;
  reasonLevelOptions: string[];
  onSelectReasonLevel: (level: string) => void;
  onSend: () => void;
  sendDisabled: boolean;
  onQueuePrompt: (prompt: string) => void;
};

export function AgentsWorkspaceView({
  t,
  threads,
  activeThread,
  activeThreadId,
  activeSetOption,
  setMission,
  dashboardInsights,
  codexMultiAgentMode,
  onSetActiveThreadId,
  onBackToSetList,
  onRestoreTemplateSet,
  onAddThread,
  onCloseThread,
  fileInputRef,
  onAttachFiles,
  draft,
  onSetDraft,
  attachedFiles,
  onOpenFilePicker,
  isModelMenuOpen,
  setIsModelMenuOpen,
  modelMenuRef,
  selectedModelOptionLabel,
  selectedModel,
  modelOptions,
  onSelectModel,
  isReasonMenuOpen,
  setIsReasonMenuOpen,
  reasonMenuRef,
  isReasonLevelSelectable,
  selectedReasonLevel,
  reasonLevelOptions,
  onSelectReasonLevel,
  onSend,
  sendDisabled,
  onQueuePrompt,
}: AgentsWorkspaceViewProps) {
  const [isSetBriefVisible, setIsSetBriefVisible] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsSetBriefVisible(true);
  }, [activeSetOption?.id]);

  const quickActionItems = [
    {
      id: "set-mission",
      label: "세트 미션 기반 실행",
      prompt: `${activeSetOption?.label ?? "현재 세트"} 기준으로 우선순위 3개를 정리하고 바로 실행해줘.`,
    },
    {
      id: "active-agent",
      label: "활성 에이전트 실행",
      prompt: activeThread?.starterPrompt || "활성 에이전트 역할 기준으로 바로 실행해줘.",
    },
    {
      id: "snapshot-briefing",
      label: "최신 스냅샷 브리핑",
      prompt: "최신 데이터 스냅샷을 바탕으로 highlights/risks/actions 3개씩 한국어로 정리해줘.",
    },
  ];

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
          <button className="agents-restore-template-button" onClick={onRestoreTemplateSet} type="button">
            ↺ 템플릿 복원
          </button>
          <button className="agents-back-button" onClick={onBackToSetList} type="button">
            ← 세트 목록
          </button>
          <button className="agents-add-thread-button" onClick={onAddThread} type="button">
            + {t("agents.add")}
          </button>
        </div>
      </div>

      <section className={`agents-workspace-shell${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
        <section className="agents-workspace-main">
          {activeSetOption && isSetBriefVisible ? (
            <section className="agents-set-brief" aria-label="Selected set briefing">
              <div className="agents-set-brief-head">
                <strong>{activeSetOption.label}</strong>
                <button
                  aria-label={`${activeSetOption.label} ${t("agents.off")}`}
                  className="agents-off-button"
                  onClick={() => setIsSetBriefVisible(false)}
                  title={t("agents.off")}
                  type="button"
                >
                  <img alt="" aria-hidden="true" src="/close.svg" />
                </button>
              </div>
              <p>{setMission || activeSetOption.description}</p>
              <small>{`Codex Multi-Agent: ${codexMultiAgentMode}`}</small>
            </section>
          ) : null}
          <section
            className={`agents-grid${threads.length === 1 ? " is-single" : threads.length === 2 ? " is-two" : ""}`}
            aria-label="Agents grid"
          >
            {threads.map((thread) => {
              const displayThreadName = toKoreanThreadName(thread.name);
              return (
                <article
                  key={thread.id}
                  className={`panel-card agents-grid-card${thread.id === activeThreadId ? " is-active" : ""}`}
                  onClick={() => onSetActiveThreadId(thread.id)}
                >
                  <div className="agents-grid-card-head">
                    <strong>{displayThreadName}</strong>
                    <button
                      aria-label={`${displayThreadName} ${t("agents.off")}`}
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
                  <div className="agents-grid-card-log" aria-label={`${displayThreadName} 로그`}>
                    <p className="agents-grid-card-role">{thread.role}</p>
                    {thread.guidance.length > 0 ? (
                      <ul className="agents-grid-card-guidance">
                        {thread.guidance.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="agents-grid-card-placeholder">가이드가 없는 사용자 정의 에이전트입니다.</p>
                    )}
                    {thread.starterPrompt ? <p className="agents-grid-card-starter">{thread.starterPrompt}</p> : null}
                  </div>
                  <div className="agents-grid-card-foot">
                    <span>{thread.id === activeThreadId ? "Active" : "Standby"}</span>
                    <span>{thread.status === "preset" ? "Preset" : "Custom"}</span>
                  </div>
                </article>
              );
            })}
          </section>
        </section>

        <aside
          className={`panel-card agents-workspace-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}
          aria-label="Agent workspace sidebar"
        >
          <div className="agents-workspace-sidebar-head">
            <button
              aria-label={isSidebarCollapsed ? "사이드바 확대" : "사이드바 최소화"}
              className="agents-off-button agents-sidebar-toggle-button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              title={isSidebarCollapsed ? "사이드바 확대" : "사이드바 최소화"}
              type="button"
            >
              <img alt="" aria-hidden="true" src={isSidebarCollapsed ? "/open.svg" : "/close.svg"} />
            </button>
          </div>

          {!isSidebarCollapsed ? (
            <>
              <section className="agents-sidebar-card">
                <h4>브리핑</h4>
                <p>{setMission || activeSetOption?.description || "세트 설명이 없습니다."}</p>
                <small>{`Mode: ${codexMultiAgentMode}`}</small>
              </section>

              <section className="agents-sidebar-card">
                <h4>활성 에이전트</h4>
                <p className="agents-sidebar-agent-name">{activeThread?.name ?? "-"}</p>
                <p className="agents-sidebar-agent-role">{activeThread?.role ?? "선택된 에이전트 없음"}</p>
                {activeThread?.starterPrompt ? <small>{activeThread.starterPrompt}</small> : null}
              </section>

              <section className="agents-sidebar-card">
                <div className="agents-sidebar-card-head">
                  <h4>데이터 스냅샷</h4>
                </div>
                <ul className="agents-sidebar-list">
                  {(dashboardInsights.length > 0 ? dashboardInsights : ["스냅샷 데이터가 없습니다."]).slice(0, 6).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              <section className="agents-sidebar-card">
                <h4>액션 큐</h4>
                <div className="agents-sidebar-actions">
                  {quickActionItems.map((item) => (
                    <button key={item.id} onClick={() => onQueuePrompt(item.prompt)} type="button">
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </aside>
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
                <span>{selectedModelOptionLabel || selectedModel}</span>
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
                          onSelectModel(option.value);
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
                          onSelectReasonLevel(level);
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
              disabled={sendDisabled}
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
