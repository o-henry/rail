import { describe, expect, it, vi } from "vitest";

import { guardUnlisten } from "./listenGuard";

describe("guardUnlisten", () => {
  it("invokes listener cleanup only once", async () => {
    const unlisten = vi.fn(async () => {});
    const guarded = guardUnlisten(unlisten);

    await guarded();
    await guarded();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("suppresses cleanup races after reporting them", async () => {
    const report = vi.fn();
    const guarded = guardUnlisten(async () => {
      throw new Error("listener missing");
    }, report);

    await expect(guarded()).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
  });
});
