import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";

type WorkflowAttachedFile = {
  id: string;
  name: string;
};

type WorkflowQuestionComposerProps = {
  canRunGraphNow: boolean;
  isWorkflowBusy: boolean;
  onRunGraph: () => Promise<void>;
  questionInputRef: RefObject<HTMLTextAreaElement | null>;
  setWorkflowQuestion: (value: string) => void;
  workflowQuestion: string;
};

export default function WorkflowQuestionComposer({
  canRunGraphNow,
  isWorkflowBusy,
  onRunGraph,
  questionInputRef,
  setWorkflowQuestion,
  workflowQuestion,
}: WorkflowQuestionComposerProps) {
  const { t } = useI18n();
  const [attachedFiles, setAttachedFiles] = useState<WorkflowAttachedFile[]>([]);
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

  const onOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const nextFiles: WorkflowAttachedFile[] = Array.from(files).map((file, index) => ({
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

  const onSubmitWorkflowComposer = () => {
    const text = workflowQuestion.trim();
    if (!text && attachedFiles.length === 0) {
      return;
    }
    if (!canRunGraphNow && attachedFiles.length === 0) {
      return;
    }
    if (attachedFiles.length > 0) {
      const attachmentHeader = `files: ${attachedFiles.map((file) => file.name).join(", ")}`;
      const prefixed = text ? `${attachmentHeader}\n${text}` : attachmentHeader;
      const withConfig = `[model=${selectedModel}, reason=${selectedReasonLevel}] ${prefixed}`;
      setWorkflowQuestion(withConfig);
      window.setTimeout(() => {
        void onRunGraph();
      }, 0);
      setAttachedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setWorkflowQuestion(`[model=${selectedModel}, reason=${selectedReasonLevel}] ${text}`);
    window.setTimeout(() => {
      void onRunGraph();
    }, 0);
  };

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (!canRunGraphNow && attachedFiles.length === 0) {
      return;
    }
    onSubmitWorkflowComposer();
  };

  return (
    <div className="question-input agents-composer workflow-question-input">
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
        disabled={isWorkflowBusy}
        onChange={(e) => setWorkflowQuestion(e.currentTarget.value)}
        onKeyDown={onComposerKeyDown}
        placeholder={t("workflow.question.placeholder")}
        ref={questionInputRef}
        rows={1}
        value={workflowQuestion}
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
      <div className="question-input-footer">
        <div className="agents-composer-left">
          <button aria-label="파일 추가" className="agents-icon-button" onClick={onOpenFilePicker} type="button">
            <img alt="" aria-hidden="true" src="/plus.svg" />
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
              <ul aria-label="Workflow model" className="agents-model-menu" role="listbox">
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
              <ul aria-label="Workflow reasoning level" className="agents-reason-menu" role="listbox">
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
        <button
          className="primary-action question-create-button agents-send-button"
          disabled={!canRunGraphNow && attachedFiles.length === 0}
          onClick={onSubmitWorkflowComposer}
          type="button"
        >
          <img alt="" aria-hidden="true" className="question-create-icon" src="/up.svg" />
        </button>
      </div>
    </div>
  );
}
