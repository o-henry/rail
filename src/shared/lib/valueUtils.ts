export type UsageStats = {
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

function findUsageObject(input: unknown, depth = 0): Record<string, unknown> | null {
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

export function extractUsageStats(input: unknown): UsageStats | undefined {
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
    (typeof inputTokens === "number" && typeof outputTokens === "number" ? inputTokens + outputTokens : undefined);

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

export function formatUsage(usage?: UsageStats): string {
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
