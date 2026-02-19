import { FormEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

type EngineNotificationEvent = {
  method: string;
  params: unknown;
};

type EngineLifecycleEvent = {
  state: string;
  message?: string | null;
};

type ThreadStartResult = {
  threadId: string;
  raw: unknown;
};

type LoginChatgptResult = {
  authUrl: string;
  raw: unknown;
};

type AuthMode = "chatgpt" | "apikey" | "unknown";
type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

type EngineApprovalRequestEvent = {
  requestId: number;
  method: string;
  params: unknown;
};

type PendingApproval = {
  requestId: number;
  method: string;
  params: unknown;
};

const APPROVAL_DECISIONS: ApprovalDecision[] = ["accept", "acceptForSession", "decline", "cancel"];

function formatUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractDeltaText(input: unknown, depth = 0): string {
  if (depth > 3 || input == null) {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => extractDeltaText(item, depth + 1)).join("");
  }

  if (typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;

  if (typeof record.delta === "string") {
    return record.delta;
  }
  if (typeof record.text === "string") {
    return record.text;
  }

  const candidates = [record.delta, record.content, record.item, record.message, record.data];
  return candidates.map((candidate) => extractDeltaText(candidate, depth + 1)).join("");
}

function extractAuthMode(input: unknown, depth = 0): AuthMode | null {
  if (depth > 4 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    if (input === "chatgpt" || input === "apikey") {
      return input;
    }
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const mode = extractAuthMode(item, depth + 1);
      if (mode) {
        return mode;
      }
    }
    return null;
  }
  if (typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.authMode === "string") {
    return extractAuthMode(record.authMode, depth + 1);
  }
  if (typeof record.auth_mode === "string") {
    return extractAuthMode(record.auth_mode, depth + 1);
  }

  const candidates = [record.account, record.user, record.data, record.payload];
  for (const candidate of candidates) {
    const mode = extractAuthMode(candidate, depth + 1);
    if (mode) {
      return mode;
    }
  }
  return null;
}

function extractCompletedStatus(input: unknown, depth = 0): string | null {
  if (depth > 4 || input == null) {
    return null;
  }
  if (typeof input === "string") {
    return input;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const status = extractCompletedStatus(item, depth + 1);
      if (status) {
        return status;
      }
    }
    return null;
  }
  if (typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.status === "string") {
    return record.status;
  }
  const candidates = [record.item, record.result, record.data, record.payload, record.output];
  for (const candidate of candidates) {
    const status = extractCompletedStatus(candidate, depth + 1);
    if (status) {
      return status;
    }
  }
  return null;
}

function App() {
  const defaultCwd = useMemo(() => ".", []);

  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("gpt-5-codex");
  const [threadId, setThreadId] = useState("");
  const [text, setText] = useState("안녕하세요. 지금 상태를 3줄로 요약해줘.");

  const [engineStarted, setEngineStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [authUrl, setAuthUrl] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("unknown");
  const [loginCompleted, setLoginCompleted] = useState(false);
  const [lastCompletedStatus, setLastCompletedStatus] = useState("unknown");
  const [streamText, setStreamText] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const attach = async () => {
      const unlistenNotification = await listen<EngineNotificationEvent>(
        "engine://notification",
        (event) => {
          const payload = event.payload;
          const now = new Date().toLocaleTimeString();
          const line = `[${now}] ${payload.method} ${formatUnknown(payload.params)}`;

          setEvents((prev) => [line, ...prev].slice(0, 200));

          if (payload.method === "item/agentMessage/delta") {
            const delta = extractDeltaText(payload.params);
            if (delta) {
              setStreamText((prev) => prev + delta);
            }
          }

          if (payload.method === "account/login/completed") {
            setLoginCompleted(true);
            setStatus("account/login/completed received");
          }

          if (payload.method === "account/updated") {
            const mode = extractAuthMode(payload.params);
            if (mode) {
              setAuthMode(mode);
              setStatus(`account/updated received (authMode=${mode})`);
            } else {
              setStatus("account/updated received (authMode unknown)");
            }
          }

          if (payload.method === "item/completed") {
            const completedStatus = extractCompletedStatus(payload.params) ?? "unknown";
            setLastCompletedStatus(completedStatus);
            setStatus(`item/completed status=${completedStatus}`);
          }
        },
      );

      const unlistenApprovalRequest = await listen<EngineApprovalRequestEvent>(
        "engine://approval_request",
        (event) => {
          const payload = event.payload;
          setPendingApprovals((prev) => {
            if (prev.some((item) => item.requestId === payload.requestId)) {
              return prev;
            }
            return [
              ...prev,
              {
                requestId: payload.requestId,
                method: payload.method,
                params: payload.params,
              },
            ];
          });
          setStatus(`approval requested (${payload.method})`);
        },
      );

      const unlistenLifecycle = await listen<EngineLifecycleEvent>(
        "engine://lifecycle",
        (event) => {
          const payload = event.payload;
          const msg = payload.message ? ` (${payload.message})` : "";
          setStatus(`${payload.state}${msg}`);

          if (payload.state === "ready") {
            setEngineStarted(true);
          }
          if (payload.state === "stopped" || payload.state === "disconnected") {
            setEngineStarted(false);
            setAuthMode("unknown");
            setLoginCompleted(false);
            setPendingApprovals([]);
            setApprovalSubmitting(false);
          }
        },
      );

      if (cancelled) {
        unlistenNotification();
        unlistenApprovalRequest();
        unlistenLifecycle();
      }

      return () => {
        unlistenNotification();
        unlistenApprovalRequest();
        unlistenLifecycle();
      };
    };

    let detach: (() => void) | undefined;
    attach()
      .then((fn) => {
        detach = fn;
      })
      .catch((e) => {
        setError(`event listen failed: ${String(e)}`);
      });

    return () => {
      cancelled = true;
      if (detach) {
        detach();
      }
    };
  }, []);

  async function ensureEngineStarted() {
    if (engineStarted) {
      return;
    }
    await invoke("engine_start", { cwd });
    setEngineStarted(true);
  }

  async function onStartEngine() {
    setError("");
    try {
      await ensureEngineStarted();
      setStatus("ready");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onStopEngine() {
    setError("");
    try {
      await invoke("engine_stop");
      setEngineStarted(false);
      setStatus("stopped");
      setRunning(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onLoginChatgpt() {
    setError("");
    setLoginCompleted(false);
    try {
      await ensureEngineStarted();
      const result = await invoke<LoginChatgptResult>("login_chatgpt");
      setAuthUrl(result.authUrl);
      setStatus("auth url received");
      try {
        await openUrl(result.authUrl);
        setStatus("auth url opened in external browser");
      } catch (openErr) {
        setStatus("auth url open failed, copy URL manually");
        setError(`openUrl failed: ${String(openErr)}`);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function onCopyAuthUrl() {
    if (!authUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(authUrl);
      setStatus("auth url copied");
    } catch (e) {
      setError(`clipboard copy failed: ${String(e)}`);
    }
  }

  async function onRunTurn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setRunning(true);

    try {
      await ensureEngineStarted();

      let activeThreadId = threadId.trim();
      if (!activeThreadId) {
        const result = await invoke<ThreadStartResult>("thread_start", {
          model,
          cwd,
        });
        activeThreadId = result.threadId;
        setThreadId(activeThreadId);
      }

      setStreamText((prev) => (prev ? `${prev}\n\n` : prev));
      await invoke("turn_start", {
        threadId: activeThreadId,
        text,
      });
      setStatus(`turn started (thread: ${activeThreadId})`);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onInterrupt() {
    if (!threadId.trim()) {
      return;
    }
    setError("");
    try {
      await invoke("turn_interrupt", { threadId });
      setStatus("interrupt requested");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRespondApproval(decision: ApprovalDecision) {
    const activeApproval = pendingApprovals[0];
    if (!activeApproval) {
      return;
    }

    setError("");
    setApprovalSubmitting(true);
    try {
      await invoke("approval_respond", {
        requestId: activeApproval.requestId,
        result: {
          decision,
        },
      });
      setPendingApprovals((prev) => prev.slice(1));
      setStatus(`approval response sent (${decision})`);
    } catch (e) {
      setError(String(e));
    } finally {
      setApprovalSubmitting(false);
    }
  }

  const activeApproval = pendingApprovals[0];

  return (
    <main className="app">
      <section className="auth-banner">
        <span>Current authMode</span>
        <strong>{authMode}</strong>
      </section>

      <h1>Codex Engine Smoke Test</h1>

      <section className="controls">
        <label>
          CWD
          <input value={cwd} onChange={(e) => setCwd(e.currentTarget.value)} />
        </label>

        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.currentTarget.value)} />
        </label>

        <label>
          Thread ID
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.currentTarget.value)}
            placeholder="thread_start 결과 자동 입력"
          />
        </label>

        <div className="button-row">
          <button onClick={onStartEngine} disabled={running} type="button">
            Engine Start
          </button>
          <button onClick={onStopEngine} type="button">
            Engine Stop
          </button>
          <button onClick={onLoginChatgpt} disabled={running} type="button">
            Login ChatGPT
          </button>
          <button onClick={onInterrupt} disabled={!threadId} type="button">
            Interrupt
          </button>
        </div>
      </section>

      <form className="prompt" onSubmit={onRunTurn}>
        <label>
          Input
          <textarea value={text} onChange={(e) => setText(e.currentTarget.value)} rows={4} />
        </label>
        <button disabled={running || !text.trim()} type="submit">
          {running ? "Running..." : "실행"}
        </button>
      </form>

      <section className="meta">
        <div>engineStarted: {String(engineStarted)}</div>
        <div>status: {status}</div>
        <div>loginCompleted: {String(loginCompleted)}</div>
        <div>pendingApprovals: {pendingApprovals.length}</div>
        <div>last item/completed status: {lastCompletedStatus}</div>
        {authUrl && (
          <div>
            authUrl: <code>{authUrl}</code>{" "}
            <button onClick={onCopyAuthUrl} type="button">
              Copy
            </button>
          </div>
        )}
        {error && <div className="error">error: {error}</div>}
      </section>

      <section className="panels">
        <article>
          <h2>Streaming Output</h2>
          <pre>{streamText || "(waiting for item/agentMessage/delta...)"}</pre>
        </article>

        <article>
          <h2>Notifications</h2>
          <pre>{events.join("\n") || "(no events yet)"}</pre>
        </article>
      </section>

      {activeApproval && (
        <div className="modal-backdrop">
          <section className="approval-modal">
            <h2>Approval Required</h2>
            <div>method: {activeApproval.method}</div>
            <div>requestId: {activeApproval.requestId}</div>
            <pre>{formatUnknown(activeApproval.params)}</pre>
            <div className="button-row">
              {APPROVAL_DECISIONS.map((decision) => (
                <button
                  disabled={approvalSubmitting}
                  key={decision}
                  onClick={() => onRespondApproval(decision)}
                  type="button"
                >
                  {decision}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
