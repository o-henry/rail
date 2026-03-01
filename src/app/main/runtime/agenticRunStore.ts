import type { AgenticRunEnvelope, AgenticRunEvent } from "../../../features/orchestration/agentic/runContract";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function trimTrailingSlashes(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function toRunDir(cwd: string, runId: string): string {
  const base = trimTrailingSlashes(String(cwd ?? "").trim());
  const id = String(runId ?? "").trim();
  if (!base || !id) {
    return "";
  }
  return `${base}/.rail/runs/${id}`;
}

export function serializeRunEventsNdjson(events: AgenticRunEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

export async function persistAgenticRunEnvelope(params: {
  cwd: string;
  invokeFn: InvokeFn;
  envelope: AgenticRunEnvelope;
}): Promise<string | null> {
  const runDir = toRunDir(params.cwd, params.envelope.record.runId);
  if (!runDir) {
    return null;
  }
  const content = `${JSON.stringify(params.envelope, null, 2)}\n`;
  try {
    return await params.invokeFn<string>("workspace_write_text", {
      cwd: runDir,
      name: "run.json",
      content,
    });
  } catch {
    return null;
  }
}

export async function persistAgenticRunEvents(params: {
  cwd: string;
  invokeFn: InvokeFn;
  runId: string;
  events: AgenticRunEvent[];
}): Promise<string | null> {
  const runDir = toRunDir(params.cwd, params.runId);
  if (!runDir) {
    return null;
  }
  const content = serializeRunEventsNdjson(params.events);
  try {
    return await params.invokeFn<string>("workspace_write_text", {
      cwd: runDir,
      name: "events.ndjson",
      content,
    });
  } catch {
    return null;
  }
}
