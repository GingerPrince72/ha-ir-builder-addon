#!/usr/bin/env node
// Validates repo-level add-on metadata:
// - repository.yaml.url matches the actual GitHub owner/repo
// - config.yaml has the required keys
// - config.yaml version is bumped relative to master (only when run in PR mode)
//
// Usage:
//   node scripts/validate-addon-config.mjs
//   node scripts/validate-addon-config.mjs --check-version-bump <base-version>

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const errors = [];
const err = (m) => errors.push(`[ERROR] ${m}`);

// --- Minimal YAML reader (we only need top-level scalar keys) ---
function readTopLevelScalars(path) {
  const out = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val === "" || val.startsWith("#")) continue; // nested block or comment
    // strip inline comment
    val = val.replace(/\s+#.*$/, "");
    // strip surrounding quotes
    val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    out[key] = val;
  }
  return out;
}

// --- 1. repository.yaml ---
const repo = readTopLevelScalars("repository.yaml");
if (!repo.name) err("repository.yaml: missing `name`");
if (!repo.url) err("repository.yaml: missing `url`");
else {
  const m = repo.url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) err(`repository.yaml: url is not a valid github.com URL — ${repo.url}`);
  else {
    const [, owner, name] = m;
    // Derive the true owner/repo from GITHUB_REPOSITORY (set by Actions) or git remote.
    let actual = process.env.GITHUB_REPOSITORY;
    if (!actual) {
      try {
        const remote = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
        const rm = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/);
        if (rm) actual = `${rm[1]}/${rm[2]}`;
      } catch {}
    }
    if (actual && `${owner}/${name}` !== actual) {
      err(
        `repository.yaml url mismatch — declares \`${owner}/${name}\` but repo is \`${actual}\`. ` +
          `Update repository.yaml.url to https://github.com/${actual}`
      );
    }
  }
}

// --- 2. config.yaml ---
const cfg = readTopLevelScalars("config.yaml");
for (const k of ["name", "description", "version", "slug"]) {
  if (!cfg[k]) err(`config.yaml: missing \`${k}\``);
}
if (cfg.version && !/^\d+\.\d+\.\d+/.test(cfg.version)) {
  err(`config.yaml: version must start with MAJOR.MINOR.PATCH — got "${cfg.version}"`);
}

// --- 3. Optional: version bump check (used in PR CI) ---
const bumpIdx = process.argv.indexOf("--check-version-bump");
if (bumpIdx !== -1) {
  const baseVersion = process.argv[bumpIdx + 1];
  if (!baseVersion) err("--check-version-bump requires a base-version argument");
  else if (cfg.version && compareSemver(cfg.version, baseVersion) <= 0) {
    err(
      `config.yaml version (${cfg.version}) must be greater than base (${baseVersion}). ` +
        `Bump the version when you change the add-on.`
    );
  }
}

function compareSemver(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

if (errors.length) {
  for (const e of errors) console.log(e);
  console.log(`\nAdd-on config validation FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Add-on config validation OK — ${cfg.name} v${cfg.version}`);
