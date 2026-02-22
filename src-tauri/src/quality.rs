use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityCommandResult {
    pub name: String,
    pub exit_code: i32,
    pub stdout_tail: String,
    pub stderr_tail: String,
    pub elapsed_ms: u128,
}

fn tail_text(input: &[u8], max_chars: usize) -> String {
    let text = String::from_utf8_lossy(input).to_string();
    let mut chars = text.chars().collect::<Vec<_>>();
    if chars.len() > max_chars {
        chars = chars.split_off(chars.len() - max_chars);
    }
    chars.into_iter().collect()
}

#[tauri::command]
pub async fn quality_run_checks(
    commands: Vec<String>,
    cwd: String,
) -> Result<Vec<QualityCommandResult>, String> {
    let mut results = Vec::new();
    let safe_cwd = cwd.trim();
    if safe_cwd.is_empty() {
        return Err("quality check cwd is empty".to_string());
    }

    for raw in commands {
        let command = raw.trim();
        if command.is_empty() {
            continue;
        }

        let started = Instant::now();
        let output = Command::new("/bin/zsh")
            .arg("-lc")
            .arg(command)
            .current_dir(safe_cwd)
            .output()
            .await
            .map_err(|e| format!("failed to run quality command `{command}`: {e}"))?;

        let elapsed_ms = started.elapsed().as_millis();
        let exit_code = output.status.code().unwrap_or(-1);
        results.push(QualityCommandResult {
            name: command.to_string(),
            exit_code,
            stdout_tail: tail_text(&output.stdout, 1200),
            stderr_tail: tail_text(&output.stderr, 1200),
            elapsed_ms,
        });

        if exit_code != 0 {
            break;
        }
    }

    Ok(results)
}
