import { invoke } from "@tauri-apps/api/core";
import { getTurnExecutor, inferQualityProfile, type ArtifactType, type PresetKind, type TurnConfig } from "../features/workflow/domain";
import { extractFinalAnswer, nodeStatusLabel, nodeTypeLabel, turnRoleLabel } from "../features/workflow/labels";
import { stringifyInput, toHumanReadableFeedText } from "../features/workflow/promptUtils";
import { clipTextByChars, formatFeedInputSourceLabel, normalizeFeedInputSources, redactSensitiveText, summarizeFeedSteps } from "../features/feed/displayUtils";
import { graphEquals, turnModelLabel } from "../features/workflow/graph-utils";
import type { GraphData, GraphNode, KnowledgeConfig, NodeAnchorSide, NodeExecutionStatus } from "../features/workflow/types";
import type { FancySelectOption } from "../components/FancySelect";
import { KNOWLEDGE_DEFAULT_MAX_CHARS, KNOWLEDGE_DEFAULT_TOP_K, QUALITY_DEFAULT_THRESHOLD } from "./mainAppGraphHelpers";

export const FEED_REDACTION_RULE_VERSION = "feed-v1";

export const CODEX_MULTI_AGENT_MODE_OPTIONS: ReadonlyArray<FancySelectOption> = [
  { value: "off", label: "끄기" },
  { value: "balanced", label: "균형 (권장)" },
  { value: "max", label: "최고 품질" },
];

export const COST_PRESET_OPTIONS: FancySelectOption[] = [
  { value: "conservative", label: "고사양 (품질 우선)" },
  { value: "balanced", label: "보통 (기본)" },
  { value: "aggressive", label: "저사양 (사용량 절감)" },
];

export const NODE_ANCHOR_SIDES: NodeAnchorSide[] = ["top", "right", "bottom", "left"];

export const QUALITY_PROFILE_OPTIONS: FancySelectOption[] = [
  { value: "code_implementation", label: "코드 구현" },
  { value: "research_evidence", label: "자료/근거 검증" },
  { value: "design_planning", label: "설계/기획" },
  { value: "synthesis_final", label: "최종 종합" },
  { value: "generic", label: "일반" },
];

const QUALITY_THRESHOLD_MIN = 10;
const QUALITY_THRESHOLD_MAX = 100;
const QUALITY_THRESHOLD_STEP = 10;

export const QUALITY_THRESHOLD_OPTIONS: FancySelectOption[] = Array.from(
  { length: (QUALITY_THRESHOLD_MAX - QUALITY_THRESHOLD_MIN) / QUALITY_THRESHOLD_STEP + 1 },
  (_, index) => {
    const score = QUALITY_THRESHOLD_MIN + index * QUALITY_THRESHOLD_STEP;
    return { value: String(score), label: `${score}점` };
  },
);

export function normalizeQualityThreshold(value: unknown): number {
  const parsed = Number(value);
  const fallback = QUALITY_DEFAULT_THRESHOLD;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(QUALITY_THRESHOLD_MIN, Math.min(QUALITY_THRESHOLD_MAX, safe));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}

export function normalizeQualityScore(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}

export const ARTIFACT_TYPE_OPTIONS: FancySelectOption[] = [
  { value: "none", label: "사용 안 함" },
  { value: "RequirementArtifact", label: "요구사항 아티팩트" },
  { value: "DesignArtifact", label: "설계 아티팩트" },
  { value: "TaskPlanArtifact", label: "작업계획 아티팩트" },
  { value: "ChangePlanArtifact", label: "변경계획 아티팩트" },
  { value: "EvidenceArtifact", label: "근거 아티팩트" },
];

export const PRESET_TEMPLATE_META: ReadonlyArray<{ key: PresetKind; label: string; statusLabel: string }> = [
  { key: "validation", label: "정밀 검증 템플릿", statusLabel: "정밀 검증 템플릿" },
  { key: "development", label: "개발 실행 템플릿", statusLabel: "개발 실행 템플릿" },
  { key: "research", label: "근거 리서치 템플릿", statusLabel: "근거 리서치 템플릿" },
  { key: "expert", label: "전문가 분석 템플릿", statusLabel: "전문가 분석 템플릿" },
  { key: "unityGame", label: "유니티 게임개발 템플릿", statusLabel: "유니티 게임개발 템플릿" },
  { key: "fullstack", label: "풀스택 구현 템플릿", statusLabel: "풀스택 구현 템플릿" },
  { key: "creative", label: "창의 제작 템플릿", statusLabel: "창의 제작 템플릿" },
  { key: "newsTrend", label: "뉴스 트렌드 템플릿", statusLabel: "뉴스 트렌드 템플릿" },
  { key: "stock", label: "주식 분석 템플릿", statusLabel: "주식 분석 템플릿" },
];

export const PRESET_TEMPLATE_OPTIONS: FancySelectOption[] = PRESET_TEMPLATE_META.map((row) => ({
  value: row.key,
  label: row.label,
}));

export function presetTemplateLabel(kind: PresetKind): string {
  return PRESET_TEMPLATE_META.find((row) => row.key === kind)?.label ?? "템플릿";
}

export function inferRunGroupMeta(
  currentGraph: GraphData,
  lastPreset: { kind: PresetKind; graph: GraphData } | null,
): { name: string; kind: "template" | "custom"; presetKind?: PresetKind } {
  if (lastPreset && graphEquals(lastPreset.graph, currentGraph)) {
    return {
      name: presetTemplateLabel(lastPreset.kind),
      kind: "template",
      presetKind: lastPreset.kind,
    };
  }
  return {
    name: "사용자 정의",
    kind: "custom",
  };
}

export function isCriticalTurnNode(node: GraphNode): boolean {
  if (node.type !== "turn") {
    return false;
  }
  const config = node.config as TurnConfig;
  const signal = `${node.id} ${String(config.role ?? "")} ${String(config.promptTemplate ?? "")}`.toLowerCase();
  return /final|synth|judge|evaluat|quality|verif|검증|평가|판정|최종|합성/.test(signal);
}

export function buildFeedSummary(status: string, output: unknown, error?: string, summary?: string): string {
  const trimmedSummary = (summary ?? "").trim();
  if (trimmedSummary) {
    return trimmedSummary;
  }
  if (status === "draft") {
    return "에이전트가 현재 작업 중입니다.";
  }
  if (status !== "done") {
    return error?.trim() || "실행 실패로 상세 로그 확인이 필요합니다.";
  }
  const outputText = toHumanReadableFeedText(
    extractFinalAnswer(output).trim() || stringifyInput(output).trim(),
  );
  if (!outputText) {
    return "실행은 완료되었지만 표시할 결과 텍스트가 없습니다.";
  }
  return outputText.length > 360 ? `${outputText.slice(0, 360)}...` : outputText;
}

export function buildFeedPost(input: any): {
  post: any;
  rawAttachments: Record<"markdown" | "json", string>;
} {
  const config = input.node.config as TurnConfig;
  const roleLabel = input.node.type === "turn" ? turnRoleLabel(input.node) : nodeTypeLabel(input.node.type);
  const agentName =
    input.node.type === "turn"
      ? turnModelLabel(input.node)
      : input.node.type === "transform"
        ? "데이터 변환"
        : "결정 분기";
  const logs = input.logs ?? [];
  const steps = summarizeFeedSteps(logs);
  const summary = buildFeedSummary(input.status, input.output, input.error, input.summary);
  const inputSources = normalizeFeedInputSources(input.inputSources);
  const inputContextRaw = toHumanReadableFeedText(stringifyInput(input.inputData).trim());
  const inputContextClip = inputContextRaw ? clipTextByChars(inputContextRaw, 1200) : null;
  const inputContextMasked = inputContextClip ? redactSensitiveText(inputContextClip.text) : "";
  const outputText = toHumanReadableFeedText(
    extractFinalAnswer(input.output).trim() || stringifyInput(input.output).trim(),
  );
  const logsText = logs.length > 0 ? logs.join("\n") : "(로그 없음)";
  const markdownRaw = [
    `# ${agentName}`,
    `- 상태: ${nodeStatusLabel(input.status as NodeExecutionStatus)}`,
    `- 역할: ${roleLabel}`,
    "",
    "## 요약",
    summary || "(없음)",
    ...(inputSources.length > 0
      ? ["", "## 입력 출처", ...inputSources.map((source) => `- ${formatFeedInputSourceLabel(source)}`)]
      : []),
    ...(inputContextMasked
      ? ["", "## 전달 입력 스냅샷", inputContextMasked]
      : []),
    "",
    "## 단계 요약",
    ...steps.map((step) => `- ${step}`),
    "",
    "## 핵심 결과",
    outputText || "(출력 없음)",
    "",
    "## 노드 로그",
    logsText,
    "",
    "## 참고",
    "- 이 문서는 실행 결과를 자동 요약해 생성되었습니다.",
  ].join("\n");

  const jsonRaw = JSON.stringify(
    {
      nodeId: input.node.id,
      nodeType: input.node.type,
      status: input.status,
      summary,
      steps,
      inputSources,
      inputContext: inputContextClip
        ? {
            preview: inputContextMasked,
            charCount: inputContextClip.charCount,
            truncated: inputContextClip.truncated,
          }
        : undefined,
      output: input.output ?? null,
      logs,
      error: input.error ?? null,
      evidence: {
        durationMs: input.durationMs,
        usage: input.usage,
        qualityScore: input.qualityReport?.score,
        qualityDecision: input.qualityReport?.decision,
      },
    },
    null,
    2,
  );

  const markdownClip = clipTextByChars(markdownRaw);
  const jsonClip = clipTextByChars(jsonRaw);

  const markdownMasked = redactSensitiveText(markdownClip.text);
  const jsonMasked = redactSensitiveText(jsonClip.text);

  const post = {
    id: `${input.runId}:${input.node.id}:${input.status}`,
    runId: input.runId,
    nodeId: input.node.id,
    nodeType: input.node.type,
    executor: input.node.type === "turn" ? getTurnExecutor(config) : undefined,
    agentName,
    roleLabel,
    status: input.status,
    createdAt: input.createdAt,
    summary,
    steps,
    inputSources,
    inputContext: inputContextClip
      ? {
          preview: inputContextMasked,
          charCount: inputContextClip.charCount,
          truncated: inputContextClip.truncated,
        }
      : undefined,
    evidence: {
      durationMs: input.durationMs,
      usage: input.usage,
      qualityScore: input.qualityReport?.score,
      qualityDecision: input.qualityReport?.decision,
    },
    attachments: [
      {
        kind: "markdown",
        title: "요약 문서 (Markdown)",
        content: markdownMasked,
        truncated: markdownClip.truncated,
        charCount: markdownClip.charCount,
      },
      {
        kind: "json",
        title: "구조화 결과 (JSON)",
        content: jsonMasked,
        truncated: jsonClip.truncated,
        charCount: jsonClip.charCount,
      },
    ],
    redaction: {
      masked: true,
      ruleVersion: FEED_REDACTION_RULE_VERSION,
    },
  };

  return {
    post,
    rawAttachments: {
      markdown: markdownClip.text,
      json: jsonClip.text,
    },
  };
}

export function normalizeRunFeedPosts(run: any): any[] {
  if (Array.isArray(run.feedPosts)) {
    return run.feedPosts.map((post: any) => ({
      ...post,
      inputSources: normalizeFeedInputSources(post.inputSources),
    }));
  }
  const nodeMap = new Map(run.graphSnapshot.nodes.map((node: any) => [node.id, node]));
  const terminalMap = new Map<string, any>();
  for (const transition of run.transitions) {
    if (transition.status !== "done" && transition.status !== "failed" && transition.status !== "cancelled") {
      continue;
    }
    const prev = terminalMap.get(transition.nodeId);
    if (!prev || new Date(transition.at).getTime() >= new Date(prev.at).getTime()) {
      terminalMap.set(transition.nodeId, transition);
    }
  }

  const posts: any[] = [];
  for (const [nodeId, transition] of terminalMap.entries()) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }
    const logs = run.nodeLogs?.[nodeId] ?? [];
    const metric = run.nodeMetrics?.[nodeId];
    const built = buildFeedPost({
      runId: run.runId,
      node,
      status: transition.status,
      createdAt: transition.at,
      summary: transition.message,
      logs,
      output: {
        nodeId,
        status: transition.status,
        message: transition.message ?? "",
        logs: logs.slice(-10),
      },
      error: transition.status === "failed" ? transition.message : undefined,
      qualityReport: metric
        ? {
            profile: metric.profile,
            threshold: metric.threshold,
            score: metric.score,
            decision: metric.decision,
            checks: [],
            failures: [],
            warnings: [],
          }
        : undefined,
    });
    posts.push(built.post);
  }

  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return posts;
}

export function normalizeRunRecord(run: any): any {
  const feedPosts = normalizeRunFeedPosts(run);
  return {
    ...run,
    feedPosts,
  };
}

export function feedAttachmentRawKey(postId: string, kind: "markdown" | "json"): string {
  return `${postId}:${kind}`;
}

export function parseQualityCommands(input: unknown): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeArtifactOutput(
  nodeId: string,
  artifactType: ArtifactType,
  rawOutput: unknown,
): { output: unknown; warnings: string[] } {
  if (artifactType === "none") {
    return { output: rawOutput, warnings: [] };
  }

  let payload: unknown = rawOutput;
  if (typeof rawOutput === "string") {
    const text = rawOutput.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { text };
      }
    } else {
      payload = { text };
    }
  }

  const warnings: string[] = [];
  if (payload == null || typeof payload !== "object") {
    payload = { text: stringifyInput(rawOutput) };
    warnings.push("아티팩트 변환: 구조화된 출력이 없어 텍스트 기반으로 보정했습니다.");
  }

  const envelope = {
    artifactType,
    version: "v1",
    authorNodeId: nodeId,
    createdAt: new Date().toISOString(),
    payload,
  };

  return {
    output: {
      artifact: envelope,
      text: extractFinalAnswer(rawOutput) || stringifyInput(rawOutput),
      raw: rawOutput,
    },
    warnings,
  };
}

export async function buildQualityReport(params: {
  node: GraphNode;
  config: TurnConfig;
  output: unknown;
  cwd: string;
}): Promise<any> {
  const { node, config, output, cwd } = params;
  const profile = inferQualityProfile(node, config);
  const threshold = normalizeQualityThreshold(config.qualityThreshold ?? QUALITY_DEFAULT_THRESHOLD);
  const checks: any[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const fullText = extractFinalAnswer(output) || stringifyInput(output);
  const normalized = fullText.toLowerCase();

  const addCheck = (input: {
    id: string;
    label: string;
    kind: string;
    required: boolean;
    passed: boolean;
    penalty: number;
    detail?: string;
  }) => {
    if (!input.passed) {
      score = Math.max(0, score - input.penalty);
      if (input.required) {
        failures.push(input.label);
      }
    }
    checks.push({
      id: input.id,
      label: input.label,
      kind: input.kind,
      required: input.required,
      passed: input.passed,
      scoreDelta: input.passed ? 0 : -input.penalty,
      detail: input.detail,
    });
  };

  addCheck({
    id: "non_empty",
    label: "응답 비어있지 않음",
    kind: "structure",
    required: true,
    passed: fullText.trim().length > 0,
    penalty: 40,
  });

  addCheck({
    id: "minimum_length",
    label: "최소 설명 길이",
    kind: "structure",
    required: false,
    passed: fullText.trim().length >= 120,
    penalty: 10,
    detail: "120자 미만이면 요약 부족으로 감점",
  });

  if (profile === "research_evidence") {
    addCheck({
      id: "source_signal",
      label: "근거/출처 신호 포함",
      kind: "evidence",
      required: true,
      passed: /(source|출처|근거|http|https|reference)/i.test(fullText),
      penalty: 20,
    });
    addCheck({
      id: "uncertainty_signal",
      label: "한계/불확실성 표기",
      kind: "consistency",
      required: false,
      passed: /(한계|불확실|리스크|위험|counter|반례|제약)/i.test(fullText),
      penalty: 10,
    });
  } else if (profile === "design_planning") {
    const hits = ["목표", "제약", "리스크", "우선순위", "아키텍처", "scope", "milestone"].filter((key) =>
      normalized.includes(key.toLowerCase()),
    ).length;
    addCheck({
      id: "design_sections",
      label: "설계 핵심 항목 포함",
      kind: "structure",
      required: true,
      passed: hits >= 3,
      penalty: 20,
      detail: "목표/제약/리스크/우선순위 등 3개 이상 필요",
    });
  } else if (profile === "synthesis_final") {
    const hits = ["결론", "근거", "한계", "다음 단계", "실행", "체크리스트"].filter((key) =>
      normalized.includes(key.toLowerCase()),
    ).length;
    addCheck({
      id: "final_structure",
      label: "최종 답변 구조 충족",
      kind: "structure",
      required: true,
      passed: hits >= 3,
      penalty: 20,
      detail: "결론/근거/한계/다음 단계 중 3개 이상",
    });
  } else if (profile === "code_implementation") {
    addCheck({
      id: "code_plan_signal",
      label: "코드/파일/테스트 계획 포함",
      kind: "structure",
      required: true,
      passed: /(file|파일|test|테스트|lint|build|patch|module|class|function)/i.test(fullText),
      penalty: 20,
    });

    if (config.qualityCommandEnabled) {
      const commands = parseQualityCommands(config.qualityCommands);
      if (commands.length === 0) {
        warnings.push("품질 명령 실행이 켜져 있지만 명령 목록이 비어 있습니다.");
      } else {
        try {
          const commandResults = await invoke<any[]>("quality_run_checks", {
            commands,
            cwd,
          });
          const failed = commandResults.find((row) => row.exitCode !== 0);
          addCheck({
            id: "local_commands",
            label: "로컬 품질 명령 통과",
            kind: "local_command",
            required: true,
            passed: !failed,
            penalty: 30,
            detail: failed ? `${failed.name} 실패(exit=${failed.exitCode})` : "모든 명령 성공",
          });
          for (const row of commandResults) {
            if (row.exitCode !== 0 && row.stderrTail.trim()) {
              warnings.push(`[${row.name}] ${row.stderrTail}`);
            }
          }
        } catch (error) {
          addCheck({
            id: "local_commands",
            label: "로컬 품질 명령 통과",
            kind: "local_command",
            required: true,
            passed: false,
            penalty: 30,
            detail: String(error),
          });
        }
      }
    }
  }

  const normalizedScore = normalizeQualityScore(score);
  const decision: "PASS" | "REJECT" = normalizedScore >= threshold ? "PASS" : "REJECT";

  return {
    profile,
    threshold,
    score: normalizedScore,
    decision,
    checks,
    failures,
    warnings,
  };
}

export function summarizeQualityMetrics(nodeMetrics: Record<string, any>): any {
  const rows = Object.values(nodeMetrics);
  if (rows.length === 0) {
    return { avgScore: 0, passRate: 0, totalNodes: 0, passNodes: 0 };
  }
  const passNodes = rows.filter((row: any) => row.decision === "PASS").length;
  const avgScore = rows.reduce((sum: number, row: any) => sum + row.score, 0) / rows.length;
  const passRate = passNodes / rows.length;
  return {
    avgScore: Math.round(avgScore * 100) / 100,
    passRate: Math.round(passRate * 10000) / 100,
    totalNodes: rows.length,
    passNodes,
  };
}

export function defaultKnowledgeConfig(): KnowledgeConfig {
  return {
    files: [],
    topK: KNOWLEDGE_DEFAULT_TOP_K,
    maxChars: KNOWLEDGE_DEFAULT_MAX_CHARS,
  };
}
