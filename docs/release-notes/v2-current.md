# RAIL V2 Snapshot (Stable Install Baseline)

- Snapshot commit: `87fef95`
- Branch: `v2-current`
- Tag: `v2-20260227`

This snapshot is the baseline for installing and running the current V2 behavior while Batcher integration work continues on `main`.

## Install Baseline

1. Checkout `v2-current` (or `v2-20260227` tag).
2. Run `npm install`.
3. Run `npm run tauri:dev:isolated` for desktop development runtime.

## Purpose

- Keep the current behavior installable and reproducible.
- Allow incremental Batcher integration on `main` without breaking the fallback baseline.
