import { t } from "../i18n";

export const WORKSPACE_CWD_STORAGE_KEY = "rail.settings.cwd";
export const LOGIN_COMPLETED_STORAGE_KEY = "rail.settings.login_completed";
export const AUTH_MODE_STORAGE_KEY = "rail.settings.auth_mode";
export const CODEX_MULTI_AGENT_MODE_STORAGE_KEY = "rail.settings.codex_multi_agent_mode";

type AuthModeValue = "chatgpt" | "apikey" | "unknown";
type CodexMultiAgentModeValue = "off" | "balanced" | "max";
type UsageStatsValue = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export function formatUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

export function extractStringByPaths(value: unknown, paths: string[]): string | null {
  const walk = (input: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, input);

  for (const path of paths) {
    const found = walk(value, path);
    if (typeof found === "string" && found.trim()) {
      return found.trim();
    }
  }
  return null;
}

export function toErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const message = extractStringByPaths(error, [
      "message",
      "error",
      "details",
      "cause.message",
      "data.message",
    ]);
    if (message) {
      return message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return String(error);
}

export function extractAuthMode(input: unknown, depth = 0): AuthModeValue | null {
  if (depth > 6 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (["chatgpt", "apikey", "unknown"].includes(normalized)) {
      return normalized as AuthModeValue;
    }
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = extractAuthMode(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = asRecord(input);
  if (!record) {
    return null;
  }

  for (const key of ["authMode", "mode", "kind", "value"]) {
    if (key in record) {
      const found = extractAuthMode(record[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  for (const value of Object.values(record)) {
    const found = extractAuthMode(value, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

export function loadPersistedCwd(fallback = "."): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CWD_STORAGE_KEY);
    const parsed = typeof raw === "string" ? raw.trim() : "";
    if (!parsed || parsed === ".") {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function loadPersistedLoginCompleted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(LOGIN_COMPLETED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function loadPersistedAuthMode(): AuthModeValue {
  if (typeof window === "undefined") {
    return "unknown";
  }
  try {
    const raw = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    return extractAuthMode(raw ?? null) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function normalizeCodexMultiAgentMode(value: unknown): CodexMultiAgentModeValue {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "balanced" || raw === "max") {
    return raw;
  }
  return "balanced";
}

export function loadPersistedCodexMultiAgentMode(): CodexMultiAgentModeValue {
  if (typeof window === "undefined") {
    return "balanced";
  }
  try {
    const raw = window.localStorage.getItem(CODEX_MULTI_AGENT_MODE_STORAGE_KEY);
    return normalizeCodexMultiAgentMode(raw);
  } catch {
    return "balanced";
  }
}

export function codexMultiAgentModeLabel(mode: CodexMultiAgentModeValue): string {
  if (mode === "off") {
    return t("option.multi.off");
  }
  if (mode === "max") {
    return t("option.multi.max");
  }
  return t("option.multi.balanced");
}

export function isAbsoluteFsPath(path: string): boolean {
  if (!path) {
    return false;
  }
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

export function resolveNodeCwd(rawCwd: unknown, fallbackCwd: string): string {
  const raw = String(rawCwd ?? "").trim();
  const fallback = String(fallbackCwd ?? "").trim();
  if (!raw || raw === ".") {
    return fallback || raw || ".";
  }
  if (isAbsoluteFsPath(raw)) {
    return raw;
  }
  if (!fallback) {
    return raw;
  }
  const separator = fallback.includes("\\") ? "\\" : "/";
  const base = fallback.replace(/[\\/]+$/, "");
  const rel = raw.replace(/^[\\/]+/, "");
  return `${base}${separator}${rel}`;
}

export function isEngineAlreadyStartedError(error: unknown): boolean {
  const text = toErrorText(error).toLowerCase();
  return text.includes("already started") || text.includes("already running");
}

export function toUsageCheckErrorMessage(error: unknown): string {
  const text = toErrorText(error);
  const lower = text.toLowerCase();
  if (lower.includes("method not found") || lower.includes("지원하지 않는") || lower.includes("not support")) {
    return t("usage.error.unsupported");
  }
  if (lower.includes("forbidden") || lower.includes("unauthorized") || lower.includes("401")) {
    return t("usage.error.unauthorized");
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return t("usage.error.timeout");
  }
  const detail = extractStringByPaths(error, ["message", "error", "details"]);
  if (detail) {
    return detail;
  }
  return text;
}

export function toOpenRunsFolderErrorMessage(error: unknown): string {
  const text = toErrorText(error);
  const lower = text.toLowerCase();
  if (lower.includes("not found") || lower.includes("enoent")) {
    return t("runsFolder.error.notFound");
  }
  if (lower.includes("permission") || lower.includes("denied")) {
    return t("runsFolder.error.permission");
  }
  return text;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  if (["input", "textarea", "select", "button", "option"].includes(tag)) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

export function isNodeDragAllowedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }
  if (target.closest(".node-anchor")) {
    return false;
  }
  if (isEditableTarget(target)) {
    return false;
  }
  return true;
}

export function extractDeltaText(input: unknown, depth = 0): string {
  if (depth > 6 || input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => extractDeltaText(item, depth + 1))
      .filter(Boolean)
      .join("");
  }

  const record = asRecord(input);
  if (!record) {
    return "";
  }

  const directCandidates: unknown[] = [
    record.delta,
    record.text,
    record.content,
    record.output_text,
    record.value,
    asRecord(record.message)?.delta,
    asRecord(record.message)?.content,
    asRecord(record.item)?.delta,
    asRecord(record.item)?.content,
    asRecord(record.event)?.delta,
    asRecord(record.event)?.content,
  ];

  for (const candidate of directCandidates) {
    const extracted = extractDeltaText(candidate, depth + 1);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

export function extractCompletedStatus(input: unknown, depth = 0): string | null {
  if (depth > 6 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (["completed", "done", "success", "succeeded", "failed", "error", "cancelled", "rejected"].includes(normalized)) {
      return normalized;
    }
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = extractCompletedStatus(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const record = asRecord(input);
  if (!record) {
    return null;
  }

  for (const key of ["status", "state", "result", "type"]) {
    if (key in record) {
      const found = extractCompletedStatus(record[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  for (const value of Object.values(record)) {
    const found = extractCompletedStatus(value, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

export function readNumber(value: unknown): number | undefined {
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

export function closestNumericOptionValue(
  options: Array<{ value: string }>,
  target: unknown,
  fallback: number,
): string {
  const parsedTarget = readNumber(target);
  const safeTarget = Number.isFinite(parsedTarget) ? Number(parsedTarget) : fallback;
  let closest = options[0]?.value ?? String(fallback);
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const optionValue = Number(option.value);
    if (!Number.isFinite(optionValue)) {
      continue;
    }
    const distance = Math.abs(optionValue - safeTarget);
    if (distance < closestDistance) {
      closest = option.value;
      closestDistance = distance;
    }
  }

  return closest;
}

export function findUsageObject(input: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !input) {
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findUsageObject(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const looksLikeUsage =
    ["input_tokens", "output_tokens", "total_tokens", "inputTokens", "outputTokens", "totalTokens"].some(
      (key) => key in record,
    );
  if (looksLikeUsage) {
    return record;
  }
  for (const value of Object.values(record)) {
    const found = findUsageObject(value, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

export function extractUsageStats(input: unknown): UsageStatsValue | undefined {
  const usageObject = findUsageObject(input);
  if (!usageObject) {
    return undefined;
  }
  const inputTokens =
    readNumber(usageObject.input_tokens) ??
    readNumber(usageObject.inputTokens) ??
    readNumber(usageObject.prompt_tokens);
  const outputTokens =
    readNumber(usageObject.output_tokens) ??
    readNumber(usageObject.outputTokens) ??
    readNumber(usageObject.completion_tokens);
  const totalTokens =
    readNumber(usageObject.total_tokens) ??
    readNumber(usageObject.totalTokens) ??
    (typeof inputTokens === "number" && typeof outputTokens === "number"
      ? inputTokens + outputTokens
      : undefined);

  if (
    typeof inputTokens !== "number" &&
    typeof outputTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export {
  formatCreditSummary,
  formatDuration,
  formatNodeElapsedTime,
  formatRateLimitBlock,
  formatResetAt,
  formatRunDateTime,
  formatRunFileLabel,
  formatUsage,
  formatUsageInfoForDisplay,
  formatUsedPercent,
  hashStringToHue,
} from "./mainAppFormatUtils";
