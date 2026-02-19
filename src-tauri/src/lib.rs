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
            engine::thread_start,
            engine::turn_start,
            engine::turn_interrupt,
            engine::approval_respond,
            storage::graph_list,
            storage::graph_save,
            storage::graph_load,
            storage::run_save,
            storage::run_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
