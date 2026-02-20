use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    task::JoinHandle,
    time::{timeout, Duration},
};

const EVENT_ENGINE_NOTIFICATION: &str = "engine://notification";
const EVENT_ENGINE_LIFECYCLE: &str = "engine://lifecycle";
const EVENT_ENGINE_APPROVAL_REQUEST: &str = "engine://approval_request";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Default)]
pub struct EngineManager {
    runtime: Mutex<Option<Arc<EngineRuntime>>>,
}

#[derive(Debug, Serialize, Clone)]
struct EngineNotificationEvent {
    method: String,
    params: Value,
}

#[derive(Debug, Serialize, Clone)]
struct EngineLifecycleEvent {
    state: String,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RpcIncomingMessage {
    #[serde(default)]
    id: Option<Value>,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    params: Option<Value>,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
    #[serde(default)]
    data: Option<Value>,
}

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, String>>>;
type PendingServerRequestMap = HashMap<u64, String>;

struct EngineRuntime {
    app: AppHandle,
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<PendingMap>>,
    pending_server_requests: Arc<Mutex<PendingServerRequestMap>>,
    next_id: AtomicU64,
    initialized: AtomicBool,
    reader_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EngineApprovalRequestEvent {
    request_id: u64,
    method: String,
    params: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginChatgptResult {
    auth_url: String,
    raw: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStartResult {
    thread_id: String,
    raw: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageCheckResult {
    source_method: String,
    raw: Value,
}

impl EngineRuntime {
    async fn start(app: AppHandle, cwd: String) -> Result<Arc<Self>, String> {
        let mut child = Command::new("codex")
            .arg("app-server")
            .arg("--listen")
            .arg("stdio://")
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to spawn codex app-server: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to open child stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "failed to open child stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "failed to open child stderr".to_string())?;

        let pending = Arc::new(Mutex::new(HashMap::new()));
        let pending_server_requests = Arc::new(Mutex::new(HashMap::new()));
        let child = Arc::new(Mutex::new(child));
        let stdin = Arc::new(Mutex::new(stdin));

        let reader_task = {
            let app = app.clone();
            let pending = pending.clone();
            let pending_server_requests = pending_server_requests.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();

                loop {
                    match lines.next_line().await {
                        Ok(Some(raw_line)) => {
                            let line = raw_line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            if let Err(err) =
                                handle_incoming_line(&app, &pending, &pending_server_requests, line)
                                    .await
                            {
                                emit_lifecycle(
                                    &app,
                                    "parseError",
                                    Some(format!("failed to parse incoming JSON-RPC line: {err}")),
                                );
                            }
                        }
                        Ok(None) => {
                            emit_lifecycle(&app, "disconnected", Some("stdout closed".to_string()));
                            break;
                        }
                        Err(err) => {
                            emit_lifecycle(
                                &app,
                                "readError",
                                Some(format!("failed while reading stdout: {err}")),
                            );
                            break;
                        }
                    }
                }

                resolve_all_pending(&pending, "engine output stream closed").await;
            })
        };

        let stderr_task = {
            let app = app.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) => {
                            let payload = EngineNotificationEvent {
                                method: "engine/stderr".to_string(),
                                params: json!({ "line": line }),
                            };
                            let _ = app.emit(EVENT_ENGINE_NOTIFICATION, payload);
                        }
                        Ok(None) => break,
                        Err(err) => {
                            emit_lifecycle(
                                &app,
                                "stderrError",
                                Some(format!("failed while reading stderr: {err}")),
                            );
                            break;
                        }
                    }
                }
            })
        };

        let runtime = Arc::new(Self {
            app,
            child,
            stdin,
            pending,
            pending_server_requests,
            next_id: AtomicU64::new(1),
            initialized: AtomicBool::new(false),
            reader_task,
            stderr_task,
        });

        emit_lifecycle(&runtime.app, "starting", None);
        if let Err(err) = runtime.initialize_handshake().await {
            let _ = runtime.stop().await;
            return Err(err);
        }
        emit_lifecycle(&runtime.app, "ready", None);

        Ok(runtime)
    }

    async fn initialize_handshake(&self) -> Result<(), String> {
        let _ = self
            .request_internal(
                "initialize",
                json!({
                  "clientInfo": {
                    "name": "rail",
                    "version": env!("CARGO_PKG_VERSION")
                  },
                  "capabilities": {}
                }),
                false,
            )
            .await?;

        self.notify_internal("initialized", json!({}), false)
            .await?;
        self.initialized.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.request_internal(method, params, true).await
    }

    async fn request_internal(
        &self,
        method: &str,
        params: Value,
        require_initialized: bool,
    ) -> Result<Value, String> {
        if require_initialized && !self.initialized.load(Ordering::SeqCst) {
            return Err("Not initialized".to_string());
        }

        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let payload = json!({
          "jsonrpc": "2.0",
          "id": id,
          "method": method,
          "params": params
        });

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        if let Err(err) = self.write_jsonl(&payload).await {
            self.pending.lock().await.remove(&id);
            return Err(err);
        }

        match timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_recv_closed)) => Err("response channel closed".to_string()),
            Err(_elapsed) => {
                self.pending.lock().await.remove(&id);
                Err(format!("request timed out: {method}"))
            }
        }
    }

    async fn notify_internal(
        &self,
        method: &str,
        params: Value,
        require_initialized: bool,
    ) -> Result<(), String> {
        if require_initialized && !self.initialized.load(Ordering::SeqCst) {
            return Err("Not initialized".to_string());
        }

        let payload = json!({
          "jsonrpc": "2.0",
          "method": method,
          "params": params
        });

        self.write_jsonl(&payload).await
    }

    async fn write_jsonl(&self, payload: &Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(payload)
            .map_err(|e| format!("failed to serialize JSON-RPC payload: {e}"))?;
        bytes.push(b'\n');

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(&bytes)
            .await
            .map_err(|e| format!("failed to write to app-server stdin: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("failed to flush app-server stdin: {e}"))
    }

    async fn stop(&self) -> Result<(), String> {
        self.initialized.store(false, Ordering::SeqCst);

        self.reader_task.abort();
        self.stderr_task.abort();

        {
            let mut child = self.child.lock().await;
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        resolve_all_pending(&self.pending, "engine stopped").await;
        self.pending_server_requests.lock().await.clear();
        emit_lifecycle(&self.app, "stopped", None);

        Ok(())
    }

    async fn respond_server_request(&self, request_id: u64, result: Value) -> Result<(), String> {
        let method = self
            .pending_server_requests
            .lock()
            .await
            .remove(&request_id)
            .ok_or_else(|| format!("unknown approval request id: {request_id}"))?;

        let payload = json!({
          "jsonrpc": "2.0",
          "id": request_id,
          "result": result
        });

        self.write_jsonl(&payload).await?;

        let _ = self.app.emit(
            EVENT_ENGINE_NOTIFICATION,
            EngineNotificationEvent {
                method: "engine/approvalResponseSent".to_string(),
                params: json!({
                    "requestId": request_id,
                    "approvalMethod": method
                }),
            },
        );

        Ok(())
    }
}

async fn handle_incoming_line(
    app: &AppHandle,
    pending: &Arc<Mutex<PendingMap>>,
    pending_server_requests: &Arc<Mutex<PendingServerRequestMap>>,
    line: &str,
) -> Result<(), String> {
    let incoming: RpcIncomingMessage =
        serde_json::from_str(line).map_err(|e| format!("invalid json: {e}"))?;

    if let (Some(method), Some(id_value)) = (incoming.method.clone(), incoming.id.as_ref()) {
        if incoming.result.is_none() && incoming.error.is_none() {
            if let Some(request_id) = rpc_id_to_u64(id_value) {
                if is_approval_method(&method) {
                    pending_server_requests
                        .lock()
                        .await
                        .insert(request_id, method.clone());
                    let params = incoming.params.unwrap_or(Value::Null);
                    let payload = EngineApprovalRequestEvent {
                        request_id,
                        method: method.clone(),
                        params: params.clone(),
                    };
                    let _ = app.emit(EVENT_ENGINE_APPROVAL_REQUEST, payload);
                    let _ = app.emit(
                        EVENT_ENGINE_NOTIFICATION,
                        EngineNotificationEvent { method, params },
                    );
                } else {
                    let _ = app.emit(
                        EVENT_ENGINE_NOTIFICATION,
                        EngineNotificationEvent {
                            method: "engine/unhandledServerRequest".to_string(),
                            params: json!({
                                "requestId": request_id,
                                "method": method,
                                "params": incoming.params.unwrap_or(Value::Null)
                            }),
                        },
                    );
                }
            }
            return Ok(());
        }
    }

    if let Some(method) = incoming.method {
        if incoming.id.is_none() {
            let payload = EngineNotificationEvent {
                method,
                params: incoming.params.unwrap_or(Value::Null),
            };
            let _ = app.emit(EVENT_ENGINE_NOTIFICATION, payload);
            return Ok(());
        }
    }

    if let Some(id_value) = incoming.id {
        if let Some(id) = rpc_id_to_u64(&id_value) {
            if let Some(sender) = pending.lock().await.remove(&id) {
                let response = if let Some(err) = incoming.error {
                    Err(format_rpc_error(err))
                } else {
                    Ok(incoming.result.unwrap_or(Value::Null))
                };
                let _ = sender.send(response);
            }
        }
    }

    Ok(())
}

fn is_approval_method(method: &str) -> bool {
    matches!(
        method,
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
    )
}

async fn resolve_all_pending(pending: &Arc<Mutex<PendingMap>>, reason: &str) {
    let mut locked = pending.lock().await;
    for (_id, sender) in locked.drain() {
        let _ = sender.send(Err(reason.to_string()));
    }
}

fn rpc_id_to_u64(id: &Value) -> Option<u64> {
    match id {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.parse::<u64>().ok(),
        _ => None,
    }
}

fn format_rpc_error(err: RpcError) -> String {
    match err.data {
        Some(data) => format!("rpc error {}: {} ({data})", err.code, err.message),
        None => format!("rpc error {}: {}", err.code, err.message),
    }
}

fn emit_lifecycle(app: &AppHandle, state: &str, message: Option<String>) {
    let payload = EngineLifecycleEvent {
        state: state.to_string(),
        message,
    };
    let _ = app.emit(EVENT_ENGINE_LIFECYCLE, payload);
}

fn provider_url(provider: &str) -> Option<&'static str> {
    match provider {
        "gemini" => Some("https://gemini.google.com/"),
        "grok" => Some("https://grok.com/"),
        "perplexity" => Some("https://www.perplexity.ai/"),
        "claude" => Some("https://claude.ai/"),
        _ => None,
    }
}

async fn current_runtime(state: &EngineManager) -> Result<Arc<EngineRuntime>, String> {
    state
        .runtime
        .lock()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| "engine is not started".to_string())
}

fn extract_string_by_paths(value: &Value, paths: &[&str]) -> Option<String> {
    for path in paths {
        let mut current = value;
        let mut found = true;

        for part in path.split('.') {
            match current.get(part) {
                Some(next) => current = next,
                None => {
                    found = false;
                    break;
                }
            }
        }

        if found {
            if let Some(s) = current.as_str() {
                return Some(s.to_string());
            }
        }
    }

    None
}

#[tauri::command]
pub async fn engine_start(
    app: AppHandle,
    state: State<'_, EngineManager>,
    cwd: String,
) -> Result<(), String> {
    {
        if state.runtime.lock().await.is_some() {
            return Err("engine already started".to_string());
        }
    }

    let runtime = EngineRuntime::start(app, cwd).await?;

    let mut locked = state.runtime.lock().await;
    if locked.is_some() {
        // Extremely unlikely race; stop the newly created runtime to avoid leaks.
        drop(locked);
        runtime.stop().await?;
        return Err("engine already started".to_string());
    }
    *locked = Some(runtime);

    Ok(())
}

#[tauri::command]
pub async fn engine_stop(state: State<'_, EngineManager>) -> Result<(), String> {
    let runtime = state.runtime.lock().await.take();
    if let Some(runtime) = runtime {
        runtime.stop().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn login_chatgpt(state: State<'_, EngineManager>) -> Result<LoginChatgptResult, String> {
    let runtime = current_runtime(&state).await?;
    let raw = runtime
        .request("account/login/start", json!({ "type": "chatgpt" }))
        .await?;

    let auth_url = extract_string_by_paths(&raw, &["authUrl", "auth_url", "url"])
        .ok_or_else(|| format!("authUrl not found in response: {raw}"))?;

    Ok(LoginChatgptResult { auth_url, raw })
}

#[tauri::command]
pub async fn usage_check(state: State<'_, EngineManager>) -> Result<UsageCheckResult, String> {
    let runtime = current_runtime(&state).await?;
    let candidates: [(&str, Value); 4] = [
        ("account/usage/get", json!({})),
        ("account/usage", json!({})),
        ("account/get", json!({})),
        ("account/status", json!({})),
    ];

    let mut errors: Vec<String> = Vec::new();
    for (method, params) in candidates {
        match runtime.request(method, params).await {
            Ok(raw) => {
                return Ok(UsageCheckResult {
                    source_method: method.to_string(),
                    raw,
                });
            }
            Err(err) => {
                errors.push(format!("{method}: {err}"));
            }
        }
    }

    Err(format!(
        "failed to fetch usage info from app-server; attempted methods: {}",
        errors.join(" | ")
    ))
}

#[tauri::command]
pub async fn thread_start(
    state: State<'_, EngineManager>,
    model: String,
    cwd: String,
) -> Result<ThreadStartResult, String> {
    let runtime = current_runtime(&state).await?;
    let raw = runtime
        .request(
            "thread/start",
            json!({
              "model": model,
              "cwd": cwd,
              "sandboxPolicy": "readOnly"
            }),
        )
        .await?;

    let thread_id = extract_string_by_paths(
        &raw,
        &[
            "threadId",
            "thread_id",
            "id",
            "thread.id",
            "thread.threadId",
            "thread.thread_id",
        ],
    )
    .ok_or_else(|| format!("thread id not found in response: {raw}"))?;

    Ok(ThreadStartResult { thread_id, raw })
}

#[tauri::command]
pub async fn turn_start(
    state: State<'_, EngineManager>,
    thread_id: String,
    text: String,
) -> Result<Value, String> {
    let runtime = current_runtime(&state).await?;

    runtime
        .request(
            "turn/start",
            json!({
              "threadId": thread_id,
              "text": text,
              "input": [
                {
                  "type": "text",
                  "text": text
                }
              ],
              "sandboxPolicy": "readOnly"
            }),
        )
        .await
}

#[tauri::command]
pub async fn turn_interrupt(
    state: State<'_, EngineManager>,
    thread_id: String,
) -> Result<Value, String> {
    let runtime = current_runtime(&state).await?;
    runtime
        .request(
            "turn/interrupt",
            json!({
              "threadId": thread_id
            }),
        )
        .await
}

#[tauri::command]
pub async fn approval_respond(
    state: State<'_, EngineManager>,
    request_id: u64,
    result: Value,
) -> Result<(), String> {
    let runtime = current_runtime(&state).await?;
    runtime.respond_server_request(request_id, result).await
}

#[tauri::command]
pub async fn provider_window_open(app: AppHandle, provider: String) -> Result<(), String> {
    let provider_key = provider.trim().to_lowercase();
    let url = provider_url(&provider_key)
        .ok_or_else(|| format!("unsupported provider: {provider}"))?;
    let window_id = format!("provider-{provider_key}");

    if let Some(window) = app.get_webview_window(&window_id) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let external = url
        .parse()
        .map_err(|e| format!("invalid provider url ({url}): {e}"))?;
    WebviewWindowBuilder::new(&app, &window_id, WebviewUrl::External(external))
        .title(&format!("{provider_key} - rail"))
        .inner_size(1280.0, 860.0)
        .min_inner_size(1024.0, 700.0)
        .center()
        .build()
        .map_err(|e| format!("failed to open provider window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn provider_window_close(app: AppHandle, provider: String) -> Result<(), String> {
    let provider_key = provider.trim().to_lowercase();
    let window_id = format!("provider-{provider_key}");
    let window = app
        .get_webview_window(&window_id)
        .ok_or_else(|| format!("provider window not found: {provider_key}"))?;
    window
        .close()
        .map_err(|e| format!("failed to close provider window: {e}"))?;
    Ok(())
}
