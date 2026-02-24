export type FeedChartType = "bar" | "line" | "pie";

export type FeedChartSeries = {
  name: string;
  data: number[];
  color?: string;
};

export type FeedChartSpec = {
  type: FeedChartType;
  title?: string;
  labels: string[];
  series: FeedChartSeries[];
};

type ExtractionResult = {
  contentWithoutChartBlocks: string;
  charts: FeedChartSpec[];
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function toNumberArray(input: unknown): number[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((row) => Number(row))
    .filter((row) => Number.isFinite(row))
    .map((row) => Number(row));
}

function normalizeSeries(input: unknown): FeedChartSeries[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const output: FeedChartSeries[] = [];
  for (const row of input) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const name = String(item.name ?? "").trim() || "Series";
    const data = toNumberArray(item.data);
    if (data.length === 0) {
      continue;
    }
    const color = typeof item.color === "string" ? item.color.trim() : "";
    output.push({
      name,
      data,
      ...(color ? { color } : {}),
    });
  }
  return output;
}

function normalizeSingleChartSpec(input: unknown): FeedChartSpec | null {
  const row = asRecord(input);
  if (!row) {
    return null;
  }
  const typeRaw = String(row.type ?? "").toLowerCase().trim();
  const type: FeedChartType = typeRaw === "line" || typeRaw === "pie" ? typeRaw : "bar";
  const labels = Array.isArray(row.labels)
    ? row.labels.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  let series = normalizeSeries(row.series);

  if (series.length === 0 && type === "pie") {
    const values = asRecord(row.values);
    if (values) {
      const pairs = Object.entries(values)
        .map(([key, value]) => ({ key: String(key), value: Number(value) }))
        .filter((pair) => pair.key.trim() && Number.isFinite(pair.value));
      if (pairs.length > 0) {
        return {
          type: "pie",
          title: typeof row.title === "string" ? row.title : undefined,
          labels: pairs.map((pair) => pair.key),
          series: [{ name: "값", data: pairs.map((pair) => pair.value) }],
        };
      }
    }
  }

  if (labels.length === 0 || series.length === 0) {
    return null;
  }

  const alignedSeries = series
    .map((entry) => ({
      ...entry,
      data: entry.data.slice(0, labels.length),
    }))
    .filter((entry) => entry.data.length > 0);
  if (alignedSeries.length === 0) {
    return null;
  }

  return {
    type,
    title: typeof row.title === "string" ? row.title : undefined,
    labels,
    series: alignedSeries,
  };
}

function normalizeChartSpecs(input: unknown): FeedChartSpec[] {
  if (Array.isArray(input)) {
    return input.map(normalizeSingleChartSpec).filter((row): row is FeedChartSpec => Boolean(row));
  }

  const row = asRecord(input);
  if (!row) {
    return [];
  }

  if (Array.isArray(row.visualizations)) {
    return normalizeChartSpecs(row.visualizations);
  }
  if (row.chart) {
    const one = normalizeSingleChartSpec(row.chart);
    return one ? [one] : [];
  }

  const one = normalizeSingleChartSpec(row);
  return one ? [one] : [];
}

function parseChartSpecsFromFence(lang: string, body: string): FeedChartSpec[] {
  const normalizedLang = lang.trim().toLowerCase();
  const maybeChartLang =
    normalizedLang.includes("rail-chart") ||
    normalizedLang.includes("chart") ||
    normalizedLang.includes("viz") ||
    normalizedLang.includes("visual");
  if (!maybeChartLang) {
    return [];
  }

  const trimmedBody = body.trim();
  if (!(trimmedBody.startsWith("{") || trimmedBody.startsWith("["))) {
    return [];
  }

  try {
    const payload = JSON.parse(trimmedBody);
    return normalizeChartSpecs(payload);
  } catch {
    return [];
  }
}

export function extractChartSpecsFromContent(content: string): ExtractionResult {
  const text = String(content ?? "");
  if (!text.trim()) {
    return { contentWithoutChartBlocks: "", charts: [] };
  }

  const blockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  const charts: FeedChartSpec[] = [];
  let lastIndex = 0;
  const segments: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const [rawBlock, langRaw, blockBody] = match;
    const start = match.index;
    const end = start + rawBlock.length;
    segments.push(text.slice(lastIndex, start));
    const chartSpecs = parseChartSpecsFromFence(String(langRaw ?? ""), String(blockBody ?? ""));
    if (chartSpecs.length > 0) {
      charts.push(...chartSpecs);
    } else {
      segments.push(rawBlock);
    }
    lastIndex = end;
  }

  segments.push(text.slice(lastIndex));
  return {
    contentWithoutChartBlocks: segments.join("").trim(),
    charts,
  };
}
