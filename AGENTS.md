# RAIL Project Instructions

## Goal
- Keep RAIL as a production-grade DAG workflow desktop app.
- Preserve fast, understandable UX for workflow canvas users.
- Prefer small, test-backed, reversible changes.

## Stack
- Desktop shell: Tauri
- Frontend: React + TypeScript + Vite
- Domain: DAG workflow orchestration (node/edge graph)

## Architecture Boundaries
- Separate canvas rendering, graph/domain logic, and execution/runtime side effects.
- Keep graph contracts (`GraphNode`, `GraphEdge`, run status, artifacts) in dedicated type modules.
- Avoid adding unrelated logic to `MainApp.tsx`; prefer hooks/services.
- Route all mutations through explicit domain functions, not ad-hoc UI state edits.

## Anti-Mud Guardrails
- TS/TSX soft limit: 300 lines
- TS/TSX hard limit: 500 lines
- No circular imports
- No god files handling canvas input + execution engine + persistence together

## Refactor Rules For Large Files
- If a file exceeds 500 lines, split by responsibility before adding major features.
- Preferred split order for workflow code:
  1) pure domain utils
  2) runtime/execution hooks
  3) canvas interaction hooks
  4) presentational components

## Slice-First Workflow
1. Define one user-visible slice with acceptance criteria.
2. Add or update tests first (unit/integration as needed).
3. Implement the minimum needed code.
4. Run tests and report results.
5. Commit atomically.

## Testing Rules
- Every behavior change requires tests or explicit justification.
- Bug fixes require regression tests.
- DAG execution/state transition changes require integration tests.
- Canvas interaction changes require at least smoke verification.

## UX Rules
- Default mode must stay beginner-friendly:
  - one clear next action
  - visible current stage
  - low UI noise
- Advanced controls (graph internals, debug data) should be collapsible.

## Git Rules
- Keep atomic commits by concern.
- Do not mix refactor + feature + style in one commit.
- Never rewrite unrelated files.

## PR/Review Checklist
- Behavior preserved or intentionally changed with note
- Tests added/updated and passing
- File-size guardrails respected
- No architecture boundary violations
