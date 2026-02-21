mod engine;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(engine::EngineManager::default())
        .invoke_handler(tauri::generate_handler![
            engine::engine_start,
            engine::engine_stop,
            engine::login_chatgpt,
            engine::usage_check,
            engine::thread_start,
            engine::turn_start,
            engine::turn_interrupt,
            engine::approval_respond,
            engine::provider_window_open,
            engine::provider_window_close,
            engine::provider_child_view_open,
            engine::provider_child_view_close,
            engine::web_worker_start,
            engine::web_worker_stop,
            engine::web_provider_health,
            engine::web_provider_run,
            engine::web_provider_reset_session,
            engine::web_provider_cancel,
            engine::ollama_generate,
            storage::graph_list,
            storage::graph_save,
            storage::graph_load,
            storage::run_save,
            storage::run_list,
            storage::run_load,
            storage::run_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
