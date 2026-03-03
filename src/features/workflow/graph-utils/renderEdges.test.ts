import { describe, expect, it } from "vitest";
import type { GraphNode } from "../types";
import { buildCanvasEdgeLines } from "./renderEdges";
import { NODE_HEIGHT, NODE_WIDTH } from "./shared";

function makeTurnNode(id: string, x: number, y: number): GraphNode {
  return {
    id,
    type: "turn",
    position: { x, y },
    config: {},
  };
}

describe("buildCanvasEdgeLines", () => {
  it("uses a simple 3-segment orthogonal route for a single opposite horizontal edge", () => {
    const fromNode = makeTurnNode("from", 80, 260);
    const toNode = makeTurnNode("to", 440, 120);

    const lines = buildCanvasEdgeLines({
      entries: [
        {
          edge: {
            from: { nodeId: fromNode.id, port: "out", side: "right" },
            to: { nodeId: toNode.id, port: "in", side: "left" },
          },
          edgeKey: "from:out->to:in",
          readOnly: false,
        },
      ],
      nodeMap: new Map([
        [fromNode.id, fromNode],
        [toNode.id, toNode],
      ]),
      getNodeVisualSize: () => ({ width: NODE_WIDTH, height: NODE_HEIGHT }),
    });

    expect(lines).toHaveLength(1);
    const [line] = lines;
    const segmentCount = (line.path.match(/ L /g) ?? []).length;
    expect(segmentCount).toBe(3);
  });
});
