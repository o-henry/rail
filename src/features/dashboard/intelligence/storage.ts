import {
  DASHBOARD_AGENT_CONFIG_STORAGE_KEY,
  createDefaultDashboardAgentConfigMap,
  normalizeDashboardAgentConfigMap,
} from "./config";
import type { DashboardAgentConfigMap } from "./types";

export function loadDashboardAgentConfigFromStorage(): DashboardAgentConfigMap {
  if (typeof window === "undefined") {
    return createDefaultDashboardAgentConfigMap();
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_AGENT_CONFIG_STORAGE_KEY);
    if (!raw) {
      return createDefaultDashboardAgentConfigMap();
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeDashboardAgentConfigMap(parsed);
  } catch {
    return createDefaultDashboardAgentConfigMap();
  }
}

export function saveDashboardAgentConfigToStorage(config: DashboardAgentConfigMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DASHBOARD_AGENT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore localStorage failures
  }
}
