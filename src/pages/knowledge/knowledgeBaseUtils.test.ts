import { describe, expect, it } from "vitest";
import type { KnowledgeEntry } from "../../features/studio/knowledgeTypes";
import { toReadableJsonInfo } from "./knowledgeEntryMapping";
import {
  groupKnowledgeEntries,
  shouldDeleteKnowledgeRunRecord,
  sortKnowledgeEntries,
} from "./knowledgeBaseUtils";

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "entry-1",
    runId: "run-1",
    taskId: "TASK_ONE",
    roleId: "technical_writer",
    sourceKind: "artifact",
    title: "문서",
    summary: "요약",
    createdAt: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("knowledgeBaseUtils", () => {
  it("groups entries by run and sorts latest group first", () => {
    const grouped = groupKnowledgeEntries(
      sortKnowledgeEntries([
        makeEntry({ id: "entry-1", runId: "run-old", taskId: "TASK_OLD", createdAt: "2026-03-03T00:00:00.000Z" }),
        makeEntry({ id: "entry-2", runId: "run-new", taskId: "TASK_NEW", createdAt: "2026-03-05T00:00:00.000Z" }),
        makeEntry({ id: "entry-3", runId: "run-new", taskId: "TASK_NEW", createdAt: "2026-03-04T00:00:00.000Z" }),
      ]),
    );

    expect(grouped.map((group) => group.runId)).toEqual(["run-new", "run-old"]);
    expect(grouped[0]?.entries.map((entry) => entry.id)).toEqual(["entry-2", "entry-3"]);
    expect(grouped[0]?.taskId).toBe("TASK_NEW");
  });

  it("summarizes parsed JSON fields for detail view", () => {
    const info = toReadableJsonInfo(JSON.stringify({ summary: "ok", count: 3, tags: ["a", "b"] }));

    expect(info.summaryRows).toEqual([
      { key: "SUMMARY", value: "ok" },
      { key: "COUNT", value: "3" },
      { key: "TAGS", value: "배열 2개" },
    ]);
    expect(info.pretty).toContain("\"count\": 3");
  });

  it("does not delete dashboard synthetic run records as run files", () => {
    expect(shouldDeleteKnowledgeRunRecord("run-123.json")).toBe(true);
    expect(shouldDeleteKnowledgeRunRecord("dashboard-market-summary-1.json")).toBe(false);
    expect(shouldDeleteKnowledgeRunRecord("/tmp/run-123.json")).toBe(false);
  });
});
