import FancySelect from "../../components/FancySelect";
import { knowledgeStatusMeta } from "../../features/workflow/labels";
import { useI18n } from "../../i18n";
import { InspectorSectionTitle } from "../mainAppGraphHelpers";
import type { WorkflowInspectorToolsProps } from "./workflowInspectorTypes";

export default function WorkflowInspectorTools({
  simpleWorkflowUI,
  addNode,
  applyPreset,
  applyCostPreset,
  isPresetKind,
  isCostPreset,
  costPreset,
  costPresetOptions,
  presetTemplateOptions,
  graphFiles,
  selectedGraphFileName,
  setSelectedGraphFileName,
  setGraphFileName,
  loadGraph,
  saveGraph,
  onOpenRenameGraph,
  deleteGraph,
  refreshGraphFiles,
  graphRenameOpen,
  setGraphRenameDraft,
  renameGraph,
  onCloseRenameGraph,
  graphRenameDraft,
  onOpenKnowledgeFilePicker,
  graphKnowledge,
  onToggleKnowledgeFileEnabled,
  onRemoveKnowledgeFile,
  applyGraphChange,
  defaultKnowledgeConfig,
  knowledgeDefaultTopK,
  knowledgeDefaultMaxChars,
  knowledgeTopKOptions,
  knowledgeMaxCharsOptions,
  selectedKnowledgeMaxCharsOption,
}: WorkflowInspectorToolsProps) {
  const { t, tp } = useI18n();

  return (
    <section className="inspector-block">
      <InspectorSectionTitle
        help={t("workflow.graphTools.help")}
        title={t("workflow.graphTools.title")}
      />
      <div className="tool-dropdown-group">
        <h4>{t("workflow.nodeSelect")}</h4>
        <FancySelect
          ariaLabel={t("workflow.nodeSelect")}
          className="modern-select"
          emptyMessage={t("workflow.nodeSelect.empty")}
          onChange={(value) => {
            if (value === "turn") {
              addNode("turn");
            } else if (!simpleWorkflowUI && value === "transform") {
              addNode("transform");
            } else if (!simpleWorkflowUI && value === "gate") {
              addNode("gate");
            }
          }}
          options={
            simpleWorkflowUI
              ? [{ value: "turn", label: t("label.node.turn") }]
              : [
                  { value: "turn", label: t("label.node.turn") },
                  { value: "transform", label: t("label.node.transform") },
                  { value: "gate", label: t("label.node.gate") },
                ]
          }
          placeholder={t("workflow.nodeSelect")}
          value=""
        />
      </div>

      <div className="tool-dropdown-group">
        <h4>{t("workflow.template")}</h4>
        <FancySelect
          ariaLabel={t("workflow.template.select")}
          className="modern-select template-select"
          emptyMessage={t("workflow.template.empty")}
          onChange={(value) => {
            if (isPresetKind(value)) {
              applyPreset(value);
            }
          }}
          options={presetTemplateOptions}
          placeholder={t("workflow.template.select")}
          value=""
        />
      </div>

      <div className="tool-dropdown-group">
        <h4>{t("workflow.costPreset")}</h4>
        <FancySelect
          ariaLabel={t("workflow.costPreset")}
          className="modern-select"
          emptyMessage={tp("선택 가능한 프리셋이 없습니다.")}
          onChange={(value) => {
            if (isCostPreset(value)) {
              applyCostPreset(value);
            }
          }}
          options={costPresetOptions}
          value={costPreset}
        />
      </div>

      <div className="tool-dropdown-group">
        <h4>{t("workflow.graphFile")}</h4>
        <FancySelect
          ariaLabel={t("workflow.graphFile.select")}
          className="graph-file-select modern-select"
          emptyMessage={t("workflow.graphFile.empty")}
          onChange={(value) => {
            if (value) {
              setSelectedGraphFileName(value);
              setGraphFileName(value);
              loadGraph(value);
            }
          }}
          options={graphFiles.map((file) => ({ value: file, label: file }))}
          placeholder={t("workflow.graphFile.select")}
          value={graphFiles.includes(selectedGraphFileName) ? selectedGraphFileName : ""}
        />
        <div className="graph-file-actions">
          <button className="mini-action-button" onClick={saveGraph} type="button">
            <span className="mini-action-button-label">{t("common.save")}</span>
          </button>
          <button className="mini-action-button" onClick={onOpenRenameGraph} type="button">
            <span className="mini-action-button-label">{t("feed.rename")}</span>
          </button>
          <button className="mini-action-button" onClick={deleteGraph} type="button">
            <span className="mini-action-button-label">{t("common.delete")}</span>
          </button>
          <button className="mini-action-button" onClick={refreshGraphFiles} type="button">
            <span className="mini-action-button-label">{tp("새로고침")}</span>
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateRows: graphRenameOpen ? "1fr" : "0fr",
            opacity: graphRenameOpen ? 1 : 0,
            transform: graphRenameOpen ? "translateY(0)" : "translateY(-4px)",
            transition:
              "grid-template-rows 180ms ease, opacity 180ms ease, transform 180ms ease, margin-top 180ms ease",
            marginTop: graphRenameOpen ? "6px" : "0",
            pointerEvents: graphRenameOpen ? "auto" : "none",
          }}
        >
          <div style={{ minHeight: 0, overflow: "hidden", display: "grid", gap: "6px" }}>
            <input
              className="graph-rename-input"
              onChange={(event) => setGraphRenameDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void renameGraph();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCloseRenameGraph();
                }
              }}
              placeholder={t("workflow.graph.renamePlaceholder")}
              style={{
                height: "36px",
                minHeight: "36px",
                maxHeight: "36px",
                borderRadius: "6px",
                padding: "0 12px",
              }}
              value={graphRenameDraft}
            />
            <div className="graph-file-actions">
              <button className="mini-action-button" onClick={() => void renameGraph()} type="button">
                <span className="mini-action-button-label">{t("workflow.graph.applyRename")}</span>
              </button>
              <button className="mini-action-button" onClick={onCloseRenameGraph} type="button">
                <span className="mini-action-button-label">{t("common.cancel")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="tool-dropdown-group">
        <h4>{t("workflow.knowledge.attachments")}</h4>
        <div className="graph-file-actions">
          <button className="mini-action-button" onClick={onOpenKnowledgeFilePicker} type="button">
            <span className="mini-action-button-label">{t("workflow.knowledge.addFile")}</span>
          </button>
        </div>
        <div className="knowledge-file-list">
          {graphKnowledge.files.length === 0 && (
            <div className="knowledge-file-empty">{t("workflow.knowledge.empty")}</div>
          )}
          {graphKnowledge.files.map((file) => {
            const statusMeta = knowledgeStatusMeta(file.status);
            return (
              <div className="knowledge-file-item" key={file.id}>
                <div className="knowledge-file-main">
                  <span className="knowledge-file-name" title={file.path}>
                    {file.name}
                  </span>
                  <span className={`knowledge-status-pill ${statusMeta.tone}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <div className="knowledge-file-actions">
                  <button
                    className={`mini-action-button ${file.enabled ? "is-enabled" : ""}`}
                    onClick={() => onToggleKnowledgeFileEnabled(file.id)}
                    type="button"
                  >
                    <span className="mini-action-button-label">
                      {file.enabled ? t("workflow.knowledge.inUse") : t("workflow.knowledge.exclude")}
                    </span>
                  </button>
                  <button
                    className="mini-action-button"
                    onClick={() => onRemoveKnowledgeFile(file.id)}
                    type="button"
                  >
                    <span className="mini-action-button-label">{t("common.delete")}</span>
                  </button>
                </div>
                {file.statusMessage && <div className="knowledge-file-message">{file.statusMessage}</div>}
              </div>
            );
          })}
        </div>
        <label className="knowledge-config-label">
          {t("workflow.knowledge.topK")}
          <FancySelect
            ariaLabel={t("workflow.knowledge.topK")}
            className="modern-select"
            onChange={(next) => {
              const parsed = Number(next) || knowledgeDefaultTopK;
              applyGraphChange((prev) => ({
                ...prev,
                knowledge: {
                  ...(prev.knowledge ?? defaultKnowledgeConfig()),
                  topK: Math.max(0, Math.min(5, parsed)),
                },
              }));
            }}
            options={knowledgeTopKOptions}
            value={String(graphKnowledge.topK)}
          />
        </label>
        <div className="inspector-empty">{tp("질문과 가장 관련 있는 참고 자료를 몇 개까지 붙일지 정합니다.")}</div>
        <label className="knowledge-config-label">
          {t("workflow.knowledge.length")}
          <FancySelect
            ariaLabel={t("workflow.knowledge.length")}
            className="modern-select"
            onChange={(next) => {
              const parsed = Number(next) || knowledgeDefaultMaxChars;
              applyGraphChange((prev) => ({
                ...prev,
                knowledge: {
                  ...(prev.knowledge ?? defaultKnowledgeConfig()),
                  maxChars: Math.max(300, Math.min(20_000, parsed)),
                },
              }));
            }}
            options={knowledgeMaxCharsOptions}
            value={selectedKnowledgeMaxCharsOption}
          />
        </label>
        <div className="inspector-empty">{tp("길이를 길게 할수록 근거는 늘고, 응답 속도와 사용량은 증가할 수 있습니다.")}</div>
      </div>
    </section>
  );
}
