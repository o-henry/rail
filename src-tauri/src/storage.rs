use serde_json::Value;
use std::{fs, path::PathBuf};

fn current_workspace_dir() -> Result<PathBuf, String> {
    std::env::current_dir().map_err(|e| format!("failed to resolve current dir: {e}"))
}

fn ensure_subdir(name: &str) -> Result<PathBuf, String> {
    let dir = current_workspace_dir()?.join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create {name} directory: {e}"))?;
    Ok(dir)
}

fn normalize_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("file name is required".to_string());
    }
    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("invalid file name".to_string());
    }

    if trimmed.ends_with(".json") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}.json"))
    }
}

fn list_json_files(dir_name: &str) -> Result<Vec<String>, String> {
    let dir = ensure_subdir(dir_name)?;
    let mut files = Vec::new();

    for entry in
        fs::read_dir(dir).map_err(|e| format!("failed to read {dir_name} directory: {e}"))?
    {
        let entry = entry.map_err(|e| format!("failed to read directory entry: {e}"))?;
        let path = entry.path();
        if path.is_file()
            && path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                files.push(name.to_string());
            }
        }
    }

    files.sort();
    Ok(files)
}

fn write_json_file(dir_name: &str, name: &str, data: &Value) -> Result<(), String> {
    let normalized_name = normalize_file_name(name)?;
    let dir = ensure_subdir(dir_name)?;
    let path = dir.join(normalized_name);
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("failed to serialize JSON for {dir_name}: {e}"))?;
    fs::write(path, json).map_err(|e| format!("failed to write {dir_name} file: {e}"))
}

fn read_json_file(dir_name: &str, name: &str) -> Result<Value, String> {
    let normalized_name = normalize_file_name(name)?;
    let dir = ensure_subdir(dir_name)?;
    let path = dir.join(normalized_name);
    let raw =
        fs::read_to_string(path).map_err(|e| format!("failed to read {dir_name} file: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid JSON in {dir_name} file: {e}"))
}

#[tauri::command]
pub fn graph_list() -> Result<Vec<String>, String> {
    list_json_files("graphs")
}

#[tauri::command]
pub fn graph_save(name: String, graph: Value) -> Result<(), String> {
    write_json_file("graphs", &name, &graph)
}

#[tauri::command]
pub fn graph_load(name: String) -> Result<Value, String> {
    read_json_file("graphs", &name)
}

#[tauri::command]
pub fn run_save(name: String, run: Value) -> Result<(), String> {
    write_json_file("runs", &name, &run)
}

#[tauri::command]
pub fn run_list() -> Result<Vec<String>, String> {
    list_json_files("runs")
}

#[tauri::command]
pub fn run_load(name: String) -> Result<Value, String> {
    read_json_file("runs", &name)
}

#[tauri::command]
pub fn run_directory() -> Result<String, String> {
    let dir = ensure_subdir("runs")?;
    Ok(dir.to_string_lossy().to_string())
}
