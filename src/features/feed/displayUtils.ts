import {
  asRecord,
  extractUsageStats,
  formatResetAt,
  formatUsage,
} from "../../shared/lib/valueUtils";
import { t } from "../../i18n";

type FeedPostStatusValue = "draft" | "done" | "low_quality" | "failed" | "cancelled";
type FeedViewPostLike = {
  agentName: string;
  roleLabel: string;
  nodeId: string;
};
type FeedInputSourceLike = {
  kind: "question" | "node";
  nodeId?: string;
  agentName: string;
  roleLabel?: string;
  summary?: string;
  sourcePostId?: string;
};

export function feedPostStatusLabel(status: FeedPostStatusValue): string {
  switch (status) {
    case "draft":
      return t("feed.status.draft");
    case "done":
      return t("feed.status.done");
    case "low_quality":
      return t("feed.status.low_quality");
    case "failed":
      return t("feed.status.failed");
    case "cancelled":
      return t("feed.status.cancelled");
    default:
      return status;
  }
}

export function hashStringToHue(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function buildFeedAvatarLabel(post: FeedViewPostLike): string {
  const source = post.agentName?.trim() || post.roleLabel?.trim() || post.nodeId;
  return source.slice(0, 1).toUpperCase() || "A";
}

export function formatUsedPercent(input: unknown): string {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return "-";
  }
  const percentText = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  return `${percentText}%`;
}

export function formatCreditSummary(input: unknown): string {
  const credits = asRecord(input);
  if (!credits) {
    return t("common.noneSimple");
  }
  const balance =
    typeof credits.balance === "string" || typeof credits.balance === "number"
      ? String(credits.balance)
      : "-";
  const hasCredits = credits.hasCredits === true;
  const unlimited = credits.unlimited === true;
  if (unlimited) {
    return t("common.unlimited");
  }
  if (!hasCredits) {
    return t("common.noneSimple");
  }
  return t("usage.balance", { balance });
}

export function formatRateLimitBlock(title: string, source: Record<string, unknown>): string[] {
  const lines: string[] = [title];
  const planType = typeof source.planType === "string" && source.planType.trim() ? source.planType : "-";
  const limitId = typeof source.limitId === "string" && source.limitId.trim() ? source.limitId : "-";
  lines.push(`- ${t("usage.planType")}: ${planType}`);
  lines.push(`- ${t("usage.limitId")}: ${limitId}`);
  lines.push(`- ${t("usage.credit")}: ${formatCreditSummary(source.credits)}`);

  const primary = asRecord(source.primary);
  if (primary) {
    lines.push(
      `- ${t("usage.window.primary")}: ${t("usage.used")} ${formatUsedPercent(primary.usedPercent)} / ${t("usage.reset")} ${formatResetAt(primary.resetsAt)}`,
    );
  }
  const secondary = asRecord(source.secondary);
  if (secondary) {
    lines.push(
      `- ${t("usage.window.secondary")}: ${t("usage.used")} ${formatUsedPercent(secondary.usedPercent)} / ${t("usage.reset")} ${formatResetAt(secondary.resetsAt)}`,
    );
  }
  return lines;
}

export function formatUsageInfoForDisplay(raw: unknown): string {
  const root = asRecord(raw);
  if (!root) {
    return JSON.stringify(raw, null, 2);
  }

  const lines: string[] = [];
  const tokenUsage = extractUsageStats(raw);
  if (tokenUsage) {
    lines.push(`${t("usage.token")}: ${formatUsage(tokenUsage)}`);
  }
  const rateLimits = asRecord(root.rateLimits);
  if (rateLimits) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(...formatRateLimitBlock(t("usage.limit.current"), rateLimits));
  }

  const byLimitId = asRecord(root.rateLimitsByLimitId);
  if (byLimitId) {
    const entries = Object.entries(byLimitId)
      .map(([limitKey, value]) => {
        const item = asRecord(value);
        if (!item) {
          return null;
        }
        const rawName = typeof item.limitName === "string" ? item.limitName.trim() : "";
        const rawId =
          typeof item.limitId === "string" && item.limitId.trim() ? item.limitId.trim() : limitKey.trim();
        const name = rawName || rawId || limitKey;
        const header = rawId && rawId !== name ? `${name} (${rawId})` : name;
        return { header, item };
      })
      .filter(Boolean) as Array<{ header: string; item: Record<string, unknown> }>;

    if (entries.length > 0) {
      lines.push("");
      lines.push(t("usage.limit.byModel"));
      for (const entry of entries) {
        lines.push(...formatRateLimitBlock(`- ${entry.header}`, entry.item));
        lines.push("");
      }
      while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
    }
  }

  if (lines.length > 0) {
    return lines.join("\n");
  }

  return JSON.stringify(raw, null, 2);
}

export function redactSensitiveText(input: string, ruleVersion = "feed-v1"): string {
  const text = String(input ?? "");
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]")
    .replace(/(sk-[A-Za-z0-9]{8,})/g, "[REDACTED_KEY]")
    .replace(/("token"\s*:\s*")[^"]+("\s*)/gi, `$1[REDACTED]$2`)
    .replace(/("access_token"\s*:\s*")[^"]+("\s*)/gi, `$1[REDACTED]$2`)
    .replace(/("authorization"\s*:\s*")[^"]+("\s*)/gi, `$1[REDACTED]$2`)
    .replace(/(쿠키|cookie)\s*[:=]\s*[^\n]+/gi, "$1: [REDACTED]")
    .replace(/(session[_-]?id\s*[:=]\s*)[^\n\s]+/gi, "$1[REDACTED]")
    .concat(ruleVersion ? "" : "");
}

export function clipTextByChars(input: string, maxChars = 12_000): {
  text: string;
  truncated: boolean;
  charCount: number;
} {
  const charCount = input.length;
  if (charCount <= maxChars) {
    return { text: input, truncated: false, charCount };
  }
  return {
    text: `${input.slice(0, maxChars)}\n\n...(${t("common.truncated")})`,
    truncated: true,
    charCount,
  };
}

export function summarizeFeedSteps(logs: string[], placeholder = t("feed.steps.empty")): string[] {
  const lines = logs
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .slice(-40);

  if (lines.length === 0) {
    return [placeholder];
  }

  const important = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return (
      normalized.includes("[품질]") ||
      normalized.includes("error") ||
      normalized.includes("실패") ||
      normalized.includes("timeout") ||
      normalized.includes("reject") ||
      normalized.includes("pass") ||
      normalized.includes("cancel") ||
      normalized.includes("중지") ||
      normalized.includes("done") ||
      normalized.includes("완료")
    );
  });

  if (important.length === 0) {
    return [placeholder];
  }

  return important.slice(-5);
}

export function normalizeFeedSteps(steps: string[], placeholder = t("feed.steps.empty")): string[] {
  const placeholderCompact = placeholder.replace(/\s+/g, "").toLowerCase();
  const seen = new Set<string>();
  return steps
    .map((step) => String(step ?? "").trim())
    .filter(Boolean)
    .filter((step) => {
      const compact = step.replace(/\s+/g, "").toLowerCase();
      if (compact.includes(placeholderCompact)) {
        return false;
      }
      if (seen.has(step)) {
        return false;
      }
      seen.add(step);
      return true;
    });
}

export function normalizeFeedInputSources(input: unknown): FeedInputSourceLike[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const rows: FeedInputSourceLike[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const raw = row as Record<string, unknown>;
    const kind = raw.kind === "question" ? "question" : raw.kind === "node" ? "node" : null;
    const agentName = String(raw.agentName ?? "").trim();
    if (!kind || !agentName) {
      continue;
    }
    rows.push({
      kind,
      nodeId: typeof raw.nodeId === "string" ? raw.nodeId : undefined,
      agentName,
      roleLabel: typeof raw.roleLabel === "string" ? raw.roleLabel : undefined,
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      sourcePostId: typeof raw.sourcePostId === "string" ? raw.sourcePostId : undefined,
    });
  }
  return rows;
}

export function formatFeedInputSourceLabel(source: FeedInputSourceLike): string {
  if (source.kind === "question") {
    return t("feed.source.userQuestion");
  }
  const pieces: string[] = [source.agentName];
  if (source.roleLabel) {
    pieces.push(source.roleLabel);
  }
  if (source.nodeId) {
    pieces.push(source.nodeId);
  }
  const head = pieces.join(" · ");
  const summary = (source.summary ?? "").trim();
  if (!summary) {
    return head;
  }
  const clipped = summary.length > 110 ? `${summary.slice(0, 110)}...` : summary;
  return `${head} — ${clipped}`;
}
