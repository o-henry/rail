import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import {
  openPath as tauriOpenPath,
  openUrl as tauriOpenUrl,
  revealItemInDir as tauriRevealItemInDir,
} from "@tauri-apps/plugin-opener";

import { guardUnlisten } from "./listenGuard";

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(command, args);
}

export async function listen(...args: Parameters<typeof tauriListen>) {
  const unlisten = await tauriListen(...args);
  return guardUnlisten(unlisten, (error) => {
    console.warn("[tauri] event listener cleanup skipped", error);
  });
}

export const openPath = tauriOpenPath;
export const openUrl = tauriOpenUrl;
export const revealItemInDir = tauriRevealItemInDir;
