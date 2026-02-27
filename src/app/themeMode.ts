export const THEME_MODE_STORAGE_KEY = "rail.settings.theme_mode";

export type ThemeModeValue = "light" | "dark";

export function normalizeThemeMode(value: unknown): ThemeModeValue {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "dark" ? "dark" : "light";
}

export function loadPersistedThemeMode(): ThemeModeValue {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return normalizeThemeMode(raw);
  } catch {
    return "light";
  }
}
