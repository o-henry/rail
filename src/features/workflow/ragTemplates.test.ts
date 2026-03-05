import { describe, expect, it } from "vitest";
import { RAG_TEMPLATE_NODE_TYPES, RAG_TEMPLATE_OPTIONS } from "./ragTemplates";

describe("ragTemplates", () => {
  it("provides split templates for market/community/news/sns", () => {
    expect(RAG_TEMPLATE_OPTIONS.map((row) => row.value)).toEqual([
      "rag.market",
      "rag.community",
      "rag.news",
      "rag.sns",
    ]);
  });

  it("keeps shared transform/agent/export pipeline for each template", () => {
    const requiredTail = ["transform.normalize", "transform.verify", "transform.rank", "agent.codex", "export.rag"];
    for (const [templateId, nodeTypes] of Object.entries(RAG_TEMPLATE_NODE_TYPES)) {
      expect(nodeTypes[0]).toBe("trigger.manual");
      requiredTail.forEach((type) => {
        expect(nodeTypes).toContain(type);
      });
      expect(nodeTypes.some((type) => type.startsWith("source."))).toBe(true);
      expect(nodeTypes.length).toBe(7);
      expect(templateId).toMatch(/^rag\./);
    }
  });
});
