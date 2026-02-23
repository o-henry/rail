use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};
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
const WEB_WORKER_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const CHILD_VIEW_LABEL_PREFIX: &str = "provider-child-";
const CHILD_VIEW_MIN_WIDTH: u32 = 560;
const CHILD_VIEW_MIN_HEIGHT: u32 = 360;
const CHILD_VIEW_MAX_WIDTH: u32 = 900;
const CHILD_VIEW_MAX_HEIGHT: u32 = 560;
const CHILD_VIEW_WIDTH_RATIO: f64 = 0.42;
const CHILD_VIEW_HEIGHT_RATIO: f64 = 0.34;
const CHILD_VIEW_SAFE_MARGIN_X: u32 = 44;
const CHILD_VIEW_SAFE_MARGIN_TOP: u32 = 212;
const CHILD_VIEW_SAFE_MARGIN_BOTTOM: u32 = 36;

#[derive(Default)]
pub struct EngineManager {
    runtime: Mutex<Option<Arc<EngineRuntime>>>,
    web_worker: Mutex<Option<Arc<WebWorkerRuntime>>>,
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
type WebPendingMap = HashMap<u64, oneshot::Sender<Result<Value, String>>>;

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

struct WebWorkerRuntime {
    app: AppHandle,
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<WebPendingMap>>,
    next_id: AtomicU64,
    reader_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
    log_path: PathBuf,
    profile_root: PathBuf,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProbeResult {
    state: String,
    source_method: Option<String>,
    auth_mode: Option<String>,
    raw: Option<Value>,
    detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WebProviderRunMeta {
    pub provider: String,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub elapsed_ms: Option<u64>,
    pub extraction_strategy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WebProviderRunResult {
    pub ok: bool,
    pub text: Option<String>,
    pub raw: Option<Value>,
    pub meta: Option<WebProviderRunMeta>,
    pub error: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WebWorkerHealth {
    pub running: bool,
    pub last_error: Option<String>,
    pub providers: Value,
    pub log_path: Option<String>,
    pub profile_root: Option<String>,
    pub active_provider: Option<String>,
}

impl EngineRuntime {
    async fn start(app: AppHandle, cwd: String) -> Result<Arc<Self>, String> {
        let codex_home = resolve_codex_home_dir(&app).await?;

        let mut child = Command::new("codex")
            .arg("app-server")
            .arg("--listen")
            .arg("stdio://")
            .current_dir(cwd)
            .env("CODEX_HOME", &codex_home)
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

impl WebWorkerRuntime {
    async fn start(app: AppHandle) -> Result<Arc<Self>, String> {
        let worker_script = resolve_web_worker_script_path()?;
        let (profile_root, log_path) = resolve_web_worker_dirs(&app).await?;

        let project_root = worker_script
            .parent()
            .and_then(|parent| parent.parent())
            .ok_or_else(|| format!("invalid worker script path: {}", worker_script.display()))?
            .to_path_buf();

        let mut child = Command::new("node")
            .arg(&worker_script)
            .current_dir(project_root)
            .env("RAIL_WEB_PROFILE_ROOT", &profile_root)
            .env("RAIL_WEB_LOG_PATH", &log_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to spawn web worker: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to open web worker stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "failed to open web worker stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "failed to open web worker stderr".to_string())?;

        let pending: Arc<Mutex<WebPendingMap>> = Arc::new(Mutex::new(HashMap::new()));
        let child = Arc::new(Mutex::new(child));
        let stdin = Arc::new(Mutex::new(stdin));

        let reader_task = {
            let app = app.clone();
            let pending = pending.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(raw_line)) => {
                            let line = raw_line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            if let Err(err) = handle_web_worker_incoming_line(&app, &pending, line).await {
                                let _ = app.emit(
                                    EVENT_ENGINE_NOTIFICATION,
                                    EngineNotificationEvent {
                                        method: "web/worker/parseError".to_string(),
                                        params: json!({ "error": err.to_string() }),
                                    },
                                );
                            }
                        }
                        Ok(None) => {
                            let _ = app.emit(
                                EVENT_ENGINE_NOTIFICATION,
                                EngineNotificationEvent {
                                    method: "web/worker/stopped".to_string(),
                                    params: json!({ "reason": "stdout closed" }),
                                },
                            );
                            break;
                        }
                        Err(err) => {
                            let _ = app.emit(
                                EVENT_ENGINE_NOTIFICATION,
                                EngineNotificationEvent {
                                    method: "web/worker/readError".to_string(),
                                    params: json!({ "error": err.to_string() }),
                                },
                            );
                            break;
                        }
                    }
                }
                resolve_all_web_pending(&pending, "web worker output stream closed").await;
            })
        };

        let stderr_task = {
            let app = app.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) => {
                            let _ = app.emit(
                                EVENT_ENGINE_NOTIFICATION,
                                EngineNotificationEvent {
                                    method: "web/worker/stderr".to_string(),
                                    params: json!({ "line": line }),
                                },
                            );
                        }
                        Ok(None) => break,
                        Err(err) => {
                            let _ = app.emit(
                                EVENT_ENGINE_NOTIFICATION,
                                EngineNotificationEvent {
                                    method: "web/worker/stderrError".to_string(),
                                    params: json!({ "error": err.to_string() }),
                                },
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
            next_id: AtomicU64::new(1),
            reader_task,
            stderr_task,
            log_path,
            profile_root,
        });

        let _ = runtime.app.emit(
            EVENT_ENGINE_NOTIFICATION,
            EngineNotificationEvent {
                method: "web/worker/ready".to_string(),
                params: json!({
                    "profileRoot": runtime.profile_root,
                    "logPath": runtime.log_path
                }),
            },
        );

        Ok(runtime)
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
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

        match timeout(WEB_WORKER_REQUEST_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("web worker response channel closed".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!("web worker request timed out: {method}"))
            }
        }
    }

    async fn write_jsonl(&self, payload: &Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(payload)
            .map_err(|e| format!("failed to serialize web worker payload: {e}"))?;
        bytes.push(b'\n');

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(&bytes)
            .await
            .map_err(|e| format!("failed to write to web worker stdin: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("failed to flush web worker stdin: {e}"))
    }

    async fn stop(&self) -> Result<(), String> {
        self.reader_task.abort();
        self.stderr_task.abort();
        {
            let mut child = self.child.lock().await;
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        resolve_all_web_pending(&self.pending, "web worker stopped").await;
        let _ = self.app.emit(
            EVENT_ENGINE_NOTIFICATION,
            EngineNotificationEvent {
                method: "web/worker/stopped".to_string(),
                params: json!({ "reason": "engine command stop" }),
            },
        );
        Ok(())
    }
}

fn resolve_web_worker_script_path() -> Result<PathBuf, String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/web_worker/index.mjs");
    if !path.exists() {
        return Err(format!("web worker script not found: {}", path.display()));
    }
    Ok(path)
}

async fn resolve_web_worker_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    ensure_private_dir(&app_data_dir, "app data dir").await?;

    let profile_root = app_data_dir.join("providers");
    ensure_private_dir(&profile_root, "provider profile root").await?;

    let log_path = app_data_dir.join("web-worker.log");
    if let Some(parent) = log_path.parent() {
        ensure_private_dir(parent, "worker log dir").await?;
    }

    Ok((profile_root, log_path))
}

async fn resolve_codex_home_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    ensure_private_dir(&app_data_dir, "app data dir").await?;

    let codex_home = app_data_dir.join("codex-home");
    ensure_private_dir(&codex_home, "codex home dir").await?;
    Ok(codex_home)
}

async fn ensure_private_dir(path: &Path, label: &str) -> Result<(), String> {
    tokio::fs::create_dir_all(path)
        .await
        .map_err(|e| format!("failed to create {label}: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .await
            .map_err(|e| format!("failed to tighten permissions for {label}: {e}"))?;
    }

    Ok(())
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

async fn handle_web_worker_incoming_line(
    app: &AppHandle,
    pending: &Arc<Mutex<WebPendingMap>>,
    line: &str,
) -> Result<(), String> {
    let incoming: RpcIncomingMessage =
        serde_json::from_str(line).map_err(|e| format!("invalid json: {e}"))?;

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

async fn resolve_all_web_pending(pending: &Arc<Mutex<WebPendingMap>>, reason: &str) {
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
        "gpt" => Some("https://chatgpt.com/"),
        "grok" => Some("https://grok.com/"),
        "perplexity" => Some("https://www.perplexity.ai/"),
        "claude" => Some("https://claude.ai/"),
        _ => None,
    }
}

fn provider_child_view_label(provider_key: &str) -> String {
    format!("{CHILD_VIEW_LABEL_PREFIX}{provider_key}")
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

async fn current_web_worker(state: &EngineManager) -> Result<Arc<WebWorkerRuntime>, String> {
    state
        .web_worker
        .lock()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| "web worker is not started".to_string())
}

async fn ensure_web_worker_started(
    app: &AppHandle,
    state: &EngineManager,
) -> Result<Arc<WebWorkerRuntime>, String> {
    if let Some(runtime) = state.web_worker.lock().await.as_ref().cloned() {
        return Ok(runtime);
    }

    let runtime = WebWorkerRuntime::start(app.clone()).await?;
    let mut locked = state.web_worker.lock().await;
    if let Some(existing) = locked.as_ref().cloned() {
        drop(locked);
        runtime.stop().await?;
        return Ok(existing);
    }
    *locked = Some(runtime.clone());
    Ok(runtime)
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

fn extract_bool_by_paths(value: &Value, paths: &[&str]) -> Option<bool> {
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
            if let Some(flag) = current.as_bool() {
                return Some(flag);
            }
        }
    }
    None
}

fn extract_auth_mode(value: &Value, depth: usize) -> Option<String> {
    if depth > 4 {
        return None;
    }

    match value {
        Value::String(mode) => {
            let normalized = mode.trim().to_lowercase();
            if normalized == "chatgpt" {
                Some("chatgpt".to_string())
            } else if normalized == "apikey" || normalized == "api_key" || normalized == "api-key" {
                Some("apikey".to_string())
            } else {
                None
            }
        }
        Value::Array(items) => items.iter().find_map(|item| extract_auth_mode(item, depth + 1)),
        Value::Object(map) => {
            if let Some(mode) = map
                .get("authMode")
                .and_then(|candidate| extract_auth_mode(candidate, depth + 1))
            {
                return Some(mode);
            }
            if let Some(mode) = map
                .get("auth_mode")
                .and_then(|candidate| extract_auth_mode(candidate, depth + 1))
            {
                return Some(mode);
            }

            ["account", "user", "data", "payload"]
                .iter()
                .filter_map(|key| map.get(*key))
                .find_map(|candidate| extract_auth_mode(candidate, depth + 1))
        }
        _ => None,
    }
}

fn is_login_required_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    (lower.contains("login") || lower.contains("auth"))
        && (lower.contains("required")
            || lower.contains("unauthorized")
            || lower.contains("forbidden"))
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
pub async fn web_worker_start(
    app: AppHandle,
    state: State<'_, EngineManager>,
) -> Result<(), String> {
    let _ = ensure_web_worker_started(&app, &state).await?;
    Ok(())
}

#[tauri::command]
pub async fn web_worker_stop(state: State<'_, EngineManager>) -> Result<(), String> {
    let runtime = state.web_worker.lock().await.take();
    if let Some(runtime) = runtime {
        runtime.stop().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn web_provider_health(
    app: AppHandle,
    state: State<'_, EngineManager>,
) -> Result<WebWorkerHealth, String> {
    if let Ok(runtime) = current_web_worker(&state).await {
        let raw = runtime.request("health", json!({})).await?;
        let mut parsed = serde_json::from_value::<WebWorkerHealth>(raw).unwrap_or(WebWorkerHealth {
            running: true,
            last_error: None,
            providers: json!({}),
            log_path: Some(runtime.log_path.to_string_lossy().to_string()),
            profile_root: Some(runtime.profile_root.to_string_lossy().to_string()),
            active_provider: None,
        });
        parsed.running = true;
        if parsed.log_path.is_none() {
            parsed.log_path = Some(runtime.log_path.to_string_lossy().to_string());
        }
        if parsed.profile_root.is_none() {
            parsed.profile_root = Some(runtime.profile_root.to_string_lossy().to_string());
        }
        return Ok(parsed);
    }

    let (profile_root, log_path) = resolve_web_worker_dirs(&app).await?;
    Ok(WebWorkerHealth {
        running: false,
        last_error: None,
        providers: json!({}),
        log_path: Some(log_path.to_string_lossy().to_string()),
        profile_root: Some(profile_root.to_string_lossy().to_string()),
        active_provider: None,
    })
}

#[tauri::command]
pub async fn web_provider_run(
    app: AppHandle,
    state: State<'_, EngineManager>,
    provider: String,
    prompt: String,
    timeout_ms: Option<u64>,
    mode: Option<String>,
) -> Result<WebProviderRunResult, String> {
    let runtime = ensure_web_worker_started(&app, &state).await?;
    let raw = runtime
        .request(
            "provider/run",
            json!({
                "provider": provider,
                "prompt": prompt,
                "timeoutMs": timeout_ms.unwrap_or(90_000),
                "mode": mode.unwrap_or_else(|| "auto".to_string())
            }),
        )
        .await?;

    serde_json::from_value(raw).map_err(|e| format!("invalid web provider run response: {e}"))
}

#[tauri::command]
pub async fn web_provider_open_session(
    app: AppHandle,
    state: State<'_, EngineManager>,
    provider: String,
) -> Result<Value, String> {
    let runtime = ensure_web_worker_started(&app, &state).await?;
    runtime
        .request("provider/openSession", json!({ "provider": provider }))
        .await
}

#[tauri::command]
pub async fn web_provider_reset_session(
    app: AppHandle,
    state: State<'_, EngineManager>,
    provider: String,
) -> Result<(), String> {
    let runtime = ensure_web_worker_started(&app, &state).await?;
    let _ = runtime
        .request("provider/resetSession", json!({ "provider": provider }))
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn web_provider_cancel(
    state: State<'_, EngineManager>,
    provider: String,
) -> Result<(), String> {
    let runtime = match current_web_worker(&state).await {
        Ok(runtime) => runtime,
        Err(_) => return Ok(()),
    };
    let _ = runtime
        .request("provider/cancel", json!({ "provider": provider }))
        .await?;
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
    let candidates: [(&str, Value); 6] = [
        ("account/rateLimits/read", Value::Null),
        ("account/read", json!({})),
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
pub async fn auth_probe(state: State<'_, EngineManager>) -> Result<AuthProbeResult, String> {
    let runtime = current_runtime(&state).await?;
    let candidates: [(&str, Value); 6] = [
        ("account/read", json!({})),
        ("account/rateLimits/read", Value::Null),
        ("account/status", json!({})),
        ("account/get", json!({})),
        ("account/usage/get", json!({})),
        ("account/usage", json!({})),
    ];
    let auth_bool_paths = [
        "authenticated",
        "isAuthenticated",
        "loggedIn",
        "isLoggedIn",
        "account.authenticated",
        "account.loggedIn",
    ];

    let mut errors: Vec<String> = Vec::new();
    let mut saw_login_required = false;

    for (method, params) in candidates {
        match runtime.request(method, params).await {
            Ok(raw) => {
                let auth_mode = extract_auth_mode(&raw, 0);
                let state = if auth_mode.is_some() {
                    "authenticated"
                } else if let Some(flag) = extract_bool_by_paths(&raw, &auth_bool_paths) {
                    if flag {
                        "authenticated"
                    } else {
                        "login_required"
                    }
                } else if method.starts_with("account/usage")
                    || method == "account/rateLimits/read"
                    || method == "account/read"
                {
                    // Account endpoints succeeded, so auth is effectively active.
                    "authenticated"
                } else {
                    "unknown"
                };

                return Ok(AuthProbeResult {
                    state: state.to_string(),
                    source_method: Some(method.to_string()),
                    auth_mode,
                    raw: Some(raw),
                    detail: None,
                });
            }
            Err(err) => {
                if is_login_required_error(&err) {
                    saw_login_required = true;
                }
                errors.push(format!("{method}: {err}"));
            }
        }
    }

    let state = if saw_login_required {
        "login_required"
    } else {
        "unknown"
    };
    let detail = if errors.is_empty() {
        None
    } else {
        Some(errors.join(" | "))
    };

    Ok(AuthProbeResult {
        state: state.to_string(),
        source_method: None,
        auth_mode: None,
        raw: None,
        detail,
    })
}

#[tauri::command]
pub async fn logout_codex(state: State<'_, EngineManager>) -> Result<(), String> {
    let runtime = current_runtime(&state).await?;
    let candidates: [(&str, Value); 2] = [("account/logout", Value::Null), ("account/logout", json!({}))];
    let mut errors: Vec<String> = Vec::new();

    for (method, params) in candidates {
        match runtime.request(method, params).await {
            Ok(_) => return Ok(()),
            Err(err) => {
                errors.push(format!("{method}: {err}"));
            }
        }
    }

    Err(format!(
        "failed to logout from app-server; attempted methods: {}",
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
              "sandbox": "read-only"
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
              "sandboxPolicy": {
                "type": "readOnly"
              }
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
        .title(format!("{provider_key} - rail"))
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

#[cfg(desktop)]
#[tauri::command]
pub async fn provider_child_view_open(window: Window, provider: String) -> Result<(), String> {
    let provider_key = provider.trim().to_lowercase();
    let url = provider_url(&provider_key)
        .ok_or_else(|| format!("unsupported provider: {provider}"))?;
    let child_label = provider_child_view_label(&provider_key);

    let size = window
        .inner_size()
        .map_err(|e| format!("failed to read parent window size: {e}"))?;
    let available_width = size.width.saturating_sub(CHILD_VIEW_SAFE_MARGIN_X.saturating_mul(2));
    let available_height = size
        .height
        .saturating_sub(CHILD_VIEW_SAFE_MARGIN_TOP + CHILD_VIEW_SAFE_MARGIN_BOTTOM);

    let width_ceiling = available_width.max(1);
    let height_ceiling = available_height.max(1);
    let width_floor = CHILD_VIEW_MIN_WIDTH.min(width_ceiling).max(1);
    let height_floor = CHILD_VIEW_MIN_HEIGHT.min(height_ceiling).max(1);
    let desired_width =
        ((f64::from(available_width) * CHILD_VIEW_WIDTH_RATIO).round() as u32).min(CHILD_VIEW_MAX_WIDTH);
    let desired_height =
        ((f64::from(available_height) * CHILD_VIEW_HEIGHT_RATIO).round() as u32).min(CHILD_VIEW_MAX_HEIGHT);
    let width = desired_width.max(width_floor).min(width_ceiling);
    let height = desired_height.max(height_floor).min(height_ceiling);

    let x_start = CHILD_VIEW_SAFE_MARGIN_X.min(size.width.saturating_sub(width));
    let y_start = CHILD_VIEW_SAFE_MARGIN_TOP.min(size.height.saturating_sub(height));
    let x = x_start + (available_width.saturating_sub(width) / 2);
    let y = y_start + (available_height.saturating_sub(height) / 2);

    if let Some(webview) = window.app_handle().get_webview(&child_label) {
        let _ = webview.set_position(tauri::LogicalPosition::new(f64::from(x), f64::from(y)));
        let _ = webview.set_size(tauri::LogicalSize::new(f64::from(width), f64::from(height)));
        let _ = webview.show();
        let _ = webview.set_focus();
        return Ok(());
    }

    let external = url
        .parse()
        .map_err(|e| format!("invalid provider url ({url}): {e}"))?;

    window
        .add_child(
            WebviewBuilder::new(child_label, WebviewUrl::External(external)),
            tauri::LogicalPosition::new(f64::from(x), f64::from(y)),
            tauri::LogicalSize::new(f64::from(width), f64::from(height)),
        )
        .map_err(|e| format!("failed to open provider child view: {e}"))?;

    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn provider_child_view_open(_provider: String) -> Result<(), String> {
    Err("provider child view is only supported on desktop".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn provider_child_view_close(app: AppHandle, provider: String) -> Result<(), String> {
    let provider_key = provider.trim().to_lowercase();
    let child_label = provider_child_view_label(&provider_key);
    let webview = app
        .get_webview(&child_label)
        .ok_or_else(|| format!("provider child view not found: {provider_key}"))?;
    webview
        .close()
        .map_err(|e| format!("failed to close provider child view: {e}"))?;
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn provider_child_view_hide(app: AppHandle, provider: String) -> Result<(), String> {
    let provider_key = provider.trim().to_lowercase();
    let child_label = provider_child_view_label(&provider_key);
    let Some(webview) = app.get_webview(&child_label) else {
        return Ok(());
    };
    webview
        .hide()
        .map_err(|e| format!("failed to hide provider child view: {e}"))?;
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn provider_child_view_hide(_provider: String) -> Result<(), String> {
    Err("provider child view is only supported on desktop".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn provider_child_view_close(_provider: String) -> Result<(), String> {
    Err("provider child view is only supported on desktop".to_string())
}

#[tauri::command]
pub async fn ollama_generate(model: String, prompt: String) -> Result<Value, String> {
    let trimmed_model = model.trim();
    let trimmed_prompt = prompt.trim();
    if trimmed_model.is_empty() {
        return Err("ollama model is required".to_string());
    }
    if trimmed_prompt.is_empty() {
        return Err("ollama prompt is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("failed to build ollama client: {e}"))?;

    let response = client
        .post("http://127.0.0.1:11434/api/generate")
        .json(&json!({
            "model": trimmed_model,
            "prompt": trimmed_prompt,
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| format!("failed to call ollama api: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<unreadable body>".to_string());
        return Err(format!("ollama api returned {status}: {body}"));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("invalid ollama response json: {e}"))
}
