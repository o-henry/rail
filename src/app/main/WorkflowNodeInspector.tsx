import FancySelect from "../../components/FancySelect";
import {
  getWebProviderFromExecutor,
  normalizeWebResultMode,
  toTurnModelDisplayName,
  type TurnConfig,
} from "../../features/workflow/domain";
import { turnRoleLabel } from "../../features/workflow/labels";
import type { GateConfig, TransformConfig } from "../../features/workflow/types";
import { useI18n } from "../../i18n";
import { InspectorSectionTitle } from "../mainAppGraphHelpers";
import type { WorkflowInspectorNodeProps } from "./workflowInspectorTypes";

export default function WorkflowNodeInspector({
  simpleWorkflowUI,
  selectedNode,
  selectedTurnExecutor,
  updateSelectedNodeConfig,
  turnExecutorOptions,
  turnExecutorLabel,
  turnModelOptions,
  model,
  cwd,
  selectedTurnConfig,
  selectedQualityProfile,
  qualityProfileOptions,
  selectedQualityThresholdOption,
  qualityThresholdOptions,
  normalizeQualityThreshold,
  artifactTypeOptions,
  selectedArtifactType,
  outgoingNodeOptions,
}: WorkflowInspectorNodeProps) {
  const { t } = useI18n();

  if (!selectedNode) {
    return null;
  }

  return (
    <>
      {selectedNode.type === "turn" && (
        <section className="inspector-block form-grid">
          <InspectorSectionTitle
            help="실행기, 모델, 역할, 프롬프트를 설정해 해당 에이전트의 동작을 정의합니다."
            title="에이전트 설정"
          />
          <label>
            에이전트
            <FancySelect
              ariaLabel="Turn 에이전트"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("executor", next)}
              options={turnExecutorOptions.map((option) => ({
                value: option,
                label: turnExecutorLabel(option),
              }))}
              value={selectedTurnExecutor}
            />
          </label>
          {selectedTurnExecutor === "codex" && (
            <label>
              모델
              <FancySelect
                ariaLabel="노드 모델"
                className="modern-select"
                onChange={(next) => updateSelectedNodeConfig("model", next)}
                options={turnModelOptions.map((option) => ({ value: option, label: option }))}
                value={toTurnModelDisplayName(String((selectedNode.config as TurnConfig).model ?? model))}
              />
            </label>
          )}
          {selectedTurnExecutor === "ollama" && (
            <label>
              Ollama 모델
              <input
                onChange={(e) => updateSelectedNodeConfig("ollamaModel", e.currentTarget.value)}
                placeholder="예: llama3.1:8b"
                value={String((selectedNode.config as TurnConfig).ollamaModel ?? "llama3.1:8b")}
              />
            </label>
          )}
          {selectedTurnExecutor === "codex" && (
            <label>
              작업 경로
              <input
                className="lowercase-path-input"
                onChange={(e) => updateSelectedNodeConfig("cwd", e.currentTarget.value)}
                value={String((selectedNode.config as TurnConfig).cwd ?? cwd)}
              />
            </label>
          )}
          {getWebProviderFromExecutor(selectedTurnExecutor) && (
            <>
              <label>
                웹 결과 모드
                <FancySelect
                  ariaLabel="웹 결과 모드"
                  className="modern-select"
                  onChange={(next) => updateSelectedNodeConfig("webResultMode", next)}
                  options={[
                    { value: "bridgeAssisted", label: t("feed.webMode.bridge") },
                    { value: "manualPasteText", label: t("feed.webMode.text") },
                    { value: "manualPasteJson", label: t("feed.webMode.json") },
                  ]}
                  value={String(normalizeWebResultMode((selectedNode.config as TurnConfig).webResultMode))}
                />
              </label>
              <label>
                자동화 타임아웃(ms)
                <input
                  onChange={(e) =>
                    updateSelectedNodeConfig("webTimeoutMs", Number(e.currentTarget.value) || 180_000)
                  }
                  type="number"
                  value={String((selectedNode.config as TurnConfig).webTimeoutMs ?? 180_000)}
                />
              </label>
              <div className="inspector-empty">
                웹 연결 반자동은 질문 자동 주입/답변 자동 수집을 시도하고, 실패 시 수동 입력으로 폴백합니다.
              </div>
            </>
          )}
          <label>
            역할
            <input
              onChange={(e) => updateSelectedNodeConfig("role", e.currentTarget.value)}
              placeholder={turnRoleLabel(selectedNode)}
              value={String((selectedNode.config as TurnConfig).role ?? "")}
            />
          </label>
          <label>
            첨부 참고 사용
            <FancySelect
              ariaLabel="첨부 참고 사용"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("knowledgeEnabled", next === "true")}
              options={[
                { value: "true", label: t("feed.option.enabled") },
                { value: "false", label: t("feed.option.disabled") },
              ]}
              value={String((selectedNode.config as TurnConfig).knowledgeEnabled !== false)}
            />
          </label>
          <label>
            품질 프로필
            <FancySelect
              ariaLabel="품질 프로필"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("qualityProfile", next)}
              options={qualityProfileOptions}
              value={selectedQualityProfile}
            />
          </label>
          <label>
            품질 통과 기준 점수
            <FancySelect
              ariaLabel="품질 통과 기준 점수"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("qualityThreshold", normalizeQualityThreshold(next))}
              options={qualityThresholdOptions}
              value={selectedQualityThresholdOption}
            />
          </label>
          {selectedQualityProfile === "code_implementation" && (
            <>
              <label>
                로컬 품질 명령 실행
                <FancySelect
                  ariaLabel="로컬 품질 명령 실행"
                  className="modern-select"
                  onChange={(next) => updateSelectedNodeConfig("qualityCommandEnabled", next === "true")}
                  options={[
                    { value: "false", label: t("feed.option.disabled") },
                    { value: "true", label: t("feed.option.enabled") },
                  ]}
                  value={String(selectedTurnConfig?.qualityCommandEnabled === true)}
                />
              </label>
              <label>
                품질 명령 목록(줄바꿈 구분)
                <textarea
                  className="prompt-template-textarea"
                  onChange={(e) => updateSelectedNodeConfig("qualityCommands", e.currentTarget.value)}
                  rows={3}
                  value={String(selectedTurnConfig?.qualityCommands ?? "npm run build")}
                />
              </label>
            </>
          )}
          {!simpleWorkflowUI && (
            <label>
              출력 형식(아티팩트)
              <FancySelect
                ariaLabel="출력 형식(아티팩트)"
                className="modern-select"
                onChange={(next) => updateSelectedNodeConfig("artifactType", next)}
                options={artifactTypeOptions}
                value={selectedArtifactType}
              />
            </label>
          )}
          <label>
            출력 스키마(JSON, 선택)
            <textarea
              className="prompt-template-textarea"
              onChange={(e) => updateSelectedNodeConfig("outputSchemaJson", e.currentTarget.value)}
              rows={4}
              value={String((selectedNode.config as TurnConfig).outputSchemaJson ?? "")}
            />
          </label>
          <label>
            프롬프트 템플릿
            <textarea
              className="prompt-template-textarea"
              onChange={(e) => updateSelectedNodeConfig("promptTemplate", e.currentTarget.value)}
              rows={6}
              value={String((selectedNode.config as TurnConfig).promptTemplate ?? "{{input}}")}
            />
          </label>
        </section>
      )}

      {!simpleWorkflowUI && selectedNode.type === "transform" && (
        <section className="inspector-block form-grid">
          <InspectorSectionTitle
            help="앞 노드 결과를 읽기 쉬운 형태로 다시 정리하는 설정입니다. 쉽게 말해, 필요한 것만 꺼내거나, 고정 정보를 붙이거나, 문장 틀에 맞춰 다시 쓰는 역할입니다."
            title="결과 정리 설정"
          />
          <label>
            정리 방식
            <FancySelect
              ariaLabel="정리 방식"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("mode", next)}
              options={[
                { value: "pick", label: t("transform.mode.pick") },
                { value: "merge", label: t("transform.mode.merge") },
                { value: "template", label: t("transform.mode.template") },
              ]}
              value={String((selectedNode.config as TransformConfig).mode ?? "pick")}
            />
          </label>
          <label>
            꺼낼 값 위치
            <input
              onChange={(e) => updateSelectedNodeConfig("pickPath", e.currentTarget.value)}
              placeholder="예: text 또는 result.finalDraft"
              value={String((selectedNode.config as TransformConfig).pickPath ?? "")}
            />
          </label>
          <div className="inspector-empty">예를 들어 `text`를 쓰면 결과에서 text 부분만 가져옵니다.</div>
          <label>
            덧붙일 고정 정보(JSON)
            <textarea
              onChange={(e) => updateSelectedNodeConfig("mergeJson", e.currentTarget.value)}
              placeholder='예: {"source":"web","priority":"high"}'
              rows={3}
              value={String((selectedNode.config as TransformConfig).mergeJson ?? "{}")}
            />
          </label>
          <div className="inspector-empty">예: {"`{\"출처\":\"웹조사\"}`"}를 넣으면 모든 결과에 같은 정보를 붙입니다.</div>
          <label>
            문장 틀
            <textarea
              className="transform-template-textarea"
              onChange={(e) => updateSelectedNodeConfig("template", e.currentTarget.value)}
              rows={5}
              value={String((selectedNode.config as TransformConfig).template ?? "{{input}}")}
            />
          </label>
          <div className="inspector-empty">
            {"`{{input}}`"} 자리에 이전 결과가 들어갑니다. 원하는 문장 형태로 바꿀 때 사용합니다.
          </div>
        </section>
      )}

      {!simpleWorkflowUI && selectedNode.type === "gate" && (
        <section className="inspector-block form-grid">
          <InspectorSectionTitle
            help="이 노드는 결과를 보고 길을 나눕니다. DECISION 값이 PASS면 통과 경로로, REJECT면 재검토 경로로 보냅니다."
            title="결정 나누기 설정"
          />
          <label>
            판단값 위치(DECISION)
            <input
              onChange={(e) => updateSelectedNodeConfig("decisionPath", e.currentTarget.value)}
              value={String((selectedNode.config as GateConfig).decisionPath ?? "DECISION")}
            />
          </label>
          <div className="inspector-empty">보통 `DECISION`을 사용합니다. 값은 PASS 또는 REJECT(대문자)여야 합니다.</div>
          <label>
            통과(PASS) 다음 노드
            <FancySelect
              ariaLabel="통과 다음 노드"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("passNodeId", next)}
              options={[{ value: "", label: t("common.none") }, ...outgoingNodeOptions]}
              value={String((selectedNode.config as GateConfig).passNodeId ?? "")}
            />
          </label>
          <div className="inspector-empty">결과가 좋으면(통과) 어디로 보낼지 선택합니다.</div>
          <label>
            재검토(REJECT) 다음 노드
            <FancySelect
              ariaLabel="재검토 다음 노드"
              className="modern-select"
              onChange={(next) => updateSelectedNodeConfig("rejectNodeId", next)}
              options={[{ value: "", label: t("common.none") }, ...outgoingNodeOptions]}
              value={String((selectedNode.config as GateConfig).rejectNodeId ?? "")}
            />
          </label>
          <div className="inspector-empty">결과가 부족하면(재검토) 어디로 보낼지 선택합니다.</div>
          <label>
            결과 형식 검사(선택)
            <textarea
              onChange={(e) => updateSelectedNodeConfig("schemaJson", e.currentTarget.value)}
              rows={4}
              value={String((selectedNode.config as GateConfig).schemaJson ?? "")}
            />
          </label>
          <div className="inspector-empty">고급 옵션입니다. 결과가 원하는 형식인지 자동 검사할 때만 사용하세요.</div>
        </section>
      )}

      {simpleWorkflowUI && selectedNode.type !== "turn" && (
        <section className="inspector-block form-grid">
          <InspectorSectionTitle
            help="이 노드는 시스템이 내부적으로 사용하는 자동 처리 노드입니다."
            title="내부 처리 노드"
          />
          <div className="inspector-empty">단순 모드에서는 이 노드 설정을 직접 편집하지 않습니다.</div>
        </section>
      )}
    </>
  );
}
