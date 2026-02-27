import { describe, expect, it } from "vitest";
import { buildMissionFlowState } from "./missionFlow";

describe("buildMissionFlowState", () => {
  it("sets approval as active after decompose is done and approvals remain", () => {
    const state = buildMissionFlowState({
      hasDecomposed: true,
      pendingApprovals: 2,
      hasExecutionStarted: false,
      hasExecutionCompleted: false,
      hasSummary: false,
    });
    expect(state.activeStage).toBe("approval");
    expect(state.stages.find((stage) => stage.id === "decompose")?.status).toBe("done");
    expect(state.stages.find((stage) => stage.id === "approval")?.status).toBe("active");
  });

  it("marks all stages done when summary is present", () => {
    const state = buildMissionFlowState({
      hasDecomposed: true,
      pendingApprovals: 0,
      hasExecutionStarted: true,
      hasExecutionCompleted: true,
      hasSummary: true,
    });
    expect(state.stages.every((stage) => stage.status === "done")).toBe(true);
    expect(state.activeStage).toBe("summary");
  });
});
