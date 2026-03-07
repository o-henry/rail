import { describe, expect, it } from "vitest";
import { buildControlRoomOverview, buildGraphMonitorRows } from "./controlRoomState";

describe("control room state", () => {
  it("builds the overview counts for sessions, nodes, and errors", () => {
    const overview = buildControlRoomOverview({
      sessions: [
        { id: "a", status: "active" },
        { id: "b", status: "review" },
        { id: "c", status: "unity" },
        { id: "d", status: "done" },
      ] as any,
      nodeStates: {
        a: { status: "running", logs: [] },
        b: { status: "queued", logs: [] },
        c: { status: "done", logs: [] },
      } as any,
      workspaceEvents: [
        { id: "1", level: "info" },
        { id: "2", level: "error" },
        { id: "3", level: "error" },
      ] as any,
      pendingApprovals: 3,
      connectedProviders: 2,
      graphRunning: true,
    });

    expect(overview.activeSessions).toBe(2);
    expect(overview.unityPending).toBe(1);
    expect(overview.completedSessions).toBe(1);
    expect(overview.activeNodes).toBe(2);
    expect(overview.recentErrors).toBe(2);
    expect(overview.pendingApprovals).toBe(3);
    expect(overview.connectedProviders).toBe(2);
    expect(overview.graphRunning).toBe(true);
  });

  it("sorts graph monitor rows with active nodes first", () => {
    const rows = buildGraphMonitorRows({
      graphNodes: [
        { id: "b", type: "gate", position: { x: 0, y: 0 }, config: {} },
        { id: "a", type: "turn", position: { x: 0, y: 0 }, config: { title: "알파" } },
      ],
      nodeStates: {
        b: { status: "done", logs: [] },
        a: { status: "running", logs: ["processing"] },
      } as any,
    });

    expect(rows[0].id).toBe("a");
    expect(rows[0].lastLog).toBe("processing");
    expect(rows[1].id).toBe("b");
  });
});
