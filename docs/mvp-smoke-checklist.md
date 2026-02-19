# Rail MVP Smoke Checklist

## Environment
- Run `npm install` once.
- Run `npm run tauri dev`.
- Ensure `codex` CLI is installed and can execute `codex app-server --listen stdio://`.

## 1. Engine Boot + Auth
- Open app.
- Verify top/right status moves to `ready` automatically.
- Go to `Settings` tab.
- Click `Login ChatGPT`.
- Verify browser opens `authUrl` (or copy URL fallback works).
- Verify UI reflects `account/login/completed` and `authMode=chatgpt` after login.

## 2. Graph Editing
- Go to `Workflow` tab.
- Add `TurnNode`, `TransformNode`, `GateNode`.
- Drag nodes on canvas.
- Connect edges via `out` then `in`.
- Delete one edge and one node.

## 3. Run/Interrupt
- Create single TurnNode graph.
- Enter question in `질문 (Workflow Input)`.
- Click `Run Graph`.
- Confirm node status transitions to `running` -> `done`.
- Confirm streaming text appears in right `Node Logs`.
- Start a new run and click `Cancel Run` while running.
- Confirm `turn_interrupt` is requested and status reflects cancellation path.

## 4. Transform + Gate
- Build chain: `Turn -> Transform -> Gate`.
- For Gate input, ensure prior node produces `decision` key.
- Verify PASS and REJECT each skip/allow downstream paths correctly.

## 5. Presets
- Load `검증형 5-Agent` preset.
- Run and confirm graph executes in sequential DAG order.
- Load `개발형 5-Agent` preset.
- Run and confirm output and transitions are produced.

## 6. Persistence
- Save graph under `graphs/*.json`.
- Reload saved graph and rerun.
- Verify run file appears in `runs/*.json`.

## 7. History
- Open `History` tab.
- Select a run file.
- Verify question, final answer, summary logs, transitions, and node logs render.
