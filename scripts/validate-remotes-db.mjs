#!/usr/bin/env node
// Validates remotes-db/ — JSON parseability, index consistency, per-remote schema,
// and the "verified === true implies all button codes populated" rule.
//
// Run: node scripts/validate-remotes-db.mjs
// Exits non-zero on any validation failure.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../remotes-db/", import.meta.url).pathname;
const errors = [];
const warnings = [];

const err = (file, msg) => errors.push(`[ERROR] ${relative(ROOT, file) || file}: ${msg}`);
const warn = (file, msg) => warnings.push(`[warn]  ${relative(ROOT, file) || file}: ${msg}`);

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(path, `invalid JSON — ${e.message}`);
    return null;
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---- 1. Parse every JSON file in remotes-db/ ----
const allJson = walk(ROOT).filter((p) => p.endsWith(".json"));
const parsed = new Map();
for (const p of allJson) {
  const data = parseJson(p);
  if (data !== null) parsed.set(p, data);
}

// ---- 2. Validate index.json ----
const indexPath = join(ROOT, "index.json");
const index = parsed.get(indexPath);
if (!index) {
  err(indexPath, "index.json missing or unparseable");
} else {
  if (typeof index.version !== "number") err(indexPath, "missing numeric `version`");
  if (typeof index.last_updated !== "string") err(indexPath, "missing string `last_updated`");
  if (!Array.isArray(index.remotes)) err(indexPath, "missing array `remotes`");
  else {
    const ids = new Set();
    for (const entry of index.remotes) {
      if (!entry || typeof entry !== "object") {
        err(indexPath, `non-object entry in remotes[]`);
        continue;
      }
      for (const k of ["id", "make", "model", "file"]) {
        if (typeof entry[k] !== "string") err(indexPath, `remote entry missing string \`${k}\``);
      }
      if (entry.model_aliases && !Array.isArray(entry.model_aliases))
        err(indexPath, `remote ${entry.id}: model_aliases must be an array`);
      if (ids.has(entry.id)) err(indexPath, `duplicate remote id in index: ${entry.id}`);
      ids.add(entry.id);
      const filePath = join(ROOT, entry.file);
      if (!existsSync(filePath)) err(indexPath, `remote ${entry.id}: file not found → ${entry.file}`);
    }
  }
}

// ---- 3. Validate each remote JSON under remotes/ ----
const remoteIdsFromFiles = new Set();
for (const [p, remote] of parsed) {
  if (!p.includes(`${ROOT}remotes/`)) continue;
  const required = ["id", "make", "model", "buttons"];
  for (const k of required) {
    if (!(k in remote)) err(p, `missing required field \`${k}\``);
  }
  if (typeof remote.id === "string") {
    if (remoteIdsFromFiles.has(remote.id)) err(p, `duplicate remote id across files: ${remote.id}`);
    remoteIdsFromFiles.add(remote.id);
  }
  if (!Array.isArray(remote.buttons)) {
    err(p, "`buttons` must be an array");
    continue;
  }
  const btnIds = new Set();
  for (const btn of remote.buttons) {
    if (!btn || typeof btn !== "object") {
      err(p, "non-object entry in buttons[]");
      continue;
    }
    for (const k of ["id", "label"]) {
      if (typeof btn[k] !== "string") err(p, `button missing string \`${k}\``);
    }
    for (const k of ["x", "y"]) {
      if (typeof btn[k] !== "number" || btn[k] < 0 || btn[k] > 100)
        err(p, `button ${btn.id}: \`${k}\` must be 0–100`);
    }
    if (typeof btn.code !== "string") err(p, `button ${btn.id}: \`code\` must be a string`);
    if (btn.id && btnIds.has(btn.id)) err(p, `duplicate button id: ${btn.id}`);
    btnIds.add(btn.id);
  }

  // Key rule: verified=true => every button has a non-empty code
  if (remote.verified === true) {
    const empties = (remote.buttons || []).filter((b) => !b || !b.code || b.code.trim() === "");
    if (empties.length > 0) {
      err(
        p,
        `verified=true but ${empties.length} button(s) have empty code: ${empties
          .map((b) => b && b.id)
          .filter(Boolean)
          .join(", ") || "(unnamed)"}`
      );
    }
    if (!remote.verified_by) warn(p, "verified=true but no `verified_by` set");
  }

  // Cross-check: every remote file should be listed in index.json
  if (index && Array.isArray(index.remotes)) {
    const listed = index.remotes.some((e) => e.id === remote.id);
    if (!listed) err(p, `remote id \`${remote.id}\` is not listed in index.json`);
  }
}

// ---- 4. Every index entry must resolve to a file we parsed ----
if (index && Array.isArray(index.remotes)) {
  for (const entry of index.remotes) {
    const full = join(ROOT, entry.file || "");
    if (!parsed.has(full) && existsSync(full)) {
      // File exists but failed to parse — already reported.
    }
  }
}

// ---- Report ----
if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(w);
}
if (errors.length) {
  console.log("\nErrors:");
  for (const e of errors) console.log(e);
  console.log(`\nremotes-db validation FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`remotes-db validation OK — ${parsed.size} JSON file(s), ${remoteIdsFromFiles.size} remote(s).`);
