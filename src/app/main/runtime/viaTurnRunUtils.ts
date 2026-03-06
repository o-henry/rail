export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(() => resolve(), ms);
  });
}

export function normalizeRunStatus(status: string): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  return normalized;
}

export function isTerminalStatus(status: string): boolean {
  const normalized = normalizeRunStatus(status);
  return (
    normalized === "done" ||
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "cancelled"
  );
}

export function toRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

export function toNonNegativeNumber(input: unknown): number | null {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((row) => String(row ?? "").trim())
    .filter((row) => row.length > 0);
}

export function parseCsvList(input: unknown, maxItems = 12): string[] {
  const text = String(input ?? "").trim();
  if (!text) {
    return [];
  }
  const normalized = text.replace(/\r\n?/g, "\n");
  const rows = normalized
    .split(/[\n,]+/g)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const unique = Array.from(new Set(rows));
  return unique.slice(0, maxItems);
}

export function normalizeWhitespace(input: string): string {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function hasKorean(input: string): boolean {
  return /[가-힣]/.test(String(input ?? ""));
}

export function toKoreanReadableText(input: unknown, maxLength = 260): string {
  const normalized = normalizeWhitespace(String(input ?? ""));
  if (!normalized) {
    return "";
  }
  const clipped = normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  if (hasKorean(clipped)) {
    return clipped;
  }
  return `원문: ${clipped}`;
}

export function toViaStatusLabel(status: string): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "done") {
    return "완료";
  }
  if (normalized === "running") {
    return "실행 중";
  }
  if (normalized === "failed" || normalized === "error") {
    return "실패";
  }
  if (normalized === "cancelled") {
    return "취소";
  }
  return normalized || "알 수 없음";
}

export function toSourceTypeLabel(input: string): string {
  const normalized = String(input ?? "").trim().toLowerCase();
  if (normalized === "source.news") return "뉴스";
  if (normalized === "source.sns" || normalized === "source.x" || normalized === "source.threads") return "SNS";
  if (normalized === "source.community" || normalized === "source.reddit") return "커뮤니티";
  if (normalized === "source.dev" || normalized === "source.hn") return "개발 커뮤니티";
  if (normalized === "source.market") return "주식/마켓";
  return normalized || "기타";
}

function summarizeViaHighlight(line: string): string {
  const raw = normalizeWhitespace(line);
  if (!raw) {
    return "";
  }
  const marker = raw.indexOf(":");
  if (marker < 0) {
    return toKoreanReadableText(raw, 220);
  }
  const prefix = raw.slice(0, marker).trim();
  const body = raw.slice(marker + 1).trim();
  const localizedBody = toKoreanReadableText(body, 220);
  return [prefix, localizedBody].filter(Boolean).join(": ");
}

export function formatViaStepLog(stepInput: unknown): string {
  const step = toRecord(stepInput);
  if (!step) {
    return "";
  }
  const nodeId = String(step.node_id ?? step.nodeId ?? "node").trim() || "node";
  const status = String(step.status ?? "").trim() || "unknown";
  const outputSummary = String(step.output_summary ?? step.outputSummary ?? "").trim();
  const error = String(step.error ?? "").trim();
  const message = [`[VIA:${nodeId}]`, status];
  if (outputSummary) {
    message.push(`· ${outputSummary}`);
  }
  if (error) {
    message.push(`· ${error}`);
  }
  return message.join(" ");
}

export function summarizeViaHighlights(lines: string[]): string[] {
  return lines
    .map((line) => summarizeViaHighlight(line))
    .filter((line) => line.length > 0);
}
