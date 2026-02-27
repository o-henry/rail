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
    row.finalDraft,
    row.text,
    row.content,
    row.message,
    (row.payload as Record<string, unknown> | undefined)?.finalDraft,
    (row.payload as Record<string, unknown> | undefined)?.text,
    (row.payload as Record<string, unknown> | undefined)?.content,
    ((row.artifact as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined)?.finalDraft,
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
