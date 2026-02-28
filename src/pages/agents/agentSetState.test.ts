import { describe, expect, it } from "vitest";
import type { AgentSetPresetSnapshot, AgentSetState } from "./agentTypes";
import { createCustomThread, restoreSetStateFromPreset } from "./agentSetState";

describe("restoreSetStateFromPreset", () => {
  it("restores preset mission/threads/draft while keeping dashboard insights", () => {
    const current: AgentSetState = {
      setMission: "custom mission",
      threads: [createCustomThread("agent-9")],
      activeThreadId: "agent-9",
      draft: "custom draft",
      attachedFiles: [{ id: "file-1", name: "memo.txt" }],
      dashboardInsights: ["marketSummary: 상승 신호", "riskAlertsBoard: 변동성 확대"],
    };

    const preset: AgentSetPresetSnapshot = {
      mission: "preset mission",
      defaultDraft: "preset draft",
      threads: [
        {
          id: "market-scout",
          name: "signal-scout",
          role: "Signal Scout",
          guidance: ["핵심 신호 우선 정리"],
          starterPrompt: "최근 시장 신호를 정리해줘.",
          status: "preset",
        },
      ],
    };

    const restored = restoreSetStateFromPreset(current, preset);

    expect(restored.setMission).toBe("preset mission");
    expect(restored.draft).toBe("preset draft");
    expect(restored.activeThreadId).toBe("market-scout");
    expect(restored.threads.map((thread) => thread.name)).toEqual(["signal-scout"]);
    expect(restored.attachedFiles).toEqual([]);
    expect(restored.dashboardInsights).toEqual(current.dashboardInsights);
  });
});
