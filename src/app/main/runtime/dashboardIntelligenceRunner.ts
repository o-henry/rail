import { extractStringByPaths } from "../../../shared/lib/valueUtils";
import {
  DASHBOARD_TOPIC_IDS,
  buildDashboardFallbackSnapshot,
  buildDashboardTopicPrompt,
  normalizeDashboardSnapshot,
  parseDashboardSnapshotText,
  type DashboardTopicAgentConfig,
  type DashboardTopicId,
  type DashboardTopicSnapshot,
} from "../../../features/dashboard/intelligence";
import type { KnowledgeFileRef } from "../../../features/workflow/types";
import type { KnowledgeRetrieveResult, ThreadStartResult } from "../types";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type DashboardCrawlRunResult = {
  startedAt: string;
  finishedAt: string;
  totalFetched: number;
  totalFiles: number;
  topics: Array<{
    topic: string;
    fetchedCount: number;
    savedFiles: string[];
    errors: string[];
  }>;
};

type RunDashboardTopicParams = {
  cwd: string;
  topic: DashboardTopicId;
  config: DashboardTopicAgentConfig;
  invokeFn: InvokeFn;
  previousSnapshot?: DashboardTopicSnapshot;
};

type RunDashboardTopicResult = {
  snapshot: DashboardTopicSnapshot;
  crawlResult: DashboardCrawlRunResult;
  rawPaths: string[];
  warnings: string[];
};

function isDashboardTopicId(value: unknown): value is DashboardTopicId {
  return DASHBOARD_TOPIC_IDS.includes(value as DashboardTopicId);
}

function topicQueryText(topic: DashboardTopicId): string {
  switch (topic) {
    case "marketSummary":
      return "market summary index volatility sector movers";
    case "globalHeadlines":
      return "global headline geopolitics economy technology";
    case "industryTrendRadar":
      return "industry trend momentum signal acceleration";
    case "communityHotTopics":
      return "community hot topics social mentions growth";
    case "eventCalendar":
      return "event calendar upcoming schedule deadline";
    case "riskAlertBoard":
      return "risk alert compliance security warning";
    case "devEcosystem":
      return "developer ecosystem release breaking change migration";
    default:
      return topic;
  }
}

function summarizeSnippets(snippets: KnowledgeRetrieveResult["snippets"]): string[] {
  return snippets
    .slice(0, 6)
    .map((snippet) => snippet.text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0)
    .map((text) => (text.length > 220 ? `${text.slice(0, 220)}...` : text));
}

async function runCrawlerForTopic(params: {
  cwd: string;
  topic: DashboardTopicId;
  config: DashboardTopicAgentConfig;
  invokeFn: InvokeFn;
}): Promise<DashboardCrawlRunResult> {
  return params.invokeFn<DashboardCrawlRunResult>("dashboard_crawl_run", {
    cwd: params.cwd,
    topics: [params.topic],
    maxSourcesPerTopic: params.config.maxSources,
    allowlistByTopic: {
      [params.topic]: params.config.allowlist,
    },
  });
}

async function collectKnowledgeSnippets(params: {
  cwd: string;
  topic: DashboardTopicId;
  config: DashboardTopicAgentConfig;
  invokeFn: InvokeFn;
}): Promise<{
  rawPaths: string[];
  retrieve: KnowledgeRetrieveResult;
}> {
  const rawPaths = await params.invokeFn<string[]>("dashboard_raw_list", {
    cwd: params.cwd,
    topic: params.topic,
    limit: Math.max(6, params.config.maxSources * 6),
  });
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    return {
      rawPaths: [],
      retrieve: { snippets: [], warnings: ["raw files not found"] },
    };
  }

  const normalizedPaths = rawPaths
    .map((path) => String(path ?? "").trim())
    .filter((path) => path.length > 0)
    .slice(0, params.config.maxSources * 6);
  const probed = await params.invokeFn<KnowledgeFileRef[]>("knowledge_probe", { paths: normalizedPaths });
  const validFiles = probed.filter((file) => file.enabled && (file.status === "ready" || !file.status));
  if (validFiles.length === 0) {
    return {
      rawPaths: normalizedPaths,
      retrieve: { snippets: [], warnings: ["knowledge probe returned no valid files"] },
    };
  }

  const retrieve = await params.invokeFn<KnowledgeRetrieveResult>("knowledge_retrieve", {
    files: validFiles,
    query: topicQueryText(params.topic),
    topK: params.config.maxSnippets,
    maxChars: params.config.maxSnippetChars,
  });
  return { rawPaths: normalizedPaths, retrieve };
}

function buildSnapshotWithoutCodex(params: {
  topic: DashboardTopicId;
  model: string;
  snippets: KnowledgeRetrieveResult["snippets"];
  warnings: string[];
}): DashboardTopicSnapshot {
  return buildDashboardFallbackSnapshot(params.topic, params.model, {
    summary:
      params.snippets.length > 0
        ? "Codex response was unavailable. Generated fallback summary from retrieved snippets."
        : "No snippets retrieved from crawler outputs.",
    highlights: summarizeSnippets(params.snippets),
    risks: params.warnings.slice(0, 4),
    events: [],
    references: [],
    status: "degraded",
    statusMessage: params.warnings.join(" | ") || "Codex response unavailable",
    referenceEmpty: true,
  });
}

export async function runDashboardTopicIntelligence(params: RunDashboardTopicParams): Promise<RunDashboardTopicResult> {
  const crawlResult = await runCrawlerForTopic({
    cwd: params.cwd,
    topic: params.topic,
    config: params.config,
    invokeFn: params.invokeFn,
  });

  const knowledge = await collectKnowledgeSnippets({
    cwd: params.cwd,
    topic: params.topic,
    config: params.config,
    invokeFn: params.invokeFn,
  });
  const warnings = [...knowledge.retrieve.warnings];

  const prompt = buildDashboardTopicPrompt({
    topic: params.topic,
    config: params.config,
    snippets: knowledge.retrieve.snippets,
    previousSnapshot: params.previousSnapshot,
  });

  let snapshot: DashboardTopicSnapshot;
  try {
    const threadStart = await params.invokeFn<ThreadStartResult>("thread_start", {
      model: params.config.model,
      cwd: params.cwd,
    });
    const turnStartResponse = await params.invokeFn<unknown>("turn_start", {
      threadId: threadStart.threadId,
      text: prompt,
    });
    const responseText =
      extractStringByPaths(turnStartResponse, [
        "text",
        "output_text",
        "turn.output_text",
        "turn.response.output_text",
        "turn.response.text",
        "response.output_text",
        "response.text",
      ]) ?? "";

    if (responseText.trim()) {
      snapshot = parseDashboardSnapshotText(params.topic, params.config.model, responseText);
    } else {
      snapshot = buildSnapshotWithoutCodex({
        topic: params.topic,
        model: params.config.model,
        snippets: knowledge.retrieve.snippets,
        warnings: [...warnings, "empty codex response"],
      });
    }
  } catch (error) {
    snapshot = buildSnapshotWithoutCodex({
      topic: params.topic,
      model: params.config.model,
      snippets: knowledge.retrieve.snippets,
      warnings: [...warnings, `codex error: ${String(error)}`],
    });
  }

  if (knowledge.retrieve.snippets.length === 0) {
    snapshot = normalizeDashboardSnapshot(params.topic, params.config.model, {
      ...snapshot,
      referenceEmpty: true,
      status: snapshot.status ?? "degraded",
      statusMessage: snapshot.statusMessage ?? "RAG snippet was empty",
    });
  }

  await params.invokeFn<string>("dashboard_snapshot_save", {
    cwd: params.cwd,
    topic: params.topic,
    snapshotJson: snapshot,
  });

  return {
    snapshot,
    crawlResult,
    rawPaths: knowledge.rawPaths,
    warnings,
  };
}

export async function runDashboardCrawlerOnly(params: {
  cwd: string;
  configByTopic: Record<DashboardTopicId, DashboardTopicAgentConfig>;
  topics?: DashboardTopicId[];
  invokeFn: InvokeFn;
}) {
  const selected = (params.topics ?? DASHBOARD_TOPIC_IDS).filter((topic) => params.configByTopic[topic]?.enabled);
  const allowlistByTopic = selected.reduce<Record<string, string[]>>((acc, topic) => {
    acc[topic] = params.configByTopic[topic].allowlist;
    return acc;
  }, {});
  return params.invokeFn<DashboardCrawlRunResult>("dashboard_crawl_run", {
    cwd: params.cwd,
    topics: selected,
    allowlistByTopic,
    maxSourcesPerTopic: Math.max(
      1,
      ...selected.map((topic) => Math.min(20, Math.max(1, params.configByTopic[topic].maxSources))),
    ),
  });
}

export async function loadDashboardSnapshots(params: {
  cwd: string;
  invokeFn: InvokeFn;
}): Promise<Partial<Record<DashboardTopicId, DashboardTopicSnapshot>>> {
  const rows = await params.invokeFn<unknown[]>("dashboard_snapshot_list", { cwd: params.cwd });
  const out: Partial<Record<DashboardTopicId, DashboardTopicSnapshot>> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const topic = (row as Record<string, unknown>).topic;
    if (!isDashboardTopicId(topic)) {
      continue;
    }
    const normalized = normalizeDashboardSnapshot(topic, String((row as Record<string, unknown>).model ?? ""), row);
    const current = out[topic];
    if (!current || current.generatedAt < normalized.generatedAt) {
      out[topic] = normalized;
    }
  }
  return out;
}
