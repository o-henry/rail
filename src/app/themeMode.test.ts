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
  it("normalizes valid and invalid values", () => {
    expect(normalizeThemeMode("dark")).toBe("dark");
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("LIGHT")).toBe("light");
    expect(normalizeThemeMode("unknown")).toBe("dark");
  });

  it("falls back to dark when window is unavailable", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(loadPersistedThemeMode()).toBe("dark");
  });

  it("loads persisted mode and keeps dark fallback for malformed data", () => {
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
    expect(loadPersistedThemeMode()).toBe("dark");
  });
});
