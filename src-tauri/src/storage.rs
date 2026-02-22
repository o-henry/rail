use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri_plugin_dialog::DialogExt;

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

fn delete_json_file(dir_name: &str, name: &str) -> Result<(), String> {
    let normalized_name = normalize_file_name(name)?;
    let dir = ensure_subdir(dir_name)?;
    let path = dir.join(normalized_name);
    if !path.exists() {
        return Err(format!("{dir_name} file not found"));
    }
    fs::remove_file(path).map_err(|e| format!("failed to delete {dir_name} file: {e}"))
}

fn append_json_extension_if_missing(path: PathBuf) -> PathBuf {
    if path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        return path;
    }
    path.with_extension("json")
}

fn unique_file_name_in_dir(dir: &PathBuf, preferred_name: &str) -> String {
    let normalized = normalize_file_name(preferred_name).unwrap_or_else(|_| "imported-run.json".to_string());
    let base_path = dir.join(&normalized);
    if !base_path.exists() {
        return normalized;
    }

    let stem = PathBuf::from(&normalized)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imported-run")
        .to_string();
    let ext = PathBuf::from(&normalized)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("json")
        .to_string();

    for index in 1..10_000 {
        let candidate = format!("{stem}-{index}.{ext}");
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    format!("{stem}-imported.{ext}")
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
pub fn run_delete(name: String) -> Result<(), String> {
    delete_json_file("runs", &name)
}

#[tauri::command]
pub fn run_directory() -> Result<String, String> {
    let dir = ensure_subdir("runs")?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn run_export(
    app: tauri::AppHandle,
    name: String,
    target_path: Option<String>,
) -> Result<String, String> {
    let run_json = read_json_file("runs", &name)?;
    let default_name = normalize_file_name(&name)?;

    let target = if let Some(target) = target_path.filter(|value| !value.trim().is_empty()) {
        append_json_extension_if_missing(PathBuf::from(target))
    } else {
        let picked = app
            .dialog()
            .file()
            .set_title("실행 기록 내보내기")
            .set_file_name(&default_name)
            .add_filter("JSON", &["json"])
            .blocking_save_file()
            .ok_or_else(|| "실행 기록 내보내기를 취소했습니다.".to_string())?;
        append_json_extension_if_missing(PathBuf::from(picked.to_string()))
    };

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create export directory: {e}"))?;
    }
    let pretty =
        serde_json::to_string_pretty(&run_json).map_err(|e| format!("failed to serialize run JSON: {e}"))?;
    fs::write(&target, pretty).map_err(|e| format!("failed to write export file: {e}"))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn run_import(app: tauri::AppHandle, path: Option<String>) -> Result<String, String> {
    let source_path = if let Some(source) = path.filter(|value| !value.trim().is_empty()) {
        PathBuf::from(source)
    } else {
        let picked = app
            .dialog()
            .file()
            .set_title("실행 기록 가져오기")
            .add_filter("JSON", &["json"])
            .blocking_pick_file()
            .ok_or_else(|| "실행 기록 가져오기를 취소했습니다.".to_string())?;
        PathBuf::from(picked.to_string())
    };

    let raw =
        fs::read_to_string(&source_path).map_err(|e| format!("failed to read import file: {e}"))?;
    let parsed: Value =
        serde_json::from_str(&raw).map_err(|e| format!("invalid run JSON file: {e}"))?;

    let runs_dir = ensure_subdir("runs")?;
    let preferred_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("imported-run.json");
    let unique_name = unique_file_name_in_dir(&runs_dir, preferred_name);
    let target_path = runs_dir.join(&unique_name);

    let pretty =
        serde_json::to_string_pretty(&parsed).map_err(|e| format!("failed to serialize run JSON: {e}"))?;
    fs::write(&target_path, pretty).map_err(|e| format!("failed to write imported run: {e}"))?;

    Ok(unique_name)
}

#[tauri::command]
pub fn dialog_pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("작업 경로 선택")
        .blocking_pick_folder();
    Ok(picked.map(|path| path.to_string()))
}

#[tauri::command]
pub fn dialog_pick_knowledge_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("첨부 자료 선택")
        .add_filter(
            "지원 파일",
            &[
                "txt", "md", "json", "csv", "ts", "tsx", "js", "jsx", "py", "rs", "go", "java",
                "cs", "html", "css", "sql", "yaml", "yml", "pdf", "docx",
            ],
        )
        .blocking_pick_files()
        .unwrap_or_default();

    let unique_paths = picked
        .into_iter()
        .map(|path| path.to_string())
        .filter(|path| !path.trim().is_empty())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    Ok(unique_paths)
}
