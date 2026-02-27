import { describe, expect, it } from "vitest";
import { createRailCompatibleDag } from "./railDagAdapter";
import { buildTaskGraph } from "../graph/taskGraph";

describe("createRailCompatibleDag", () => {
  it("creates edges from dependsOn and lays out by depth", () => {
    const taskGraph = buildTaskGraph({
      nodes: [
        { id: "coordinator", role: "coordinator", title: "coord", dependsOn: [] },
        { id: "research", role: "research", title: "research", dependsOn: ["coordinator"] },
        { id: "build", role: "dev", title: "build", dependsOn: ["research"] },
      ],
    });

    const dag = createRailCompatibleDag({ taskGraph, xSpacing: 100, ySpacing: 100 });
    const coordinator = dag.nodes.find((node) => node.id === "coordinator");
    const build = dag.nodes.find((node) => node.id === "build");

    expect(coordinator?.depth).toBe(0);
    expect(build?.depth).toBe(2);
    expect(dag.edges).toEqual(
      expect.arrayContaining([
        { fromId: "coordinator", toId: "research" },
        { fromId: "research", toId: "build" },
      ]),
    );
  });
});
