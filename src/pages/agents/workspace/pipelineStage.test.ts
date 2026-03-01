import { describe, expect, it } from "vitest";
import { buildProcessSteps, resolveAgentPipelineStatus, resolvePipelineStageIndex, resolvePipelineStepStates } from "./pipelineStage";

describe("pipeline stage mapping", () => {
  it("maps runtime stage keys to pipeline index", () => {
    expect(resolvePipelineStageIndex({ running: true, progressStage: "crawler" })).toBe(0);
    expect(resolvePipelineStageIndex({ running: true, progressStage: "rag" })).toBe(1);
    expect(resolvePipelineStageIndex({ running: true, progressStage: "codex_turn" })).toBe(2);
    expect(resolvePipelineStageIndex({ running: true, progressStage: "save" })).toBe(3);
  });

  it("uses text inference when stage key is absent", () => {
    expect(resolvePipelineStageIndex({ running: true, progressText: "크롤러 실행 중" })).toBe(0);
    expect(resolvePipelineStageIndex({ running: true, progressText: "근거 추출 완료" })).toBe(1);
    expect(resolvePipelineStageIndex({ running: true, progressText: "Codex 응답 생성 중" })).toBe(2);
    expect(resolvePipelineStageIndex({ running: true, progressText: "스냅샷 저장 중" })).toBe(3);
  });

  it("marks all steps as done after completion", () => {
    expect(
      resolvePipelineStepStates({
        running: false,
        progressStage: "done",
        lastRunAt: "2026-03-01T00:00:00.000Z",
      }),
    ).toEqual(["done", "done", "done", "done"]);
  });

  it("keeps pending state for failed runs", () => {
    expect(
      resolvePipelineStepStates({
        running: false,
        progressStage: "error",
        lastError: "failed",
      }),
    ).toEqual(["error", "pending", "pending", "pending"]);
  });

  it("shows scoped steps per data pipeline agent", () => {
    const crawlerSteps = buildProcessSteps(
      {
        id: "marketSummary-crawler",
        name: "crawler-agent",
        role: "Crawler",
        guidance: [],
        starterPrompt: "",
        status: "preset",
      },
      false,
      "marketSummary",
      { running: true, progressStage: "rag" },
    );
    const ragSteps = buildProcessSteps(
      {
        id: "marketSummary-rag",
        name: "rag-analyst",
        role: "RAG",
        guidance: [],
        starterPrompt: "",
        status: "preset",
      },
      false,
      "marketSummary",
      { running: true, progressStage: "rag" },
    );
    const synthSteps = buildProcessSteps(
      {
        id: "marketSummary-synth",
        name: "snapshot-synthesizer",
        role: "Synth",
        guidance: [],
        starterPrompt: "",
        status: "preset",
      },
      false,
      "marketSummary",
      { running: true, progressStage: "rag" },
    );
    expect(crawlerSteps.map((step) => step.label)).toEqual(["crawler 수집"]);
    expect(ragSteps.map((step) => step.label)).toEqual(["rag 분석"]);
    expect(synthSteps.map((step) => step.label)).toEqual(["codex 생성", "snapshot 저장"]);
  });

  it("marks running agent by stage", () => {
    const crawlerStatus = resolveAgentPipelineStatus(
      {
        id: "marketSummary-crawler",
        name: "crawler-agent",
        role: "Crawler",
        guidance: [],
        starterPrompt: "",
        status: "preset",
      },
      "marketSummary",
      { running: true, progressStage: "rag" },
    );
    const ragStatus = resolveAgentPipelineStatus(
      {
        id: "marketSummary-rag",
        name: "rag-analyst",
        role: "RAG",
        guidance: [],
        starterPrompt: "",
        status: "preset",
      },
      "marketSummary",
      { running: true, progressStage: "rag" },
    );
    expect(crawlerStatus).toBe("done");
    expect(ragStatus).toBe("running");
  });
});
