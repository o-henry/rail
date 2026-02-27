import { describe, expect, it } from "vitest";
import { buildDashboardStockChartData, type DashboardStockDocumentPost } from "./stockWidgetChartData";

describe("buildDashboardStockChartData", () => {
  it("extracts chart data from codex markdown rail-chart block", () => {
    const posts: DashboardStockDocumentPost[] = [
      {
        executor: "codex",
        status: "done",
        summary: "주식 리포트",
        createdAt: "2026-02-27T10:00:00.000Z",
        attachments: [
          {
            kind: "markdown",
            content: `## Stock Snapshot
\`\`\`rail-chart
{
  "type": "line",
  "labels": ["Mon", "Tue", "Wed", "Thu"],
  "series": [{"name": "AAPL", "data": [188.3, 190.1, 191.4, 192.2]}]
}
\`\`\`
`,
          },
        ],
      },
    ];

    const result = buildDashboardStockChartData(posts);
    expect(result).not.toBeNull();
    expect(result?.labels).toEqual(["Mon", "Tue", "Wed", "Thu"]);
    expect(result?.values).toEqual([188.3, 190.1, 191.4, 192.2]);
  });

  it("falls back to markdown table parsing when chart block does not exist", () => {
    const posts: DashboardStockDocumentPost[] = [
      {
        executor: "codex",
        status: "done",
        summary: "오늘 주식 테이블",
        createdAt: "2026-02-27T09:00:00.000Z",
        attachments: [
          {
            kind: "markdown",
            content: `| Ticker | Price |
| --- | --- |
| NVDA | 810.5 |
| AMD | 174.2 |
| TSM | 133.7 |
`,
          },
        ],
      },
    ];

    const result = buildDashboardStockChartData(posts);
    expect(result).not.toBeNull();
    expect(result?.labels).toEqual(["NVDA", "AMD", "TSM"]);
    expect(result?.values).toEqual([810.5, 174.2, 133.7]);
  });

  it("ignores non-codex posts", () => {
    const posts: DashboardStockDocumentPost[] = [
      {
        executor: "web",
        status: "done",
        summary: "market update",
        createdAt: "2026-02-27T09:00:00.000Z",
        attachments: [{ kind: "markdown", content: "AAPL 190" }],
      },
    ];
    expect(buildDashboardStockChartData(posts)).toBeNull();
  });
});
