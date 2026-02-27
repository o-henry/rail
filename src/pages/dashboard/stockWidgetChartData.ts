import { extractChartSpecsFromContent, type FeedChartSpec } from "../../features/feed/chartSpec";

export type DashboardStockDocumentPost = {
  executor?: string;
  status?: string;
  summary?: string;
  createdAt?: string;
  attachments?: Array<{
    kind?: string;
    content?: string;
  }>;
};

export type DashboardStockChartData = {
  labels: string[];
  values: number[];
  sourceSummary: string;
  createdAt?: string;
};

const STOCK_HINT_PATTERN =
  /(stock|stocks|market|ticker|equity|nasdaq|nyse|s&p|dow|nikkei|kospi|hang\s*seng|주식|증시|종가|주가|관심\s*종목|株式|株価|銘柄|股票|股价|证券)/i;
const VALUE_HEADER_PATTERN = /(price|close|last|value|종가|주가|가격|현재가|株価|価格|终值|收盘|股价)/i;
const LABEL_HEADER_PATTERN = /(ticker|symbol|code|name|종목|티커|코드|銘柄|代號|代码|名称)/i;

function parseNumber(raw: string): number | null {
  const matched = String(raw ?? "")
    .trim()
    .replace(/[^\d,.\-+]/g, "")
    .replace(/,/g, "");
  if (!matched) {
    return null;
  }
  const value = Number(matched);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDividerLine(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function isTickerLabel(input: string): boolean {
  const label = String(input ?? "").trim();
  return /^[A-Z]{1,6}$/.test(label);
}

function sanitizeChartData(labels: string[], values: number[]): { labels: string[]; values: number[] } | null {
  const rows = labels
    .map((label, index) => ({
      label: String(label ?? "").trim(),
      value: Number(values[index]),
    }))
    .filter((row) => row.label.length > 0 && Number.isFinite(row.value) && row.value > 0)
    .slice(-8);

  if (rows.length < 2) {
    return null;
  }

  return {
    labels: rows.map((row) => row.label),
    values: rows.map((row) => row.value),
  };
}

function toStockChartFromSpec(spec: FeedChartSpec): { labels: string[]; values: number[] } | null {
  const preferredSeries = spec.series.find((series) => series.data.length >= 2) ?? spec.series[0];
  if (!preferredSeries) {
    return null;
  }
  return sanitizeChartData(spec.labels, preferredSeries.data);
}

function extractStockChartFromMarkdown(content: string): { labels: string[]; values: number[] } | null {
  const extracted = extractChartSpecsFromContent(content);
  for (const spec of extracted.charts) {
    const hintSource = `${spec.title ?? ""} ${spec.labels.join(" ")} ${spec.series.map((series) => series.name).join(" ")}`;
    const hasStockHint =
      STOCK_HINT_PATTERN.test(hintSource) ||
      spec.labels.some(isTickerLabel) ||
      spec.series.some((series) => isTickerLabel(series.name));
    if (!hasStockHint) {
      continue;
    }
    const chartData = toStockChartFromSpec(spec);
    if (chartData) {
      return chartData;
    }
  }
  return null;
}

function extractStockChartFromTable(content: string): { labels: string[]; values: number[] } | null {
  const lines = String(content ?? "").split("\n");
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headLine = lines[index] ?? "";
    const dividerLine = lines[index + 1] ?? "";
    if (!headLine.includes("|") || !isDividerLine(dividerLine)) {
      continue;
    }

    const headers = parseTableRow(headLine);
    if (headers.length < 2) {
      continue;
    }

    const rows: string[][] = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length) {
      const rowLine = lines[rowIndex] ?? "";
      if (!rowLine.trim() || !rowLine.includes("|")) {
        break;
      }
      const row = parseTableRow(rowLine);
      rows.push(row);
      rowIndex += 1;
    }

    if (rows.length < 2) {
      continue;
    }

    const explicitValueColumn = headers.findIndex((header) => VALUE_HEADER_PATTERN.test(header));
    const inferredValueColumn = rows[0]?.findIndex((cell) => parseNumber(cell) != null) ?? -1;
    const valueColumnIndex = explicitValueColumn >= 0 ? explicitValueColumn : inferredValueColumn;
    if (valueColumnIndex < 0) {
      continue;
    }

    const labelColumnIndex = (() => {
      const labeled = headers.findIndex((header) => LABEL_HEADER_PATTERN.test(header));
      if (labeled >= 0 && labeled !== valueColumnIndex) {
        return labeled;
      }
      if (valueColumnIndex !== 0) {
        return 0;
      }
      return headers.length > 1 ? 1 : 0;
    })();

    const labels: string[] = [];
    const values: number[] = [];
    for (const row of rows) {
      const label = String(row[labelColumnIndex] ?? "").trim();
      const value = parseNumber(String(row[valueColumnIndex] ?? ""));
      if (!label || value == null) {
        continue;
      }
      labels.push(label);
      values.push(value);
    }

    const chartData = sanitizeChartData(labels, values);
    if (chartData) {
      return chartData;
    }
  }
  return null;
}

function extractStockChartFromTickerMentions(content: string): { labels: string[]; values: number[] } | null {
  const matches = Array.from(
    String(content ?? "").matchAll(/\b([A-Z]{1,6})\b[^\d-+]{0,16}([+-]?\d[\d,]*(?:\.\d+)?)/g),
  );
  const tickerMap = new Map<string, number>();
  for (const match of matches) {
    const ticker = String(match[1] ?? "").trim();
    const parsed = parseNumber(String(match[2] ?? ""));
    if (!ticker || parsed == null || parsed <= 0) {
      continue;
    }
    if (!tickerMap.has(ticker)) {
      tickerMap.set(ticker, parsed);
    }
  }
  if (tickerMap.size < 2) {
    return null;
  }
  const labels = Array.from(tickerMap.keys());
  const values = Array.from(tickerMap.values());
  return sanitizeChartData(labels, values);
}

function toMarkdownContents(post: DashboardStockDocumentPost): string[] {
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  return attachments
    .filter((item) => item?.kind === "markdown")
    .map((item) => String(item?.content ?? ""))
    .filter((content) => content.trim().length > 0);
}

export function buildDashboardStockChartData(feedPosts: DashboardStockDocumentPost[]): DashboardStockChartData | null {
  const candidates = [...feedPosts]
    .filter((post) => {
      if ((post.executor ?? "").toLowerCase() !== "codex") {
        return false;
      }
      const status = String(post.status ?? "");
      if (status !== "done" && status !== "low_quality") {
        return false;
      }
      return toMarkdownContents(post).length > 0;
    })
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  for (const post of candidates) {
    const markdownContents = toMarkdownContents(post);
    const joinedContent = markdownContents.join("\n\n");
    const hasStockHint = STOCK_HINT_PATTERN.test(`${post.summary ?? ""}\n${joinedContent}`);
    if (!hasStockHint) {
      continue;
    }

    for (const markdown of markdownContents) {
      const fromChartSpec = extractStockChartFromMarkdown(markdown);
      if (fromChartSpec) {
        return {
          ...fromChartSpec,
          sourceSummary: String(post.summary ?? "").trim(),
          createdAt: post.createdAt,
        };
      }
    }

    const fromTable = extractStockChartFromTable(joinedContent);
    if (fromTable) {
      return {
        ...fromTable,
        sourceSummary: String(post.summary ?? "").trim(),
        createdAt: post.createdAt,
      };
    }

    const fromTickerMentions = extractStockChartFromTickerMentions(joinedContent);
    if (fromTickerMentions) {
      return {
        ...fromTickerMentions,
        sourceSummary: String(post.summary ?? "").trim(),
        createdAt: post.createdAt,
      };
    }
  }

  return null;
}
