import { describe, expect, it } from "vitest";
import { normalizeUnifiedInput } from "./unifiedInput";

describe("normalizeUnifiedInput", () => {
  it("normalizes whitespace and returns structured input", () => {
    const result = normalizeUnifiedInput({
      text: "  build   me \n  a  game loop ",
      locale: "ko",
      tags: ["unity", "planner"],
      metadata: { source: "test" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedText).toBe("build me \n a game loop");
      expect(result.value.tags).toEqual(["unity", "planner"]);
      expect(result.value.locale).toBe("ko");
    }
  });

  it("rejects empty input", () => {
    const result = normalizeUnifiedInput({ text: "   " });
    expect(result.ok).toBe(false);
  });
});
