import { describe, expect, it } from "vitest";
import { appendTerminalChunk, buildGraphObserverText } from "./workspaceTerminalState";

describe("workspace terminal state", () => {
  it("appends terminal chunks and strips ansi escapes", () => {
    const next = appendTerminalChunk("hello\n", "\u001b[31mworld\u001b[0m");
    expect(next).toBe("hello\nworld");
  });

  it("builds graph observer text from node logs and workspace events", () => {
    const text = buildGraphObserverText({
      graphFileName: "player-flow",
      graphNodes: [
        { id: "node-1", type: "turn", position: { x: 0, y: 0 }, config: { title: "Jump Logic" } },
      ],
      nodeStates: {
        "node-1": {
          status: "running",
          logs: ["step 1", "step 2"],
        },
      },
      workspaceEvents: [
        { id: "evt-1", source: "workflow", level: "info", message: "run started" },
      ],
    });

    expect(text).toContain("[graph] player-flow");
    expect(text).toContain("[node:running] Jump Logic");
    expect(text).toContain("step 2");
    expect(text).toContain("[workflow/info] run started");
  });
});
