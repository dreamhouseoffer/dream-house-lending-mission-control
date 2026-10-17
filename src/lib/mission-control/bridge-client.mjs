// Generic, framework-neutral client for the mc-bridge v0 protocol (signed GET reads + signed JSON POST). Server-only: it signs requests with
// the shared secret, so it must never be imported from a client component.
// Protocol: HMAC-SHA256 over "mc-bridge-v1\nMETHOD\ntarget\nts\nnonce\nsha256(body)" sent as
// x-mc-timestamp / x-mc-nonce / x-mc-signature. Nothing here logs URLs, secrets, headers or bodies.
import { createHash, createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { IDEMPOTENCY_KEY_RE, checkTemplates, createCapability } from "./task-submit.mjs";

export const TASK_ID_RE = /^t_[0-9a-f]{6,32}$/;
export const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;
// Bounded, but long enough for a cold native Hermes CLI start behind the bridge.
export const DEFAULT_TIMEOUT_MS = 12_000;
export const MAX_TIMEOUT_MS = 20_000;
export const MAX_REQUEST_BYTES = 16 * 1024;
export const ATTEMPT_KEY_RE = /^[0-9a-f]{64}$/;
export const MAX_RETRY_AFTER_S = 24 * 60 * 60;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const STALE_AFTER_MS = 60_000;

const MAX_TEXT = 20_000;
const MAX_ITEMS = 500;
const MAX_KEYS = 40;

export const BRIDGE_UI_STATES = [
  "queued", "queued_after_failure", "running_unverified", "interrupted", "waiting_approval", "review",
  "blocked", "failed", "completed", "completed_unverified", "archived", "unknown",
];

// Bridge UI state -> dashboard lifecycle bucket (TASK_STATUSES ids). Archive is not a verified cancel, and
// "unknown" is not guessed into a bucket: both are listed only under "All".
const BUCKET = {
  queued: "queued",
  queued_after_failure: "queued",
  running_unverified: "running",
  interrupted: "blocked",
  waiting_approval: "waiting_approval",
  review: "waiting_approval",
  blocked: "blocked",
  failed: "failed",
  completed: "completed",
  completed_unverified: "completed",
  archived: null,
  unknown: null,
};

export const UI_STATE_LABELS = {
  queued: "Queued",
  queued_after_failure: "Queued after failure",
  running_unverified: "Running · liveness unverified",
  interrupted: "Interrupted",
  waiting_approval: "Waiting approval",
  review: "Awaiting review",
  blocked: "Blocked",
  failed: "Failed",
  completed: "Completed · verified receipt",
  completed_unverified: "Done · not verified",
  archived: "Archived (not a verified cancel)",
  unknown: "Unrecognised status",
};

export const UI_STATE_TONES = {
  queued: "neutral", queued_after_failure: "warn", running_unverified: "info", interrupted: "bad",
  waiting_approval: "warn", review: "warn", blocked: "warn", failed: "bad", completed: "ok",
  completed_unverified: "neutral", archived: "neutral", unknown: "neutral",
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Canonical string; must stay byte-identical to the installed bridge's auth. */
export function canonical(method, target, ts, nonce, body) {
  return ["mc-bridge-v1", String(method).toUpperCase(), target, String(ts), nonce, sha256(body || Buffer.alloc(0))].join("\n");
}

/** @param {Buffer} secret */
export function sign(secret, method, target, ts, nonce, body) {
  return createHmac("sha256", secret).update(canonical(method, target, ts, nonce, body)).digest("hex");
}

export function newNonce() {
  return randomBytes(24).toString("base64url");
}

/**
 * Validate configuration without echoing values. Returns { configured: true, origin, secret } or
 * { configured: false, reason } where reason never contains the URL or secret.
 * @param {{ url?: string, secret?: string }} input
 */
export function readBridgeConfig({ url, secret } = {}) {
  if (!url && !secret) return { configured: false, reason: "not_configured" };
  if (!url || !secret) return { configured: false, reason: "incomplete_config" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { configured: false, reason: "invalid_url" };
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { configured: false, reason: "invalid_url" };
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") return { configured: false, reason: "invalid_url" };
  const key = Buffer.from(secret, "utf8");
  if (key.length < 32) return { configured: false, reason: "secret_too_short" };
  return { configured: true, origin: parsed.origin, secret: key };
}

/** Default transport: node:http(s) with a hard timeout and size cap. No Origin / Sec-Fetch headers are sent. */
export function nodeTransport({ origin, target, method, headers, body, timeoutMs, maxBytes }) {
  const u = new URL(target, origin);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(v);
    };
    const req = lib.request(
      { protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: target, method, headers, agent: false },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            done(reject, Object.assign(new Error("response_too_large"), { code: "response_too_large" }));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          done(resolve, { status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) })
        );
        res.on("error", () => done(reject, Object.assign(new Error("network"), { code: "network" })));
      }
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(reject, Object.assign(new Error("timeout"), { code: "timeout" }));
    }, timeoutMs);
    req.on("error", (e) => done(reject, Object.assign(new Error("network"), { code: e && e.code === "ECONNREFUSED" ? "refused" : "network" })));
    // Sends exactly the bytes that were signed (or nothing for GET).
    req.end(body && body.length ? body : undefined);
  });
}

const failure = (state, code) => ({ ok: false, state, code });

const METHODS = new Set(["GET", "POST"]);

/**
 * Signed request against the bridge. Never throws; returns { ok: true, status, data } or { ok: false, state, code }.
 * For POST the JSON body is serialized once and those exact bytes are both signed and transmitted.
 * @param {{ configured: boolean, origin?: string, secret?: Buffer, reason?: string }} config
 * @param {"GET" | "POST"} method
 * @param {string} target path + query, already encoded
 * @param {{ body?: unknown, acceptStatus?: number[], transport?: Function, now?: () => number, timeoutMs?: number, maxBytes?: number, nonce?: string, idempotencyKey?: string }} [options]
 */
export async function bridgeRequest(config, method, target, { body, acceptStatus = [200], transport = nodeTransport, now = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES, nonce = newNonce(), idempotencyKey } = {}) {
  if (!config || !config.configured) return failure("not_configured", config?.reason ?? "not_configured");
  if (!METHODS.has(method)) return failure("error", "invalid_method");
  if (typeof target !== "string" || !target.startsWith("/v0/")) return failure("error", "invalid_target");
  if (!NONCE_RE.test(nonce)) return failure("error", "invalid_nonce");
  if (idempotencyKey !== undefined && (method !== "POST" || typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_RE.test(idempotencyKey))) {
    return failure("error", "invalid_idempotency_key");
  }
  let bytes = Buffer.alloc(0);
  if (method === "POST") {
    let json;
    try {
      json = JSON.stringify(body ?? {});
    } catch {
      return failure("error", "invalid_body");
    }
    bytes = Buffer.from(json, "utf8");
    if (bytes.length > MAX_REQUEST_BYTES) return failure("error", "request_too_large");
  } else if (body !== undefined) {
    return failure("error", "invalid_body");
  }
  const ms = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 250), MAX_TIMEOUT_MS);
  const ts = String(Math.floor(now() / 1000));
  const headers = {
    accept: "application/json",
    "x-mc-timestamp": ts,
    "x-mc-nonce": nonce,
    "x-mc-signature": sign(config.secret, method, target, ts, nonce, bytes),
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(bytes.length);
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  }
  let res;
  try {
    res = await transport({ origin: config.origin, target, method, headers, body: method === "POST" ? bytes : undefined, timeoutMs: ms, maxBytes });
  } catch (e) {
    const code = e && typeof e.code === "string" ? e.code : "network";
    return failure(code === "response_too_large" ? "bad_payload" : "offline", code);
  }
  if (!res || !Buffer.isBuffer(res.body)) return failure("bad_payload", "no_body");
  if (res.body.length > maxBytes) return failure("bad_payload", "response_too_large");
  if (!acceptStatus.includes(res.status)) {
    if (res.status === 401) return failure("unauthorized", "unauthorized");
    if (res.status === 403) return failure("unauthorized", "forbidden");
    if (res.status === 404) return failure("not_found", "not_found");
    if (res.status === 503 || res.status === 504) return failure("hermes_unavailable", res.status === 504 ? "hermes_timeout" : "hermes_unavailable");
    return failure("error", `http_${res.status}`);
  }
  if (!/^application\/json\b/i.test(res.contentType)) return failure("bad_payload", "not_json");
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.body.toString("utf8")) };
  } catch {
    return failure("bad_payload", "malformed_json");
  }
}

/**
 * Signed GET against the bridge. Never throws; returns { ok: true, data } or { ok: false, state, code }.
 * @param {{ configured: boolean, origin?: string, secret?: Buffer, reason?: string }} config
 * @param {string} target path + query, already encoded
 */
export async function bridgeGet(config, target, options = {}) {
  const res = await bridgeRequest(config, "GET", target, { ...options, body: undefined, acceptStatus: [200] });
  return res.ok ? { ok: true, data: res.data } : res;
}

/** Strict reading of the bridge's POST /v0/auth/attempt answer; anything else is treated as unavailable. */
export function checkAttemptResponse(status, data) {
  if (!isObj(data)) return { state: "unavailable", code: "bad_payload" };
  if (status === 200 && data.allowed === true && data.retry_after === 0) return { state: "allowed" };
  if (status === 429 && data.allowed === false && Number.isInteger(data.retry_after) && data.retry_after > 0) {
    return { state: "limited", retryAfter: Math.min(data.retry_after, MAX_RETRY_AFTER_S) };
  }
  return { state: "unavailable", code: "bad_payload" };
}

/**
 * Report one sign-in attempt to the bridge's persistent throttle. `key` is already a keyed hash of the client
 * identifier. Never throws; returns { state: "allowed" } | { state: "limited", retryAfter } | { state: "unavailable", code }.
 */
export async function reportLoginAttempt(config, { key, matched } = {}, options = {}) {
  if (typeof key !== "string" || !ATTEMPT_KEY_RE.test(key) || typeof matched !== "boolean") return { state: "unavailable", code: "invalid_attempt" };
  const res = await bridgeRequest(config, "POST", "/v0/auth/attempt", { ...options, body: { key, matched }, acceptStatus: [200, 429] });
  if (!res.ok) return { state: "unavailable", code: res.code };
  return checkAttemptResponse(res.status, res.data);
}

// ---- payload checking -------------------------------------------------------------------------------------

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function flat(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, MAX_KEYS)) {
    if (!/^[a-z_][a-z0-9_]{0,63}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
    else if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

function checkIso(v) {
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
}

function checkUi(ui) {
  if (!isObj(ui) || typeof ui.state !== "string") return null;
  const state = BRIDGE_UI_STATES.includes(ui.state) ? ui.state : "unknown";
  return {
    state,
    reason: typeof ui.reason === "string" ? ui.reason.slice(0, 500) : "",
    native_status: typeof ui.native_status === "string" ? ui.native_status.slice(0, 64) : null,
    latest_run_outcome: typeof ui.latest_run_outcome === "string" ? ui.latest_run_outcome.slice(0, 64) : null,
  };
}

/** @returns {any | null} */
export function checkTask(t) {
  if (!isObj(t) || typeof t.id !== "string" || !TASK_ID_RE.test(t.id) || typeof t.status !== "string") return null;
  const ui = checkUi(t.ui);
  if (!ui) return null;
  const task = flat(t);
  const bucket = BUCKET[ui.state] ?? null;
  return { ...task, ui, bucket, verified: ui.state === "completed" };
}

export function checkRuns(runs) {
  if (!Array.isArray(runs)) return null;
  return runs.filter(isObj).slice(-MAX_ITEMS).map(flat);
}

export function checkTaskList(data) {
  if (!isObj(data) || !Array.isArray(data.tasks)) return null;
  const observedAt = checkIso(data.observed_at);
  if (!observedAt) return null;
  const tasks = [];
  for (const raw of data.tasks.slice(0, MAX_ITEMS)) {
    const t = checkTask(raw);
    if (!t) return null; // one malformed record rejects the payload; nothing is half-trusted
    tasks.push(t);
  }
  return { tasks, observedAt };
}

export function checkTaskDetail(data) {
  if (!isObj(data)) return null;
  const task = checkTask(data.task);
  const runs = checkRuns(data.runs ?? []);
  const observedAt = checkIso(data.observed_at);
  if (!task || !runs || !observedAt) return null;
  const events = Array.isArray(data.events) ? data.events.filter(isObj).slice(-200).map(flat) : [];
  const latestSummary = typeof data.latest_summary === "string" ? data.latest_summary.slice(0, MAX_TEXT) : null;
  return { task, runs, events, latestSummary, observedAt };
}

export function checkRunList(data, id) {
  if (!isObj(data) || data.task_id !== id) return null;
  const runs = checkRuns(data.runs);
  const observedAt = checkIso(data.observed_at);
  return runs && observedAt ? { taskId: id, runs, observedAt } : null;
}

export function checkCapabilities(data) {
  if (!isObj(data) || !Array.isArray(data.ops) || typeof data.read_only !== "boolean") return null;
  const ops = data.ops.filter((o) => typeof o === "string").slice(0, 50);
  const unsupported = isObj(data.unsupported)
    ? Object.fromEntries(Object.entries(data.unsupported).filter(([, v]) => typeof v === "string").slice(0, 50))
    : {};
  const assignees = Array.isArray(data.assignees) ? data.assignees.filter((a) => typeof a === "string").slice(0, 50) : null;
  return { ops, unsupported, readOnly: data.read_only, assignees, templates: checkTemplates(data.task_templates) };
}

// ---- view helpers -----------------------------------------------------------------------------------------

/** Native kanban times are unix seconds; accept ms or ISO too. Returns epoch ms or null. */
export function toEpochMs(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && Number.isFinite(Date.parse(v))) return Date.parse(v);
  return null;
}

export function formatTime(v) {
  const ms = toEpochMs(v);
  return ms === null ? "—" : `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function lastTouched(task) {
  for (const k of ["completed_at", "updated_at", "started_at", "created_at"]) {
    const ms = toEpochMs(task[k]);
    if (ms !== null) return ms;
  }
  return 0;
}

/** Filter by dashboard bucket and case-insensitive search over id, title, assignee and body. */
export function filterTasks(tasks, { status = "all", q = "" } = {}) {
  const needle = String(q).trim().toLowerCase().slice(0, 100);
  return tasks.filter((t) => {
    if (status !== "all" && t.bucket !== status) return false;
    if (!needle) return true;
    return [t.id, t.title, t.assignee, t.body].some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
  });
}

export function countByBucket(tasks) {
  const counts = { queued: 0, running: 0, waiting_approval: 0, blocked: 0, completed: 0, failed: 0, canceled: 0, unbucketed: 0, verified_completed: 0 };
  for (const t of tasks) {
    if (t.bucket && t.bucket in counts) counts[t.bucket] += 1;
    else counts.unbucketed += 1;
    if (t.verified) counts.verified_completed += 1;
  }
  return counts;
}

/** Freshness of the bridge's own observation (an HTTP read), never a runtime heartbeat. */
export function observationState(observedAt, now = Date.now(), staleAfterMs = STALE_AFTER_MS) {
  const t = Date.parse(observedAt ?? "");
  if (!Number.isFinite(t)) return "unverified";
  return now - t > staleAfterMs ? "stale" : "observed";
}

/** Creation is enabled only by the bridge's own capabilities: POST allowed, not read-only, and safe templates advertised. */
export function taskCreateCapability(caps) {
  const { enabled, reason } = createCapability(caps);
  return { enabled, reason };
}

// ---- task creation ----------------------------------------------------------------------------------------

const CREATE_ACCEPT = [200, 202, 400, 409, 413, 415];

/**
 * Classify the bridge's answer to POST /v0/tasks. Anything that may have created a task but cannot be proven is
 * "ambiguous"/"unconfirmed", never "rejected": a malformed success body is NOT a failure.
 * @param {number} status
 * @param {unknown} data
 * @param {{ title: string, assignee: string }} expected
 */
export function checkCreateResponse(status, data, expected) {
  if (status === 200 || status === 202) {
    const task = isObj(data) && data.submitted === true ? checkTask(data.task) : null;
    if (!task || task.title !== expected.title || task.assignee !== expected.assignee) return { outcome: "ambiguous", code: "unverifiable_acceptance" };
    return { outcome: "accepted", task, deduplicated: data.deduplicated === true, observedAt: checkIso(data.observed_at) };
  }
  const error = isObj(data) && typeof data.error === "string" ? data.error.slice(0, 64) : "unknown";
  if (status === 409) {
    if (error === "idempotency_conflict") return { outcome: "conflict", code: error };
    return { outcome: "ambiguous", code: error === "create_outcome_ambiguous" || error === "idempotency_task_mismatch" ? error : "conflict_unrecognised" };
  }
  // 400/413/415: the bridge parses and validates before reserving the key, so nothing was created.
  return { outcome: "rejected", code: error };
}

/**
 * Signed POST /v0/tasks with the exact {title, body, assignee} payload and Idempotency-Key. Never throws.
 * Connection refused / auth failures cannot have created anything; timeouts, dropped connections and 5xx might
 * have, so they come back "unconfirmed" (same-key retry is safe because the bridge dedupes on the key).
 */
export async function submitTask(config, payload, key, options = {}) {
  const res = await bridgeRequest(config, "POST", "/v0/tasks", {
    ...options,
    body: { title: payload.title, body: payload.body, assignee: payload.assignee },
    idempotencyKey: key,
    acceptStatus: CREATE_ACCEPT,
  });
  if (!res.ok) {
    if (res.state === "not_configured" || res.code === "refused" || res.state === "unauthorized") return { outcome: "unavailable", code: res.code };
    if (res.state === "error" && /^invalid_|request_too_large/.test(res.code)) return { outcome: "rejected", code: res.code };
    return { outcome: "unconfirmed", code: res.code };
  }
  return checkCreateResponse(res.status, res.data, payload);
}

export const FAILURE_COPY = {
  not_configured: { kind: "not_connected", title: "Mac execution bridge is not connected", body: "No bridge endpoint is configured for this deployment." },
  unauthenticated: { kind: "not_connected", title: "Sign-in required to read tasks", body: "Bridge data is only read for an authenticated Mission Control session." },
  offline: { kind: "offline", title: "Mac execution bridge is offline", body: "The configured bridge did not answer in time. Nothing below is cached or simulated." },
  unauthorized: { kind: "error", title: "Bridge rejected the request", body: "The bridge refused the signed request (credential or clock mismatch)." },
  hermes_unavailable: { kind: "error", title: "Bridge reached, Hermes unavailable", body: "The bridge answered but could not read the Hermes task board." },
  bad_payload: { kind: "error", title: "Bridge response failed validation", body: "The response did not match the expected schema, so it was discarded." },
  not_found: { kind: "empty", title: "Task not found", body: "The Hermes task board has no task with this id." },
  error: { kind: "error", title: "Bridge request failed", body: "The bridge returned an unexpected response." },
};

export function failureCopy(state) {
  return FAILURE_COPY[state] ?? FAILURE_COPY.error;
}
