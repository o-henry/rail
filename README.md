# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Security Guardrails

This repo blocks committing/pushing common secret patterns (API keys, tokens, private keys) via git hooks.

1. Install hooks once:
   ```bash
   bash scripts/install_git_hooks.sh
   ```
2. Manual scan:
   ```bash
   bash scripts/secret_scan.sh --all
   ```

CI also runs the same scanner on push/PR via `.github/workflows/secret-scan.yml`.
