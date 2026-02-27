import { describe, expect, it } from "vitest";
import { evaluateApprovalGate } from "./gate";
import { createApprovalQueue } from "./queue";

describe("evaluateApprovalGate", () => {
  it("allows only exact-match approved request", () => {
    const queue = createApprovalQueue([
      {
        requestId: "r1",
        taskId: "task-1",
        actionType: "commandExecution",
        preview: "npm run build",
        status: "approved",
      },
      {
        requestId: "r2",
        taskId: "task-1",
        actionType: "commandExecution",
        preview: "npm run test",
        status: "pending",
      },
    ]);

    const allowed = evaluateApprovalGate({
      taskId: "task-1",
      actionType: "commandExecution",
      preview: "npm run build",
      queue,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.matchedRequestId).toBe("r1");

    const blocked = evaluateApprovalGate({
      taskId: "task-1",
      actionType: "commandExecution",
      preview: "npm run test",
      queue,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("pending");

    const missing = evaluateApprovalGate({
      taskId: "task-1",
      actionType: "commandExecution",
      preview: "npm run lint",
      queue,
    });
    expect(missing.allowed).toBe(false);
    expect(missing.reason).toContain("not found");
  });
});
