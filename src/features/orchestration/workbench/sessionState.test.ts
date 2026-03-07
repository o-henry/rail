import { describe, expect, it } from "vitest";
import {
  applyRoleRunCompletion,
  applySessionTaskResult,
  applySessionUnityResult,
  createManualTaskSession,
  createRoleRunSession,
  deriveRoleSessionStatus,
  patchManualSessionStatus,
} from "./sessionState";

describe("workbench session state", () => {
  it("creates a role-run session with linked mission runs", () => {
    const session = createRoleRunSession({
      cwd: "/tmp/workspace",
      roleId: "client_programmer",
      roleLabel: "클라이언트",
      taskId: "CLIENT-001",
      prompt: "플레이어 이동 구현",
    });

    expect(session.kind).toBe("role_run");
    expect(session.linkedRunIds.length).toBe(4);
    expect(session.commands).toContain("npm run build");
    expect(deriveRoleSessionStatus(session.mission!)).toBe("active");
  });

  it("creates a manual task session and lets it move between board columns", () => {
    const session = createManualTaskSession({
      title: "점프 애니메이션 확인",
      taskId: "TASK-001",
      commands: ["dotnet build"],
    });

    const reviewSession = patchManualSessionStatus(session, "review");
    const unitySession = patchManualSessionStatus(reviewSession, "unity");
    const doneSession = patchManualSessionStatus(unitySession, "done");

    expect(session.status).toBe("waiting");
    expect(reviewSession.status).toBe("review");
    expect(unitySession.surface).toBe("unity");
    expect(doneSession.verificationStatus).toBe("verified");
  });

  it("moves a role-run session to review after implementer completion", () => {
    const session = createRoleRunSession({
      cwd: "/tmp/workspace",
      roleId: "client_programmer",
      roleLabel: "클라이언트",
      taskId: "CLIENT-001",
      prompt: "플레이어 이동 구현",
    });
    const implementerRunId = session.mission!.childEnvelopes.find((row) => row.record.agentRole === "implementer")!.record.runId;

    const next = applyRoleRunCompletion(session, {
      runId: implementerRunId,
      runStatus: "done",
      artifactPaths: ["/tmp/workspace/.rail/studio_runs/run-1/player.diff"],
    });

    expect(next.status).toBe("review");
    expect(next.artifactPaths.some((path) => path.endsWith("player.diff"))).toBe(true);
    expect(next.nextAction.title).toContain("작업용 터미널");
  });

  it("moves a session to unity after successful terminal verification and back to active on unity failure", () => {
    const session = createRoleRunSession({
      cwd: "/tmp/workspace",
      roleId: "client_programmer",
      roleLabel: "클라이언트",
      taskId: "CLIENT-001",
      prompt: "플레이어 이동 구현",
    });
    const implementerRunId = session.mission!.childEnvelopes.find((row) => row.record.agentRole === "implementer")!.record.runId;
    const reviewReady = applyRoleRunCompletion(session, {
      runId: implementerRunId,
      runStatus: "done",
      artifactPaths: [],
    });

    const verified = applySessionTaskResult(reviewReady, {
      id: "terminal-1",
      at: "2026-03-07T00:00:00.000Z",
      runId: reviewReady.linkedRunIds[0],
      taskId: reviewReady.taskId,
      command: "dotnet build",
      exitCode: 0,
      stdoutTail: "Build succeeded",
      stderrTail: "",
      timedOut: false,
      durationMs: 1200,
      artifacts: ["/tmp/workspace/.rail/studio_sessions/build.json"],
    });
    const failedUnity = applySessionUnityResult(verified, false, "점프 높이가 너무 낮음");

    expect(verified.status).toBe("unity");
    expect(failedUnity.status).toBe("active");
    expect(failedUnity.nextAction.detail).toContain("점프 높이");
  });
});
