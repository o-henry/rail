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
type NodeRunStateLike = {
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
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
    return parsed || fallback;
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
    return "끄기";
  }
  if (mode === "max") {
    return "최고 품질";
  }
  return "균형";
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
    return "사용량 조회 API를 지원하지 않는 엔진 버전입니다. 엔진 실행/로그인은 정상이어도 사용량은 현재 버전에서 조회할 수 없습니다.";
  }
  if (lower.includes("forbidden") || lower.includes("unauthorized") || lower.includes("401")) {
    return "사용량 조회 권한이 없습니다. 코덱스 로그인을 다시 시도해주세요.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "사용량 조회가 시간 초과되었습니다. 잠시 후 다시 시도해주세요.";
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
    return "실행 기록 폴더를 찾을 수 없습니다. 먼저 실행을 한 번 완료해 주세요.";
  }
  if (lower.includes("permission") || lower.includes("denied")) {
    return "실행 기록 폴더를 열 권한이 없습니다.";
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
  const endedAtMs = runState.finishedAt
    ? new Date(runState.finishedAt).getTime()
    : runState.status === "running" || runState.status === "queued"
      ? nowMs
      : nowMs;
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

export function formatRunDateTime(input?: string | null): string {
  if (!input) {
    return "-";
  }
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) {
    return input;
  }
  return date.toLocaleString("ko-KR");
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
    return "없음";
  }
  const record = input as Record<string, unknown>;
  const unlimited = Boolean(record.unlimited);
  if (unlimited) {
    return "무제한";
  }
  const hasCredits = Boolean(record.hasCredits);
  const balance = String(record.balance ?? "0").trim() || "0";
  return hasCredits ? `잔액 ${balance}` : "없음";
}

export function formatRateLimitBlock(title: string, source: Record<string, unknown>): string[] {
  const lines = [title];
  const planType = String(source.planType ?? "-").trim() || "-";
  const limitId = String(source.limitId ?? "-").trim() || "-";
  const limitNameRaw = source.limitName;
  const limitName = typeof limitNameRaw === "string" && limitNameRaw.trim() ? limitNameRaw.trim() : "";
  const primary = asRecord(source.primary) ?? {};
  const secondary = asRecord(source.secondary) ?? {};

  lines.push(`- 요금제: ${planType}`);
  if (limitName) {
    lines.push(`- 한도명: ${limitName}`);
  }
  lines.push(`- 한도 ID: ${limitId}`);
  lines.push(`- 크레딧: ${formatCreditSummary(source.credits)}`);
  lines.push(
    `- 기본 윈도우 (5시간): 사용량 ${formatUsedPercent(primary.usedPercent)} / 리셋 ${formatResetAt(primary.resetsAt)}`,
  );
  lines.push(
    `- 보조 윈도우 (1주일): 사용량 ${formatUsedPercent(secondary.usedPercent)} / 리셋 ${formatResetAt(secondary.resetsAt)}`,
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
    sections.push(...formatRateLimitBlock("현재 한도", primaryLimit));
  }

  const byId = asRecord(record.rateLimitsByLimitId);
  if (byId) {
    sections.push("", "모델별 한도");
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
