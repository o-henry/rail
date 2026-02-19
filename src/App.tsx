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
  const [streamText, setStreamText] = useState("");
  const [events, setEvents] = useState<string[]>([]);

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
          }
        },
      );

      if (cancelled) {
        unlistenNotification();
        unlistenLifecycle();
      }

      return () => {
        unlistenNotification();
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
    try {
      await ensureEngineStarted();
      const result = await invoke<LoginChatgptResult>("login_chatgpt");
      setAuthUrl(result.authUrl);
      await openUrl(result.authUrl);
      setStatus("auth url opened");
    } catch (e) {
      setError(String(e));
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

  return (
    <main className="app">
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
        {authUrl && (
          <div>
            authUrl: <code>{authUrl}</code>
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
    </main>
  );
}

export default App;
