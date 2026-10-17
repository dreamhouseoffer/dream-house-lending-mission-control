// Server-only approvals boundary: the owner request guard for approval reads and (future) ceremonies, plus the
// READ-ONLY adapter onto the private bridge's GET /v0/approvals and GET /v0/approvals/:id. It signs bridge requests
// through bridge-client.mjs, so it must never be imported from a client component. Nothing here logs.
//
// There is deliberately NO decision or challenge dispatch in this module. Decisions stay unavailable until durable
// single-use pending-challenge storage, a server-side revocation epoch and owner enrollment exist (see
// DECISION_UNAVAILABLE_REASON). Bridge capabilities cannot switch that on.
import { readSessionConfig, verifySessionBinding } from "../auth/session.mjs";
import { TASK_ID_RE, bridgeGet } from "./bridge-client.mjs";

export const APPROVAL_ID_RE = /^ap_[0-9a-f]{24}$/;
export const FRESH_AUTH_SECONDS = 15 * 60;
export const DECISION_UNAVAILABLE_REASON =
  "decisions_disabled: owner WebAuthn enrollment and the signed-session ceremony (durable single-use pending challenges, server-side session revocation) are not implemented";

export const APPROVAL_STATES = [
  "awaiting_approval", "expired", "stale", "invalidated", "rejected", "revision_requested",
  "authorization_expired", "authorized_not_executed", "executing", "delivered_to_safe_sink_only", "execution_refused",
  "execution_ambiguous", "unknown",
];

// Any client attempt to name the session binding is refused, never merged: the binding is derived from the cookie.
const CLIENT_BINDING_KEYS = ["session_sha256", "session_hash", "session", "session_id", "sessionSha256"];
const CLIENT_BINDING_HEADERS = ["x-mc-session-sha256", "x-session-sha256", "x-session-hash"];

const MAX_TEXT = 20_000;
const MAX_ITEMS = 500;

const deny = (status, reason) => ({ ok: false, status, reason });
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Exact canonical https origin (scheme://host[:port], no path/query/userinfo). Fails closed without echoing it. */
export function readCanonicalOrigin(value) {
  if (typeof value !== "string" || !value) return { ok: false, reason: "origin_not_configured" };
  let u;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, reason: "origin_invalid" };
  }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    return { ok: false, reason: "origin_invalid" };
  }
  if (value !== u.origin && value !== `${u.origin}/`) return { ok: false, reason: "origin_invalid" };
  return { ok: true, origin: u.origin };
}

function clientBindingSupplied(headers, body, query) {
  if (CLIENT_BINDING_HEADERS.some((h) => headers?.get?.(h) != null)) return true;
  if (isObj(body) && CLIENT_BINDING_KEYS.some((k) => Object.prototype.hasOwnProperty.call(body, k))) return true;
  if (query && typeof query.has === "function" && CLIENT_BINDING_KEYS.some((k) => query.has(k))) return true;
  return false;
}

/**
 * Owner guard for every approvals request. Order: client binding refused -> verified owner cookie -> (ceremony only)
 * exact canonical https Origin + Sec-Fetch-Site same-origin -> (fresh only) auth age <= 15 min.
 * Reads still refuse an explicit cross-site/same-site Sec-Fetch-Site. The session binding is computed here from the
 * verified claims and is the only binding a caller may use.
 * @param {{ env: Record<string, string | undefined>, token?: string, headers?: { get(n: string): string | null },
 *   mode: "read" | "ceremony", requireFreshAuth?: boolean, body?: unknown, query?: URLSearchParams, now?: number }} input
 */
export async function guardApprovalRequest({ env = {}, token, headers, mode, requireFreshAuth = false, body, query, now = Date.now() } = {}) {
  if (mode !== "read" && mode !== "ceremony") return deny(500, "invalid_guard_mode");
  if (clientBindingSupplied(headers, body, query)) return deny(400, "client_session_binding_refused");
  const config = readSessionConfig({ pin: env.MISSION_CONTROL_PIN, secret: env.MISSION_CONTROL_SESSION_SECRET });
  if (!config.ok) return deny(503, "session_not_configured");
  const v = await verifySessionBinding(config, token, { now });
  if (!v.ok || v.claims.sub !== "owner") return deny(401, v.ok ? "not_owner" : `session_${v.reason}`);
  const site = headers?.get?.("sec-fetch-site") ?? null;
  if (mode === "ceremony") {
    const canonical = readCanonicalOrigin(env.MISSION_CONTROL_CANONICAL_ORIGIN);
    if (!canonical.ok) return deny(503, canonical.reason);
    const origin = headers?.get?.("origin") ?? null;
    if (origin === null) return deny(403, "origin_missing");
    if (origin !== canonical.origin) return deny(403, "origin_mismatch");
    if (site === null) return deny(403, "fetch_site_missing");
    if (site !== "same-origin") return deny(403, "fetch_site_not_same_origin");
  } else if (site !== null && site !== "same-origin" && site !== "none") {
    return deny(403, "fetch_site_not_same_origin");
  }
  const authAgeSeconds = Math.floor(now / 1000) - v.claims.iat;
  if (requireFreshAuth && (authAgeSeconds < -60 || authAgeSeconds > FRESH_AUTH_SECONDS)) return deny(401, "reauth_required");
  return { ok: true, session: { sessionSha256: v.sessionSha256, iat: v.claims.iat, exp: v.claims.exp, authAgeSeconds } };
}

/** Decisions are never available from this app build, whatever the bridge advertises. */
export function decisionAvailability(_capabilities) {
  return { available: false, reason: DECISION_UNAVAILABLE_REASON };
}

// ---- payload checking (whole payload rejected on any malformed record) --------------------------------------

const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : null);
const iso = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);

export function checkApproval(a, { withContent = false } = {}) {
  if (!isObj(a) || typeof a.approval_id !== "string" || !APPROVAL_ID_RE.test(a.approval_id)) return null;
  if (typeof a.task_id !== "string" || !TASK_ID_RE.test(a.task_id)) return null;
  if (typeof a.status !== "string" || typeof a.state !== "string" || !isObj(a.artifact)) return null;
  if (!Number.isSafeInteger(a.row_version) || !iso(a.expires_at) || !iso(a.created_at)) return null;
  const art = a.artifact;
  if (typeof art.id !== "string" || !Number.isSafeInteger(art.version) || typeof art.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(art.sha256)) return null;
  const out = {
    approval_id: a.approval_id,
    task_id: a.task_id,
    state: APPROVAL_STATES.includes(a.state) ? a.state : "unknown",
    status: str(a.status, 32),
    artifact: {
      id: str(art.id, 128), version: art.version, sha256: art.sha256,
      latest_version: int(art.latest_version), is_latest: art.is_latest === true,
    },
    action: str(a.action, 64),
    destination: str(a.destination, 500),
    max_cost_cents: int(a.max_cost_cents),
    not_before: iso(a.not_before),
    expires_at: a.expires_at,
    requested_by: str(a.requested_by, 64),
    approver: str(a.approver, 64),
    approver_assurance: str(a.approver_assurance, 64),
    owner_verified: a.owner_verified === true,
    decided_at: iso(a.decided_at),
    decision_note: str(a.decision_note, 2000),
    invalidated_reason: str(a.invalidated_reason, 200),
    created_at: a.created_at,
    row_version: a.row_version,
    // Never upgraded: the app reports exactly what the bridge proved, and external execution is not connected.
    executed: a.executed === "safe_sink_only" ? "safe_sink_only" : false,
    external_execution: "not_connected",
  };
  if (withContent) out.artifact.content = typeof art.content === "string" ? art.content.slice(0, MAX_TEXT) : null;
  return out;
}

export function checkApprovalList(data) {
  if (!isObj(data) || !Array.isArray(data.approvals) || !iso(data.observed_at)) return null;
  const approvals = [];
  for (const raw of data.approvals.slice(0, MAX_ITEMS)) {
    const a = checkApproval(raw);
    if (!a) return null;
    approvals.push(a);
  }
  return { approvals, observedAt: data.observed_at };
}

export function checkApprovalDetail(data, id) {
  if (!isObj(data) || !iso(data.observed_at)) return null;
  const approval = checkApproval(data.approval, { withContent: true });
  return approval && approval.approval_id === id ? { approval, observedAt: data.observed_at } : null;
}

// ---- read handler (framework-neutral; the Next routes are thin wrappers) ------------------------------------

const HTTP_FOR = { not_found: 404, not_configured: 503, offline: 503, hermes_unavailable: 503, unauthorized: 502, bad_payload: 502, error: 502 };

/**
 * Guarded READ of the approvals list or one approval. Only ever issues a signed GET; never a POST, challenge or
 * decision. Bridge failures and schema mismatches fail closed with no partial data.
 * @param {{ env: Record<string, string | undefined>, token?: string, headers?: any, kind: "list" | "detail", id?: string,
 *   query?: URLSearchParams, bridgeConfig: any, transport?: Function, now?: number }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleApprovalRead({ env, token, headers, kind, id, query, bridgeConfig, transport, now = Date.now() }) {
  const guard = await guardApprovalRequest({ env, token, headers, mode: "read", query, now });
  if (!guard.ok) return { status: guard.status, body: { ok: false, state: guard.status === 401 ? "unauthenticated" : "forbidden", code: guard.reason } };
  const decision = decisionAvailability();
  const opts = transport ? { transport, now: () => now } : { now: () => now };
  let target;
  if (kind === "list") {
    const keys = query ? [...query.keys()] : [];
    if (keys.some((k) => k !== "task_id")) return { status: 400, body: { ok: false, state: "invalid_query", code: "invalid_query" } };
    const taskId = query?.get("task_id") ?? null;
    if (taskId !== null && !TASK_ID_RE.test(taskId)) return { status: 400, body: { ok: false, state: "invalid_task_id", code: "invalid_task_id" } };
    target = taskId ? `/v0/approvals?task_id=${taskId}` : "/v0/approvals";
  } else if (kind === "detail") {
    if (typeof id !== "string" || !APPROVAL_ID_RE.test(id)) return { status: 400, body: { ok: false, state: "invalid_approval_id", code: "invalid_approval_id" } };
    if (query && [...query.keys()].length) return { status: 400, body: { ok: false, state: "invalid_query", code: "invalid_query" } };
    target = `/v0/approvals/${id}`;
  } else {
    return { status: 500, body: { ok: false, state: "error", code: "invalid_kind" } };
  }
  const res = await bridgeGet(bridgeConfig, target, opts);
  if (!res.ok) return { status: HTTP_FOR[res.state] ?? 502, body: { ok: false, state: res.state, code: res.code, decision } };
  const checked = kind === "list" ? checkApprovalList(res.data) : checkApprovalDetail(res.data, id);
  if (!checked) return { status: 502, body: { ok: false, state: "bad_payload", code: "schema_mismatch", decision } };
  const body = kind === "list"
    ? { ok: true, observed_at: checked.observedAt, approvals: checked.approvals, decision }
    : { ok: true, observed_at: checked.observedAt, approval: checked.approval, decision };
  return { status: 200, body };
}
