#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

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

function extractImports(content) {
  const matches = content.matchAll(/from\s+["']([^"']+)["']/g);
  return Array.from(matches, (m) => m[1]);
}

function normalizeImportPath(fileRel, spec) {
  if (spec.startsWith("@/")) {
    return `src/${spec.slice(2)}`;
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const base = path.dirname(fileRel);
    return path.normalize(path.join(base, spec)).replace(/\\/g, "/");
  }
  return null;
}

function resolveToFile(resolvedBase) {
  const candidates = [];
  if (resolvedBase.endsWith(".ts") || resolvedBase.endsWith(".tsx")) {
    candidates.push(resolvedBase);
  } else {
    candidates.push(`${resolvedBase}.ts`, `${resolvedBase}.tsx`);
    candidates.push(path.join(resolvedBase, "index.ts").replace(/\\/g, "/"));
    candidates.push(path.join(resolvedBase, "index.tsx").replace(/\\/g, "/"));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(ROOT, candidate))) {
      return candidate;
    }
  }
  return null;
}

const files = walk(SRC_DIR).map(rel);
const fileSet = new Set(files);
const graph = new Map(files.map((file) => [file, []]));

for (const file of files) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const spec of extractImports(content)) {
    const normalized = normalizeImportPath(file, spec);
    if (!normalized || !normalized.startsWith("src/")) {
      continue;
    }
    const target = resolveToFile(normalized);
    if (!target || !fileSet.has(target)) {
      continue;
    }
    graph.get(file).push(target);
  }
}

const visited = new Set();
const visiting = new Set();
const stack = [];
const cycleSignatures = new Set();
const cycles = [];

function dfs(node) {
  visiting.add(node);
  stack.push(node);

  for (const next of graph.get(node) ?? []) {
    if (visiting.has(next)) {
      const startIndex = stack.indexOf(next);
      const cycle = [...stack.slice(startIndex), next];
      const signature = cycle.join(" -> ");
      if (!cycleSignatures.has(signature)) {
        cycleSignatures.add(signature);
        cycles.push(cycle);
      }
      continue;
    }
    if (!visited.has(next)) {
      dfs(next);
    }
  }

  stack.pop();
  visiting.delete(node);
  visited.add(node);
}

for (const node of files) {
  if (!visited.has(node)) {
    dfs(node);
  }
}

if (cycles.length > 0) {
  console.error("Cycle check failed:\n");
  const maxPrinted = 20;
  for (const cycle of cycles.slice(0, maxPrinted)) {
    console.error(`- ${cycle.join(" -> ")}`);
  }
  if (cycles.length > maxPrinted) {
    console.error(`- ...and ${cycles.length - maxPrinted} more cycles`);
  }
  process.exit(1);
}

console.log("Cycle check passed.");
