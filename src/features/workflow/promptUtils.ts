import { extractStringByPaths, formatUnknown } from "../../shared/lib/valueUtils";
import type { AppLocale } from "../../i18n";

export function getByPath(input: unknown, path: string): unknown {
  if (!path.trim()) {
    return input;
  }

  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function stringifyInput(input: unknown): string {
  if (input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  return formatUnknown(input);
}

export function extractPromptInputText(input: unknown, depth = 0): string {
  if (depth > 5 || input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input.trim();
  }
  if (Array.isArray(input)) {
    const parts = input
      .map((item) => extractPromptInputText(item, depth + 1))
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("\n\n");
    }
    return stringifyInput(input).trim();
  }
  if (typeof input !== "object") {
    return stringifyInput(input).trim();
  }

  const direct = extractStringByPaths(input, [
    "text",
    "output.text",
    "result.text",
    "completion.text",
    "response.text",
    "payload.text",
    "artifact.payload.text",
    "artifact.text",
    "data.text",
    "raw.text",
  ]);
  if (direct && direct.trim()) {
    return direct.trim();
  }

  const record = input as Record<string, unknown>;
  const nestedCandidates = [
    record.output,
    record.result,
    record.response,
    record.payload,
    record.artifact,
    record.data,
    record.item,
  ];
  for (const candidate of nestedCandidates) {
    const extracted = extractPromptInputText(candidate, depth + 1);
    if (extracted) {
      return extracted;
    }
  }

  return stringifyInput(input).trim();
}

export function decodeEscapedControlText(input: string): string {
  const source = String(input ?? "");
  if (!source) {
    return "";
  }
  const escapedControlCount = (source.match(/\\n|\\r\\n|\\t/g) ?? []).length;
  if (escapedControlCount === 0) {
    return source;
  }
  return source
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

export function tryParseJsonText(input: string): unknown | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function extractReadableTextFromPayload(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? trimmed : null;
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  const row = input as Record<string, unknown>;
  const directCandidates: unknown[] = [
    row.text,
    row.content,
    row.message,
    (row.payload as Record<string, unknown> | undefined)?.text,
    (row.payload as Record<string, unknown> | undefined)?.content,
    (row.artifact as Record<string, unknown> | undefined)?.text,
    ((row.artifact as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined)?.text,
    (row.output as Record<string, unknown> | undefined)?.text,
    (row.response as Record<string, unknown> | undefined)?.text,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export function toHumanReadableFeedText(input: string): string {
  let current = String(input ?? "").trim();
  if (!current) {
    return "";
  }

  current = decodeEscapedControlText(current).trim();

  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = tryParseJsonText(current);
    if (parsed == null) {
      break;
    }

    const extracted = extractReadableTextFromPayload(parsed);
    if (extracted) {
      const next = decodeEscapedControlText(extracted).trim();
      if (next && next !== current) {
        current = next;
        continue;
      }
    }

    current = JSON.stringify(parsed, null, 2);
    break;
  }

  return current;
}

export function replaceInputPlaceholder(template: string, value: string): string {
  return template.split("{{input}}").join(value);
}

export function normalizeWebComparableText(input: string): string {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectWebPromptNeedles(promptText: string): string[] {
  const normalized = normalizeWebComparableText(promptText);
  if (!normalized) {
    return [];
  }
  const len = normalized.length;
  const needleLen = len >= 512 ? 96 : len >= 220 ? 72 : 48;
  if (len <= needleLen) {
    return [normalized];
  }
  const offsets = [
    0,
    Math.max(0, Math.floor(len * 0.2) - Math.floor(needleLen / 2)),
    Math.max(0, Math.floor(len * 0.45) - Math.floor(needleLen / 2)),
    Math.max(0, Math.floor(len * 0.7) - Math.floor(needleLen / 2)),
    Math.max(0, len - needleLen),
  ];
  const unique = new Set<string>();
  for (const start of offsets) {
    const needle = normalized.slice(start, start + needleLen).trim();
    if (needle.length >= 32) {
      unique.add(needle);
    }
  }
  return Array.from(unique);
}

export function isLikelyWebPromptEcho(outputText: string, promptText: string): boolean {
  const candidate = normalizeWebComparableText(outputText);
  const prompt = normalizeWebComparableText(promptText);
  if (!candidate || !prompt) {
    return false;
  }
  if (
    /^나의 말[:：]/i.test(candidate) ||
    /^you said[:：]/i.test(candidate) ||
    /^your message[:：]/i.test(candidate) ||
    /^user[:：]/i.test(candidate)
  ) {
    return true;
  }
  if (candidate === prompt || candidate.startsWith(prompt)) {
    return true;
  }
  const start = prompt.slice(0, 120);
  const end = prompt.slice(-120);
  if (start.length >= 40 && candidate.includes(start)) {
    return true;
  }
  if (end.length >= 40 && candidate.includes(end)) {
    return true;
  }
  const needles = collectWebPromptNeedles(prompt);
  if (needles.length > 0) {
    let hits = 0;
    for (const needle of needles) {
      if (candidate.includes(needle)) {
        hits += 1;
      }
      if (hits >= 2) {
        return true;
      }
    }
  }
  return false;
}

export function buildForcedAgentRuleBlock(docs: Array<{ path: string; content: string }>): string {
  if (docs.length === 0) {
    return "";
  }

  const parts = docs.map((doc, index) => {
    const content = doc.content.trim();
    return `## 규칙 문서 ${index + 1}: ${doc.path}\n${content}`;
  });

  return [
    "[SYSTEM 강제 규칙]",
    "아래 AGENT/SKILL 규칙은 선택사항이 아니며 반드시 준수해야 합니다.",
    "규칙 충돌 시 문서에 명시된 우선순위를 따르고, 없으면 더 구체적인 규칙을 우선합니다.",
    "",
    ...parts,
    "[/SYSTEM 강제 규칙]",
  ].join("\n");
}

export function buildCodexMultiAgentDirective(mode: "off" | "balanced" | "max"): string {
  if (mode === "off") {
    return "";
  }

  const qualityRules =
    mode === "max"
      ? [
          "- 최소 3개 이상의 하위 에이전트를 병렬 사용해 서로 다른 관점(근거, 반례, 실행계획)으로 검토하라.",
          "- 불확실하거나 충돌하는 항목은 누락하지 말고 명시적으로 분리 보고하라.",
          "- 최종 답변 전 자기검증 단계(누락/모순/근거 부족)를 수행하라.",
        ]
      : [
          "- 작업을 2~3개 하위 에이전트 단위로 분해하고 병렬 처리하라.",
          "- 중간 로그 대신 핵심 요약만 수집해 컨텍스트 오염을 줄여라.",
          "- 결과 통합 전 근거 일관성을 점검하라.",
        ];

  return [
    "[CODEx MULTI-AGENT ORCHESTRATION]",
    "복잡한 작업은 반드시 하위 에이전트(sub-agent) 병렬 실행으로 처리하라.",
    "각 하위 에이전트는 역할을 분리하고, 산출물은 짧은 구조화 요약으로 제출하라.",
    "모든 하위 에이전트 결과를 확인한 뒤 최종 통합 답변을 작성하라.",
    ...qualityRules,
    "[/CODEx MULTI-AGENT ORCHESTRATION]",
  ].join("\n");
}

export function buildFinalVisualizationDirective(): string {
  return [
    "[시각화 출력 지침]",
    "- 최종 문서 이해를 돕는 차트/도표가 필요할 때만 포함하세요.",
    "- 시각 자료가 더 적합하면 관련 이미지도 포함하세요(신뢰 가능한 출처 URL만).",
    '- 이미지는 Markdown 형식 `![설명](https://...)`으로 작성하세요.',
    "- 차트는 아래 포맷의 fenced code block으로 작성하세요.",
    "- 언어 태그는 반드시 rail-chart 를 사용하세요.",
    "```rail-chart",
    "{",
    '  "type": "bar|line|pie",',
    '  "title": "차트 제목",',
    '  "labels": ["항목1", "항목2"],',
    '  "series": [',
    '    { "name": "시리즈명", "data": [10, 20], "color": "#4A7BFF" }',
    "  ]",
    "}",
    "```",
    "- 본문은 일반 Markdown 형식으로 작성하세요.",
  ].join("\n");
}

export function buildOutputSchemaDirective(schemaRaw: string): string {
  const trimmed = String(schemaRaw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  let prettySchema = trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    prettySchema = JSON.stringify(parsed, null, 2);
  } catch {
    return "";
  }

  return [
    "[OUTPUT SCHEMA CONTRACT]",
    "아래 JSON 스키마를 반드시 만족하는 결과만 출력하세요.",
    "설명문/서론/결론 없이 스키마에 맞는 결과만 출력하세요.",
    "```json",
    prettySchema,
    "```",
    "[/OUTPUT SCHEMA CONTRACT]",
  ].join("\n");
}

const OUTPUT_LANGUAGE_BLOCK_START = "[RAIL OUTPUT LANGUAGE]";
const OUTPUT_LANGUAGE_BLOCK_END = "[/RAIL OUTPUT LANGUAGE]";

function stripOutputLanguageDirective(input: string): string {
  return String(input ?? "")
    .replace(/\[RAIL OUTPUT LANGUAGE\][\s\S]*?\[\/RAIL OUTPUT LANGUAGE\]\s*/g, "")
    .trimStart();
}

export function buildOutputLanguageDirective(locale: AppLocale): string {
  if (locale === "ko") {
    return [
      OUTPUT_LANGUAGE_BLOCK_START,
      "- 최종 답변은 반드시 한국어로 작성하라.",
      "- 영어 고유명사/라이브러리명/코드 식별자는 원문 표기를 유지할 수 있다.",
      "- 설명/요약/목록/표 캡션까지 모두 한국어를 우선 사용하라.",
      OUTPUT_LANGUAGE_BLOCK_END,
    ].join("\n");
  }

  if (locale === "en") {
    return [
      OUTPUT_LANGUAGE_BLOCK_START,
      "- Write the final answer strictly in English.",
      "- Keep proper nouns, library names, and code identifiers in their original form.",
      "- Use English consistently for headings, bullets, summaries, and table/chart captions.",
      OUTPUT_LANGUAGE_BLOCK_END,
    ].join("\n");
  }

  if (locale === "jp") {
    return [
      OUTPUT_LANGUAGE_BLOCK_START,
      "- 最終回答は必ず日本語で作成してください。",
      "- 固有名詞、ライブラリ名、コード識別子は原文表記を維持して構いません。",
      "- 見出し、箇条書き、要約、表・チャートの説明も日本語を優先してください。",
      OUTPUT_LANGUAGE_BLOCK_END,
    ].join("\n");
  }

  return [
    OUTPUT_LANGUAGE_BLOCK_START,
    "- 最终回答必须使用中文。",
    "- 专有名词、库名称、代码标识符可保留原文。",
    "- 标题、列表、摘要、表格/图表说明等内容请统一使用中文。",
    OUTPUT_LANGUAGE_BLOCK_END,
  ].join("\n");
}

export function injectOutputLanguageDirective(template: string, locale: AppLocale): string {
  const body = stripOutputLanguageDirective(template);
  const directive = buildOutputLanguageDirective(locale);
  if (!directive) {
    return body;
  }
  return `${directive}\n\n${body}`.trim();
}
