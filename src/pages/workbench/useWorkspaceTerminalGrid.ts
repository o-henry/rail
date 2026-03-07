import { useCallback, useEffect, useMemo, useState } from "react";
import { STUDIO_ROLE_TEMPLATES } from "../../features/studio/roleTemplates";
import { invoke, listen } from "../../shared/tauri";
import type { GraphNode } from "../../features/workflow/types";
import type { WorkbenchNodeState, WorkbenchWorkspaceEvent } from "./workbenchRuntimeTypes";
import { appendTerminalChunk, buildGraphObserverText } from "./workspaceTerminalState";
import type {
  WorkspaceTerminalOutputEvent,
  WorkspaceTerminalPane,
  WorkspaceTerminalPaneStatus,
  WorkspaceTerminalStateEvent,
} from "./workspaceTerminalTypes";

const TERMINAL_ROLE_IDS = ["pm_planner", "client_programmer", "system_programmer", "qa_engineer"] as const;

function createPane(id: string, title: string, subtitle: string): WorkspaceTerminalPane {
  return {
    id,
    title,
    subtitle,
    startupCommand: "codex",
    buffer: "",
    input: "",
    status: "idle",
    exitCode: null,
  };
}

function statusMessage(status: WorkspaceTerminalPaneStatus, exitCode?: number | null): string {
  if (status === "running") {
    return "running";
  }
  if (status === "starting") {
    return "starting";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "exited") {
    return `exited${typeof exitCode === "number" ? ` (${exitCode})` : ""}`;
  }
  if (status === "stopped") {
    return "stopped";
  }
  return "idle";
}

export function useWorkspaceTerminalGrid(params: {
  cwd: string;
  graphFileName: string;
  graphNodes: GraphNode[];
  nodeStates: Record<string, WorkbenchNodeState>;
  workspaceEvents: WorkbenchWorkspaceEvent[];
}) {
  const rolePanes = useMemo(
    () =>
      TERMINAL_ROLE_IDS.map((roleId) => {
        const role = STUDIO_ROLE_TEMPLATES.find((item) => item.id === roleId);
        return createPane(`workspace-${roleId}`, role?.label ?? roleId, role?.goal ?? "Codex CLI");
      }),
    [],
  );

  const [panes, setPanes] = useState<WorkspaceTerminalPane[]>(rolePanes);

  useEffect(() => {
    setPanes((current) =>
      current.map((pane) => ({
        ...pane,
        buffer: pane.buffer,
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let offOutput: null | (() => Promise<void>) = null;
    let offState: null | (() => Promise<void>) = null;

    void listen("workspace-terminal-output", (event) => {
      if (cancelled) {
        return;
      }
      const payload = event.payload as WorkspaceTerminalOutputEvent;
      setPanes((current) =>
        current.map((pane) => (
          pane.id === payload.sessionId
            ? { ...pane, buffer: appendTerminalChunk(pane.buffer, payload.chunk) }
            : pane
        )),
      );
    }).then((unlisten) => {
      offOutput = unlisten;
    }).catch(() => undefined);

    void listen("workspace-terminal-state", (event) => {
      if (cancelled) {
        return;
      }
      const payload = event.payload as WorkspaceTerminalStateEvent;
      setPanes((current) =>
        current.map((pane) => (
          pane.id === payload.sessionId
            ? {
                ...pane,
                status: payload.state,
                exitCode: payload.exitCode ?? null,
                buffer: payload.message
                  ? appendTerminalChunk(pane.buffer, `\n[system] ${payload.message}\n`)
                  : pane.buffer,
              }
            : pane
        )),
      );
    }).then((unlisten) => {
      offState = unlisten;
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      void offOutput?.();
      void offState?.();
    };
  }, []);

  const graphObserverText = useMemo(
    () =>
      buildGraphObserverText({
        graphFileName: params.graphFileName,
        graphNodes: params.graphNodes,
        nodeStates: params.nodeStates,
        workspaceEvents: params.workspaceEvents,
      }),
    [params.graphFileName, params.graphNodes, params.nodeStates, params.workspaceEvents],
  );

  const startPane = useCallback(async (paneId: string) => {
    const pane = panes.find((row) => row.id === paneId);
    if (!pane || !params.cwd) {
      return;
    }
    setPanes((current) => current.map((row) => row.id === paneId ? { ...row, status: "starting" } : row));
    try {
      await invoke("workspace_terminal_start", {
        sessionId: paneId,
        cwd: params.cwd,
        initialCommand: pane.startupCommand,
      });
    } catch (error) {
      setPanes((current) =>
        current.map((row) =>
          row.id === paneId
            ? {
                ...row,
                status: "error",
                buffer: appendTerminalChunk(row.buffer, `\n[system] ${String(error ?? "failed to start session")}\n`),
              }
            : row,
        ),
      );
    }
  }, [panes, params.cwd]);

  const stopPane = useCallback(async (paneId: string) => {
    try {
      await invoke("workspace_terminal_stop", { sessionId: paneId });
    } catch (error) {
      setPanes((current) =>
        current.map((row) =>
          row.id === paneId
            ? {
                ...row,
                status: "error",
                buffer: appendTerminalChunk(row.buffer, `\n[system] ${String(error ?? "failed to stop session")}\n`),
              }
            : row,
        ),
      );
    }
  }, []);

  const sendPaneInput = useCallback(async (paneId: string) => {
    const pane = panes.find((row) => row.id === paneId);
    const chars = String(pane?.input ?? "").trimEnd();
    if (!pane || !chars) {
      return;
    }
    setPanes((current) =>
      current.map((row) =>
        row.id === paneId
          ? {
              ...row,
              input: "",
              buffer: appendTerminalChunk(row.buffer, `\n$ ${chars}\n`),
            }
          : row,
      ),
    );
    try {
      await invoke("workspace_terminal_input", {
        sessionId: paneId,
        chars: `${chars}\n`,
      });
    } catch (error) {
      setPanes((current) =>
        current.map((row) =>
          row.id === paneId
            ? {
                ...row,
                status: "error",
                buffer: appendTerminalChunk(row.buffer, `\n[system] ${String(error ?? "failed to send input")}\n`),
              }
            : row,
        ),
      );
    }
  }, [panes]);

  const setPaneInput = useCallback((paneId: string, value: string) => {
    setPanes((current) => current.map((row) => row.id === paneId ? { ...row, input: value } : row));
  }, []);

  const clearPane = useCallback((paneId: string) => {
    setPanes((current) => current.map((row) => row.id === paneId ? { ...row, buffer: "" } : row));
  }, []);

  const startAllPanes = useCallback(() => {
    void Promise.all(rolePanes.map((pane) => startPane(pane.id)));
  }, [rolePanes, startPane]);

  const stopAllPanes = useCallback(() => {
    void Promise.all(rolePanes.map((pane) => stopPane(pane.id)));
  }, [rolePanes, stopPane]);

  return {
    panes,
    graphObserverText,
    startPane,
    stopPane,
    sendPaneInput,
    setPaneInput,
    clearPane,
    startAllPanes,
    stopAllPanes,
    statusMessage,
  };
}
