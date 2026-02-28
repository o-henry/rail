import { describe, expect, it } from "vitest";
import { buildAgentDispatchPayload } from "./agentPrompt";

describe("agent prompt dispatcher", () => {
  it("includes codex multi-agent directive for codex models", () => {
    const payload = buildAgentDispatchPayload({
      threadName: "snapshot-synthesizer",
      threadRole: "Snapshot Synthesizer",
      threadGuidance: ["근거 중심으로 요약", "리스크 분리 보고"],
      threadStarterPrompt: "최종 스냅샷 JSON 생성",
      selectedModel: "5.3-Codex",
      selectedReasonLevel: "보통",
      isReasonLevelSelectable: true,
      text: "시장 요약 실행",
      attachedFileNames: [],
      codexMultiAgentMode: "balanced",
    });

    expect(payload).toContain("[CODEx MULTI-AGENT ORCHESTRATION]");
    expect(payload).toContain("[AGENT ROLE]");
    expect(payload).toContain("[model=5.3-Codex, reason=보통]");
  });

  it("does not include codex directive for non-codex models", () => {
    const payload = buildAgentDispatchPayload({
      threadName: "search-agent",
      threadRole: "Web Researcher",
      threadGuidance: [],
      threadStarterPrompt: "",
      selectedModel: "Gemini",
      selectedReasonLevel: "보통",
      isReasonLevelSelectable: false,
      text: "핵심 뉴스 찾아줘",
      attachedFileNames: [],
      codexMultiAgentMode: "max",
    });

    expect(payload).not.toContain("[CODEx MULTI-AGENT ORCHESTRATION]");
    expect(payload).toContain("[model=Gemini, reason=N/A]");
  });

  it("injects attached files list into payload", () => {
    const payload = buildAgentDispatchPayload({
      threadName: "implementation-agent",
      selectedModel: "5.2-Codex",
      selectedReasonLevel: "높음",
      isReasonLevelSelectable: true,
      text: "테스트 보강",
      attachedFileNames: ["a.ts", "b.test.ts"],
      codexMultiAgentMode: "off",
    });

    expect(payload).toContain("files: a.ts, b.test.ts");
    expect(payload).toContain("[model=5.2-Codex, reason=높음]");
  });
});
