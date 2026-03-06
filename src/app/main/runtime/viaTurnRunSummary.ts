import type { ViaArtifact } from "./viaBridgeClient";
import {
  summarizeViaHighlights,
  toKoreanReadableText,
  toNonNegativeNumber,
  toRecord,
  toSourceTypeLabel,
  toStringArray,
  toViaStatusLabel,
} from "./viaTurnRunUtils";

export function buildViaTextSummary(params: {
  flowId: number;
  runId: string;
  status: string;
  warnings: string[];
  detail: unknown;
  artifacts: ViaArtifact[];
  preferredSourceType?: string;
}): string {
  const detailRecord = toRecord(params.detail);
  const payload = toRecord(detailRecord?.payload);
  const steps = Array.isArray(detailRecord?.steps) ? detailRecord?.steps : [];
  const highlights = toStringArray(payload?.highlights).slice(0, 8);
  const rankedItems = Array.isArray(payload?.items) ? payload?.items : [];
  const codexBriefing = String(payload?.codex_briefing ?? "").replace(/\r\n?/g, "\n").trim();
  const itemsAllCountRaw = payload?.items_all_count;
  const itemsAllCount =
    typeof itemsAllCountRaw === "number"
      ? itemsAllCountRaw
      : Number.isFinite(Number(itemsAllCountRaw))
        ? Number(itemsAllCountRaw)
        : undefined;
  const coverageRecord = toRecord(payload?.coverage);
  const bySource = toRecord(coverageRecord?.by_source);
  const byCountry = toRecord(coverageRecord?.by_country);
  const byStatus = toRecord(coverageRecord?.by_status);
  const crawlDepth = toRecord(detailRecord?.crawl_depth);
  const enriched = Number(crawlDepth?.items_with_content ?? 0);
  const totalItems = Number(crawlDepth?.items_total ?? 0);
  const statusLabel = toViaStatusLabel(params.status);
  const lines = [`RAG 실행 결과: ${statusLabel}`, `- 실행 ID: ${params.runId}`, `- 산출물: ${params.artifacts.length}개`];
  const codexUsage = toRecord(payload?.codex_usage) ?? toRecord(detailRecord?.codex_usage);
  if (codexUsage) {
    const promptTokens = toNonNegativeNumber(codexUsage.prompt_tokens);
    const completionTokens = toNonNegativeNumber(codexUsage.completion_tokens);
    const totalTokens = toNonNegativeNumber(codexUsage.total_tokens);
    const usageParts = [
      promptTokens !== null ? `입력 ${promptTokens}` : "",
      completionTokens !== null ? `출력 ${completionTokens}` : "",
      totalTokens !== null ? `합계 ${totalTokens}` : "",
    ].filter((row) => row.length > 0);
    if (usageParts.length > 0) {
      lines.push(`- Codex 토큰: ${usageParts.join(" / ")}`);
    }
  }
  if (typeof itemsAllCount === "number" && Number.isFinite(itemsAllCount)) {
    lines.push(`- 수집 항목: ${itemsAllCount}개`);
  }
  if (totalItems > 0) {
    lines.push(`- 본문 확보: ${enriched}/${totalItems}`);
  }

  if (bySource && Object.keys(bySource).length > 0) {
    lines.push("", "소스 커버리지:");
    for (const [sourceType, count] of Object.entries(bySource)) {
      const amount = Number(count ?? 0);
      lines.push(`- ${toSourceTypeLabel(sourceType)}: ${Number.isFinite(amount) ? amount : count}`);
    }
  }

  if (byCountry && Object.keys(byCountry).length > 0) {
    lines.push("", "국가 분포:");
    for (const [country, count] of Object.entries(byCountry)) {
      const amount = Number(count ?? 0);
      lines.push(`- ${country}: ${Number.isFinite(amount) ? amount : count}`);
    }
  }

  if (byStatus && Object.keys(byStatus).length > 0) {
    lines.push("", "검증 상태 분포:");
    for (const [status, count] of Object.entries(byStatus)) {
      const amount = Number(count ?? 0);
      lines.push(`- ${status}: ${Number.isFinite(amount) ? amount : count}`);
    }
  }

  const summarizedHighlights = summarizeViaHighlights(highlights);
  if (summarizedHighlights.length > 0) {
    lines.push("", "핵심 요약:");
    lines.push(...summarizedHighlights.map((line) => `- ${line}`));
  }

  if (codexBriefing) {
    lines.push("", "상세 브리핑:", codexBriefing);
  }
  if (params.warnings.length > 0) {
    lines.push("", `경고 ${params.warnings.length}건:`);
    for (const warning of params.warnings.slice(0, 8)) {
      lines.push(`- ${toKoreanReadableText(warning, 220)}`);
    }
  }
  if (steps.length > 0) {
    lines.push("", `실행 단계: ${steps.length}개`);
  }
  const preferredSourceType = String(params.preferredSourceType ?? "").trim().toLowerCase();
  const preferredItems =
    preferredSourceType && preferredSourceType.startsWith("source.")
      ? rankedItems.filter((row) => {
          const record = toRecord(row);
          const sourceType = String(record?.source_type ?? record?.sourceType ?? "").trim().toLowerCase();
          return sourceType === preferredSourceType;
        })
      : rankedItems;
  const topRows = preferredItems.slice(0, 6);
  if (topRows.length > 0) {
    lines.push("", "핵심 근거:");
    for (const row of topRows) {
      const record = toRecord(row);
      if (!record) {
        continue;
      }
      const title = String(record.title_ko ?? record.title ?? "").trim() || "(no title)";
      const source = String(record.source_name ?? record.sourceName ?? "").trim();
      const sourceType = String(record.source_type ?? record.sourceType ?? "").trim();
      const country = String(record.country ?? "").trim();
      const url = String(record.url ?? "").trim();
      const summary = String(
        record.content_excerpt_ko
          ?? record.summary_ko
          ?? record.content_excerpt
          ?? record.summary
          ?? "",
      )
        .replace(/\s+/g, " ")
        .trim();
      const header = [
        country ? `[${country}]` : "",
        source ? source : toSourceTypeLabel(sourceType),
        toKoreanReadableText(title, 180),
      ]
        .filter((part) => part.length > 0)
        .join(" · ");
      lines.push(`- ${header}`);
      if (url) {
        lines.push(`  - 출처: ${url}`);
      }
      if (summary) {
        lines.push(`  - 요약: ${toKoreanReadableText(summary, 260)}`);
      }
    }
  }
  return lines.join("\n");
}

export function buildViaOutput(params: {
  flowId: number;
  runId: string;
  status: string;
  warnings: string[];
  detail: unknown;
  artifacts: ViaArtifact[];
  preferredSourceType?: string;
}): unknown {
  const timestamp = new Date().toISOString();
  return {
    provider: "via",
    timestamp,
    text: buildViaTextSummary(params),
    artifacts: params.artifacts,
    via: {
      flowId: params.flowId,
      runId: params.runId,
      status: params.status,
      warnings: params.warnings,
      detail: params.detail,
      artifacts: params.artifacts,
    },
  };
}
