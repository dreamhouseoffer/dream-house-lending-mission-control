// Server-only loader for the private Headquarters snapshot. Import from route handlers or
// server components only; it reads env at request time so nothing is bundled.
// Cloud config (MC_HQ_SNAPSHOT_PART_COUNT + MC_HQ_SNAPSHOT_PART_0..N-1, base64 of gzip JSON)
// takes precedence over MC_HQ_SNAPSHOT_PATH and never falls back to the local file.
import { readFile as fsReadFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { gunzipSync } from "node:zlib";
import { createUnavailableSnapshot, normalizeSnapshot } from "./model.mjs";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const MAX_CLOUD_PARTS = 8;
const MAX_CLOUD_PART_CHARS = 4096;
const CLOUD_COUNT_KEY = "MC_HQ_SNAPSHOT_PART_COUNT";
const CLOUD_PART_PREFIX = "MC_HQ_SNAPSHOT_PART_";
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function hasCloudConfig(env) {
  if (env?.[CLOUD_COUNT_KEY] !== undefined) return true;
  for (let i = 0; i < MAX_CLOUD_PARTS; i += 1) {
    if (env?.[`${CLOUD_PART_PREFIX}${i}`] !== undefined) return true;
  }
  return false;
}

// Returns the decompressed JSON text, or null on any problem. Never surfaces values or errors.
function readCloudText(env) {
  const countText = env[CLOUD_COUNT_KEY];
  if (typeof countText !== "string" || !/^[1-9]$/.test(countText)) return null;
  const count = Number(countText);
  if (count > MAX_CLOUD_PARTS) return null;
  // Parts beyond the declared count indicate a stale or partial update.
  for (let i = count; i < MAX_CLOUD_PARTS; i += 1) {
    if (env[`${CLOUD_PART_PREFIX}${i}`] !== undefined) return null;
  }

  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const part = env[`${CLOUD_PART_PREFIX}${i}`];
    if (typeof part !== "string" || !part || part.length > MAX_CLOUD_PART_CHARS) return null;
    parts.push(part);
  }
  const encoded = parts.join("");
  if (encoded.length > MAX_SNAPSHOT_BYTES || !BASE64_RE.test(encoded)) return null;

  try {
    const compressed = Buffer.from(encoded, "base64");
    const json = gunzipSync(compressed, { maxOutputLength: MAX_SNAPSHOT_BYTES });
    return new TextDecoder("utf-8", { fatal: true }).decode(json);
  } catch {
    return null;
  }
}

function parseSnapshotText(text) {
  if (typeof text !== "string" || text.length > MAX_SNAPSHOT_BYTES) return createUnavailableSnapshot("malformed");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return createUnavailableSnapshot("malformed");
  }
  return normalizeSnapshot(raw);
}

export async function loadHeadquartersSnapshot({ env = process.env, readFile = fsReadFile } = {}) {
  if (hasCloudConfig(env)) {
    const text = readCloudText(env);
    if (text === null) return createUnavailableSnapshot("malformed");
    return parseSnapshotText(text);
  }

  const snapshotPath = typeof env?.MC_HQ_SNAPSHOT_PATH === "string" ? env.MC_HQ_SNAPSHOT_PATH.trim() : "";
  if (!snapshotPath || !isAbsolute(snapshotPath) || !snapshotPath.endsWith(".json")) {
    return createUnavailableSnapshot("not_configured");
  }

  let text;
  try {
    text = await readFile(snapshotPath, "utf8");
  } catch {
    // Never echo the path or the underlying error; both can reveal local layout.
    return createUnavailableSnapshot("unreadable");
  }
  return parseSnapshotText(text);
}
