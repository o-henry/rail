import type { ChangeEvent, RefObject } from "react";
import type { CodexMultiAgentMode } from "./agentPrompt";
import type { AgentModelOption, AgentSetOption, AgentThread, AttachedFile } from "./agentTypes";

type AgentsWorkspaceViewProps = {
  t: (key: string) => string;
  threads: AgentThread[];
  activeThreadId: string;
  activeSetOption: AgentSetOption | null;
  setMission: string;
  codexMultiAgentMode: CodexMultiAgentMode;
  onSetActiveThreadId: (threadId: string) => void;
  onBackToSetList: () => void;
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
};

export function AgentsWorkspaceView({
  t,
  threads,
  activeThreadId,
  activeSetOption,
  setMission,
  codexMultiAgentMode,
  onSetActiveThreadId,
  onBackToSetList,
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
}: AgentsWorkspaceViewProps) {
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
      {activeSetOption ? (
        <section className="agents-set-brief" aria-label="Selected set briefing">
          <strong>{activeSetOption.label}</strong>
          <p>{setMission || activeSetOption.description}</p>
          <small>{`Codex Multi-Agent: ${codexMultiAgentMode}`}</small>
        </section>
      ) : null}

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
