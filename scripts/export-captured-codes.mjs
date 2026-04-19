#!/usr/bin/env node
/**
 * Export captured IR codes from the add-on's SQLite DB back into a
 * remotes-db/remotes/**\/*.json file, so a personal capture becomes a
 * shareable community remote.
 *
 * Usage (run inside the add-on container, or anywhere that can see /data/ir-config.db):
 *
 *   node scripts/export-captured-codes.mjs <remote-id> [--target-id <N>] [--db <path>] [--write]
 *
 * - <remote-id>           e.g. philips-pus7304 — must match index.json and file basename.
 * - --target-id <N>       Optional: explicit target_devices.id to pull from. If omitted, picks
 *                         the single target whose remote_db_id matches <remote-id>, or errors
 *                         if 0 / more than 1 candidates.
 * - --db <path>           Override DB path. Default: /data/ir-config.db (add-on default).
 * - --write               Write the updated remote JSON in place. Without --write it only
 *                         prints a summary and a preview diff.
 *
 * Matching: commands.button_id (preferred) then a normalized commands.name → buttons[].id
 * fallback. Reports any unmatched / empty rows so you can fix naming without rerunning.
 *
 * The ESPHome payload is emitted as a stringified JSON with fields
 * { type: esp_payload_type, data: esp_payload }. Broadlink base64 codes are
 * emitted raw. If both exist, Broadlink is preferred (portability).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------- args ----------
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node scripts/export-captured-codes.mjs <remote-id> [--target-id N] [--db path] [--write]"
  );
  process.exit(args.length === 0 ? 1 : 0);
}
const remoteId = args[0];
let dbPath = "/data/ir-config.db";
let targetId = null;
let write = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--db") dbPath = args[++i];
  else if (args[i] === "--target-id") targetId = parseInt(args[++i], 10);
  else if (args[i] === "--write") write = true;
  else {
    console.error(`Unknown arg: ${args[i]}`);
    process.exit(1);
  }
}

// ---------- load remote JSON ----------
const indexPath = path.join(ROOT, "remotes-db/index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const entry = (index.remotes || []).find((r) => r.id === remoteId);
if (!entry) {
  console.error(`Remote id "${remoteId}" not found in ${indexPath}`);
  process.exit(1);
}
const remoteJsonPath = path.join(ROOT, "remotes-db", entry.file);
const remote = JSON.parse(readFileSync(remoteJsonPath, "utf8"));

// ---------- DB ----------
if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  console.error("Run this inside the add-on container, or pass --db to a copy.");
  process.exit(1);
}
let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  console.error("better-sqlite3 is not available in this environment.");
  console.error("Inside the add-on container it's bundled; on a host, `npm i better-sqlite3`.");
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

// ---------- pick target ----------
if (targetId == null) {
  const rows = db
    .prepare("SELECT id, name FROM target_devices WHERE remote_db_id = ?")
    .all(remoteId);
  if (rows.length === 0) {
    console.error(
      `No target_devices row has remote_db_id = "${remoteId}". ` +
        `Match your target to the remote in the app, or pass --target-id explicitly.`
    );
    const all = db.prepare("SELECT id, name, remote_db_id FROM target_devices").all();
    if (all.length) {
      console.error("\nAvailable targets:");
      for (const t of all) console.error(`  id=${t.id}  name=${t.name}  remote_db_id=${t.remote_db_id || "(none)"}`);
    }
    process.exit(1);
  }
  if (rows.length > 1) {
    console.error(`Multiple targets match remote_db_id=${remoteId}:`);
    for (const t of rows) console.error(`  id=${t.id}  name=${t.name}`);
    console.error("Pass --target-id <N> to pick one.");
    process.exit(1);
  }
  targetId = rows[0].id;
  console.log(`Using target id=${targetId} ("${rows[0].name}")`);
}

// ---------- read commands ----------
const commands = db
  .prepare(
    "SELECT id, name, button_id, broadlink_code, esp_payload_type, esp_payload " +
      "FROM commands WHERE target_device_id = ?"
  )
  .all(targetId);
db.close();

if (commands.length === 0) {
  console.error(`Target ${targetId} has 0 commands. Capture buttons in the app first.`);
  process.exit(1);
}

// ---------- match commands to remote buttons ----------
const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[+]/g, "_plus")
    .replace(/[-]/g, "_minus")
    .replace(/[^a-z0-9_]/g, "");

const byId = new Map(); // button.id -> command row
for (const cmd of commands) {
  // Prefer explicit button_id
  let key = cmd.button_id && String(cmd.button_id).trim();
  if (!key) {
    // Fallback: match on name (case/space/punct insensitive) against button.id or label
    const n = normalize(cmd.name);
    const btn = remote.buttons.find(
      (b) => normalize(b.id) === n || normalize(b.label) === n
    );
    if (btn) key = btn.id;
  }
  if (!key) continue;
  // If multiple commands for same button, prefer one with a broadlink code, else keep first
  const prior = byId.get(key);
  if (!prior) byId.set(key, cmd);
  else if (!prior.broadlink_code && cmd.broadlink_code) byId.set(key, cmd);
}

// ---------- build code strings ----------
const buildCode = (cmd) => {
  if (cmd.broadlink_code && cmd.broadlink_code.length > 0) return cmd.broadlink_code;
  if (cmd.esp_payload && cmd.esp_payload.length > 0) {
    return JSON.stringify({ type: cmd.esp_payload_type || "raw", data: cmd.esp_payload });
  }
  return "";
};

// ---------- apply, report ----------
const filled = [];
const missing = [];
const skipped = [];
const updatedButtons = remote.buttons.map((b) => {
  const cmd = byId.get(b.id);
  if (!cmd) {
    if (!b.code) missing.push(b.id);
    return b;
  }
  const code = buildCode(cmd);
  if (!code) {
    skipped.push(`${b.id} (command id=${cmd.id} has no broadlink_code or esp_payload)`);
    return b;
  }
  filled.push(b.id);
  return { ...b, code };
});

// Commands that couldn't be matched to any button
const orphans = commands.filter((c) => {
  const n = normalize(c.name);
  const matched =
    (c.button_id && remote.buttons.some((b) => b.id === c.button_id)) ||
    remote.buttons.some((b) => normalize(b.id) === n || normalize(b.label) === n);
  return !matched;
});

// ---------- write or preview ----------
const updated = { ...remote, buttons: updatedButtons };

console.log("");
console.log(`Remote: ${remote.id} — ${remote.make} ${remote.model}`);
console.log(`Buttons total: ${remote.buttons.length}`);
console.log(`Filled this run: ${filled.length}`);
console.log(`Missing (no code yet): ${missing.length}${missing.length ? "  " + missing.join(", ") : ""}`);
if (skipped.length) console.log(`Skipped (empty payload): ${skipped.length}\n  ${skipped.join("\n  ")}`);
if (orphans.length)
  console.log(
    `Orphan commands (couldn't match to any button by id/name): ${orphans.length}\n  ` +
      orphans.map((c) => `id=${c.id} name="${c.name}" button_id="${c.button_id || ""}"`).join("\n  ")
  );

if (!write) {
  console.log("\nDry run. Pass --write to update", remoteJsonPath);
  process.exit(0);
}

writeFileSync(remoteJsonPath, JSON.stringify(updated, null, 2) + "\n");
console.log(`\nWrote ${remoteJsonPath}`);
console.log("Next:");
console.log("  1. Run  node scripts/validate-remotes-db.mjs  to confirm the file is clean.");
console.log("  2. If all codes are non-empty, flip `verified: true` and add `verified_by`.");
console.log("  3. Bump config.yaml version, commit, push — CI + release workflow handle the rest.");
