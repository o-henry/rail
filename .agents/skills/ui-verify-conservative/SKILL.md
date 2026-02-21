---
name: ui-verify-conservative
description: >
  Use ONLY when explicitly invoked ($ui-verify-conservative).
  For UI behavior changes (web apps, Tauri UI), enforce a conservative two-phase workflow:
  (1) spec lock with verification plan, (2) implement minimal diff + run available tests/dev and provide evidence.
  Do NOT use for general refactors or non-UI tasks.
---

# Core rules
- No code edits in Phase 1.
- No "it works" claims without command output evidence.
- Do not add new dependencies or test frameworks unless the user explicitly asks.
- Keep diffs minimal and localized.

# Phase 1: Spec lock (NO CODE CHANGES)
## 1) Restate requirements as a measurable checklist
Produce:
- "Acceptance checklist": bullet list of observable behaviors
- "Assumptions": anything you had to assume (explicitly)
- "Out of scope": what you will not change

## 2) Repo run/test discovery (NO assumptions)
Inspect the repo to find how to:
- run dev
- run unit tests
- run UI/E2E tests (Playwright/Cypress/etc) IF present

Output a short Runbook:
- Package manager detected (pnpm/yarn/npm)
- Commands (exact scripts)
- If no UI/E2E tooling exists: state "Verification gap: no automated UI/E2E tests found"

## 3) Verification plan mapped to checklist
Create a table:
- Requirement item -> Where in code -> How to verify (unit/e2e/manual steps) -> Evidence to collect

## 4) Stop and wait
Ask the user to reply with exactly: "진행"
Until then: DO NOT modify any files.

# Phase 2: Implement + Verify (after user says "진행")
## 5) Implement minimal change
- List files to change (before editing)
- Make the smallest diff that can satisfy the checklist
- Avoid refactors

## 6) Verify with evidence (must execute commands)
Run in this order, skipping only if not available:
1) Install deps if needed (repo's package manager)
2) Unit tests (or typecheck if that's the repo's primary gate)
3) UI/E2E tests IF the repo already has them
4) Dev run or build if required for the acceptance checklist

Evidence rules:
- Paste key command outputs: summaries + errors
- If a command fails, do not proceed to final claims

## 7) Debug loop (only for observed failures)
For each failure:
- Quote the failing output excerpt
- Identify the root cause
- Apply a minimal fix
- Re-run the same failing command until pass

## 8) Final report
Include:
- Files changed
- Commands executed (exact) + results
- Acceptance checklist: each item marked PASS/FAIL with evidence pointers
- Any remaining verification gaps
