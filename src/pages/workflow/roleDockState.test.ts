import { describe, expect, it } from "vitest";
import { buildRoleDockStatusByRole } from "./roleDockState";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";

describe("buildRoleDockStatusByRole", () => {
  it("marks target role as VERIFY when requested handoff exists", () => {
    const result = buildRoleDockStatusByRole({
      roles: STUDIO_ROLE_TEMPLATES,
      runtimeByRole: {},
      handoffRecords: [
        {
          id: "handoff-1",
          fromRole: "pm_planner",
          toRole: "client_programmer",
          taskId: "TASK-123",
          request: "요구사항 반영",
          artifactPaths: [],
          status: "requested",
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    });
    expect(result.client_programmer?.status).toBe("VERIFY");
    expect(result.client_programmer?.taskId).toBe("TASK-123");
  });

  it("preserves RUNNING state over handoff derived states", () => {
    const result = buildRoleDockStatusByRole({
      roles: STUDIO_ROLE_TEMPLATES,
      runtimeByRole: {
        pm_planner: {
          status: "RUNNING",
          taskId: "TASK-001",
        },
      },
      handoffRecords: [
        {
          id: "handoff-2",
          fromRole: "pm_planner",
          toRole: "client_programmer",
          taskId: "TASK-001",
          request: "검토 요청",
          artifactPaths: [],
          status: "rejected",
          rejectReason: "보완 필요",
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    });
    expect(result.pm_planner?.status).toBe("RUNNING");
  });
});
