import { describe, expect, it } from "vitest";
import { buildTaskGraph } from "./taskGraph";

describe("buildTaskGraph", () => {
  it("sets coordinator as root and attaches all nodes to coordinator dependency", () => {
    const graph = buildTaskGraph({
      nodes: [
        { id: "t1", role: "coordinator", title: "coord", dependsOn: [] },
        { id: "t2", role: "dev", title: "dev", dependsOn: [] },
        { id: "t3", role: "qa", title: "qa", dependsOn: ["t2"] },
      ],
    });

    expect(graph.rootTaskId).toBe("t1");
    expect(graph.nodes.find((node) => node.id === "t1")?.status).toBe("ready");
    expect(graph.nodes.find((node) => node.id === "t2")?.dependsOn).toEqual(["t1"]);
    expect(graph.nodes.find((node) => node.id === "t3")?.dependsOn).toEqual(["t2", "t1"]);
  });

  it("promotes first node to ready when coordinator does not exist", () => {
    const graph = buildTaskGraph({
      nodes: [
        { id: "a", role: "planner", title: "planner", dependsOn: [] },
        { id: "b", role: "builder", title: "builder", dependsOn: ["a"] },
      ],
    });

    expect(graph.rootTaskId).toBe("a");
    expect(graph.nodes.find((node) => node.id === "a")?.status).toBe("ready");
    expect(graph.nodes.find((node) => node.id === "b")?.status).toBe("blocked");
  });
});
