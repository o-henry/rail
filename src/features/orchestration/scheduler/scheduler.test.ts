import { describe, expect, it } from "vitest";
import { planBatchRuns } from "./scheduler";
import type { BatchSchedule } from "../types";

function buildSchedule(overrides: Partial<BatchSchedule> = {}): BatchSchedule {
  return {
    id: "s1",
    pipelineId: "p1",
    label: "daily trend",
    status: "enabled",
    provider: "web/perplexity",
    query: "latest game dev trends",
    cron: "30 10 * * *",
    ...overrides,
  };
}

describe("planBatchRuns", () => {
  it("queues due schedule", () => {
    const now = new Date("2026-02-27T10:30:00.000Z");
    const { dueSchedules, results } = planBatchRuns({
      schedules: [buildSchedule()],
      activePipelineIds: new Set(),
      now,
      trigger: "schedule",
      providerAvailable: () => true,
    });

    expect(dueSchedules).toHaveLength(1);
    expect(results.find((row) => row.status === "queued")).toBeTruthy();
  });

  it("skips overlap pipeline on same tick", () => {
    const now = new Date("2026-02-27T10:30:00.000Z");
    const { dueSchedules, results } = planBatchRuns({
      schedules: [buildSchedule()],
      activePipelineIds: new Set(["p1"]),
      now,
      trigger: "schedule",
      providerAvailable: () => true,
    });

    expect(dueSchedules).toHaveLength(0);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toContain("overlap");
  });

  it("marks disabled as skipped and provider unavailable as failed", () => {
    const now = new Date("2026-02-27T10:30:00.000Z");
    const { results } = planBatchRuns({
      schedules: [
        buildSchedule({ id: "disabled", pipelineId: "p2", status: "disabled" }),
        buildSchedule({ id: "down", pipelineId: "p3" }),
      ],
      activePipelineIds: new Set(),
      now,
      trigger: "schedule",
      providerAvailable: (provider) => provider !== "web/perplexity",
    });

    expect(results.find((row) => row.scheduleId === "disabled")?.status).toBe("skipped");
    expect(results.find((row) => row.scheduleId === "down")?.status).toBe("failed");
  });
});
