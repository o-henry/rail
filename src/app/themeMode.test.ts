import { afterEach, describe, expect, it } from "vitest";
import { loadPersistedThemeMode, normalizeThemeMode } from "./themeMode";

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

function setWindowMock(next: unknown) {
  Object.defineProperty(globalThis, "window", {
    value: next,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (windowDescriptor) {
    Object.defineProperty(globalThis, "window", windowDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "window");
});

describe("themeMode", () => {
  it("normalizes all values to light-only mode", () => {
    expect(normalizeThemeMode("dark")).toBe("light");
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("LIGHT")).toBe("light");
    expect(normalizeThemeMode("unknown")).toBe("light");
  });

  it("falls back to light when window is unavailable", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(loadPersistedThemeMode()).toBe("light");
  });

  it("returns light even when persisted mode exists", () => {
    setWindowMock({
      localStorage: {
        getItem: () => "light",
      },
    });
    expect(loadPersistedThemeMode()).toBe("light");

    setWindowMock({
      localStorage: {
        getItem: () => "INVALID_THEME",
      },
    });
    expect(loadPersistedThemeMode()).toBe("light");
  });
});
