import { getCurrentLocale, t, type AppLocale } from "../i18n";

type UsageStatsValue = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type NodeRunStateLike = {
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return "-";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}초`;
}

export function formatNodeElapsedTime(runState: NodeRunStateLike | undefined, nowMs: number): string {
  if (!runState?.startedAt) {
    return "-";
  }
  const startedAtMs = new Date(runState.startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) {
    return "-";
  }
  const endedAtMs = runState.finishedAt ? new Date(runState.finishedAt).getTime() : nowMs;
  const elapsed = Math.max(0, endedAtMs - startedAtMs);
  return formatDuration(elapsed);
}

export function formatUsage(usage?: UsageStatsValue): string {
  if (!usage) {
    return "-";
  }
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  if (!totalTokens) {
    return "-";
  }
  return `${totalTokens} tok (${inputTokens}/${outputTokens})`;
}

function toDateLocaleTag(locale: AppLocale): string {
  if (locale === "ko") {
    return "ko-KR";
  }
  if (locale === "jp") {
    return "ja-JP";
  }
  if (locale === "zh") {
    return "zh-CN";
  }
  return "en-US";
}

export function formatRunDateTime(input?: string | null): string {
  if (!input) {
    return "-";
  }
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) {
    return input;
  }
  const locale = getCurrentLocale();
  const localeTag = toDateLocaleTag(locale);
  return date.toLocaleString(localeTag);
}

export function formatRunFileLabel(fileName?: string | null): string {
  if (!fileName) {
    return "-";
  }
  return fileName.toUpperCase();
}

export function formatResetAt(input: unknown): string {
  const value = readNumber(input);
  if (typeof value !== "number") {
    return "-";
  }
  const ms = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }
  return formatRunDateTime(date.toISOString());
}

export function hashStringToHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) % 360;
  }
  return Math.abs(hash) % 360;
}

export function formatUsedPercent(input: unknown): string {
  const value = readNumber(input);
  if (typeof value !== "number") {
    return "-";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, normalized)).toFixed(0)}%`;
}

export function formatCreditSummary(input: unknown): string {
  if (!input || typeof input !== "object") {
    return t("common.noneSimple");
  }
  const record = input as Record<string, unknown>;
  const unlimited = Boolean(record.unlimited);
  if (unlimited) {
    return t("common.unlimited");
  }
  const hasCredits = Boolean(record.hasCredits);
  const balance = String(record.balance ?? "0").trim() || "0";
  return hasCredits ? t("usage.balance", { balance }) : t("common.noneSimple");
}

export function formatRateLimitBlock(title: string, source: Record<string, unknown>): string[] {
  const lines = [title];
  const planType = String(source.planType ?? "-").trim() || "-";
  const limitId = String(source.limitId ?? "-").trim() || "-";
  const limitNameRaw = source.limitName;
  const limitName = typeof limitNameRaw === "string" && limitNameRaw.trim() ? limitNameRaw.trim() : "";
  const primary = asRecord(source.primary) ?? {};
  const secondary = asRecord(source.secondary) ?? {};

  lines.push(`- ${t("usage.planType")}: ${planType}`);
  if (limitName) {
    lines.push(`- ${t("usage.limitName")}: ${limitName}`);
  }
  lines.push(`- ${t("usage.limitId")}: ${limitId}`);
  lines.push(`- ${t("usage.credit")}: ${formatCreditSummary(source.credits)}`);
  lines.push(
    `- ${t("usage.window.primary")}: ${t("usage.used")} ${formatUsedPercent(primary.usedPercent)} / ${t("usage.reset")} ${formatResetAt(primary.resetsAt)}`,
  );
  lines.push(
    `- ${t("usage.window.secondary")}: ${t("usage.used")} ${formatUsedPercent(secondary.usedPercent)} / ${t("usage.reset")} ${formatResetAt(secondary.resetsAt)}`,
  );
  return lines;
}

export function formatUsageInfoForDisplay(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return JSON.stringify(raw, null, 2);
  }
  const record = raw as Record<string, unknown>;
  const sections: string[] = [];

  const primaryLimit = asRecord(record.rateLimits);
  if (primaryLimit) {
    sections.push(...formatRateLimitBlock(t("usage.limit.current"), primaryLimit));
  }

  const byId = asRecord(record.rateLimitsByLimitId);
  if (byId) {
    sections.push("", t("usage.limit.byModel"));
    for (const [key, value] of Object.entries(byId)) {
      const row = asRecord(value);
      if (!row) {
        continue;
      }
      const limitNameRaw = row.limitName;
      const limitName = typeof limitNameRaw === "string" && limitNameRaw.trim() ? limitNameRaw.trim() : "";
      const title = limitName ? `- ${limitName} (${key})` : `- ${key}`;
      sections.push(...formatRateLimitBlock(title, row));
      sections.push("");
    }
    while (sections[sections.length - 1] === "") {
      sections.pop();
    }
  }

  if (sections.length > 0) {
    return sections.join("\n");
  }

  return JSON.stringify(raw, null, 2);
}
