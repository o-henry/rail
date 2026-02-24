#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];
const LAYER_RANK = {
  shared: 0,
  entities: 1,
  features: 2,
  widgets: 3,
  pages: 4,
  app: 5,
};

const MAX_LINES_TS = 500;
const MAX_LINES_TSX = 400;
const MAX_LINES_MAIN = 80;

// Transitional allowlist: block new regressions while refactor is in progress.
const LEGACY_LINE_EXCEPTIONS = new Set([
  "src/app/MainApp.tsx",
  "src/pages/feed/FeedPage.tsx",
  "src/app/mainAppUtils.ts",
  "src/app/mainAppRuntimeHelpers.ts",
  "src/app/mainAppGraphHelpers.tsx",
]);

const LEGACY_IMPORT_EXCEPTIONS = new Set([
  "src/features/feed/derivedState.ts -> ../workflow/domain",
  "src/features/feed/derivedState.ts -> ../workflow/labels",
  "src/features/feed/derivedState.ts -> ../workflow/quality",
]);

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function parseLayerInfo(fileRel) {
  const parts = fileRel.split("/");
  if (parts[0] !== "src") return null;
  const layer = parts[1];
  if (!LAYERS.includes(layer)) return null;
  const slice = parts[2] ?? null;
  return { layer, slice, parts };
}

function resolveImport(fileRel, spec) {
  if (spec.startsWith("@/")) {
    return `src/${spec.slice(2)}`;
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const base = path.dirname(fileRel);
    const abs = path.normalize(path.join(base, spec)).replace(/\\/g, "/");
    return abs;
  }
  return null;
}

function extractImports(content) {
  const matches = content.matchAll(/from\s+["']([^"']+)["']/g);
  return Array.from(matches, (m) => m[1]);
}

const errors = [];

const files = walk(SRC_DIR);

for (const file of files) {
  const fileRel = rel(file);
  const content = fs.readFileSync(file, "utf8");
  const lineCount = content.split("\n").length;

  if (fileRel === "src/main.tsx") {
    if (lineCount > MAX_LINES_MAIN) {
      errors.push(`${fileRel}: line count ${lineCount} > ${MAX_LINES_MAIN}`);
    }
    const disallowed = /(invoke\(|listen\(|function\s+|useState\(|useEffect\(|const\s+[A-Z][A-Za-z0-9_]*\s*=\s*\()/;
    if (disallowed.test(content)) {
      errors.push(`${fileRel}: must remain entrypoint-only (render/bootstrap only)`);
    }
  }

  const limit = fileRel.endsWith(".tsx") ? MAX_LINES_TSX : MAX_LINES_TS;
  if (lineCount > limit && !LEGACY_LINE_EXCEPTIONS.has(fileRel)) {
    errors.push(`${fileRel}: line count ${lineCount} > ${limit}`);
  }

  const importer = parseLayerInfo(fileRel);
  if (!importer) continue;

  const imports = extractImports(content);
  for (const spec of imports) {
    const resolved = resolveImport(fileRel, spec);
    if (!resolved || !resolved.startsWith("src/")) continue;

    const target = parseLayerInfo(resolved);
    if (!target) continue;

    const importerRank = LAYER_RANK[importer.layer];
    const targetRank = LAYER_RANK[target.layer];
    const importKey = `${fileRel} -> ${spec}`;
    if (targetRank > importerRank && !LEGACY_IMPORT_EXCEPTIONS.has(importKey)) {
      errors.push(`${fileRel}: invalid layer dependency ${importer.layer} -> ${target.layer} (${spec})`);
    }

    const restrictedSameLayer = new Set(["pages", "widgets", "features", "entities"]);
    if (
      importer.layer === target.layer &&
      restrictedSameLayer.has(importer.layer) &&
      importer.slice &&
      target.slice &&
      importer.slice !== target.slice &&
      !LEGACY_IMPORT_EXCEPTIONS.has(importKey)
    ) {
      errors.push(`${fileRel}: cross-slice import within ${importer.layer} is not allowed (${spec})`);
    }

    // Public API import rule (alias path): allow only layer/slice root imports.
    if (spec.startsWith("@/") && target.slice) {
      const specParts = spec.slice(2).split("/");
      if (specParts.length > 2 && specParts[2] !== "index.ts" && specParts[2] !== "index.tsx") {
        errors.push(`${fileRel}: deep import blocked by public API rule (${spec})`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Architecture check failed:\n");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Architecture check passed.");
