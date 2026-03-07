import type { WorkSessionRecord } from "./types";
import { createEmptyWorkSessionRecord, sortSessions } from "./sessionState";

const STORAGE_KEY_PREFIX = "rail.workbench.sessions.v1";

function storageKeyForCwd(cwd: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(String(cwd ?? "").trim() || "default")}`;
}

export function workSessionIndexPath(cwd: string): string {
  const base = String(cwd ?? "").trim().replace(/[\\/]+$/, "");
  return `${base}/.rail/studio_sessions/index.json`;
}

export function normalizeWorkSessionRecord(input: unknown): WorkSessionRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createEmptyWorkSessionRecord();
  }
  const row = input as Partial<WorkSessionRecord>;
  const sessions = Array.isArray(row.sessions) ? sortSessions(row.sessions.filter(Boolean) as WorkSessionRecord["sessions"]) : [];
  const selectedSessionId = String(row.selectedSessionId ?? "").trim() || null;
  return {
    version: 1,
    sessions,
    selectedSessionId: selectedSessionId && sessions.some((session) => session.id === selectedSessionId)
      ? selectedSessionId
      : sessions[0]?.id ?? null,
  };
}

export function readWorkbenchSessionsFromLocalStorage(cwd: string): WorkSessionRecord {
  if (typeof window === "undefined") {
    return createEmptyWorkSessionRecord();
  }
  const raw = window.localStorage.getItem(storageKeyForCwd(cwd));
  if (!raw) {
    return createEmptyWorkSessionRecord();
  }
  try {
    return normalizeWorkSessionRecord(JSON.parse(raw));
  } catch {
    return createEmptyWorkSessionRecord();
  }
}

export function writeWorkbenchSessionsToLocalStorage(cwd: string, record: WorkSessionRecord): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKeyForCwd(cwd), JSON.stringify(record));
}
