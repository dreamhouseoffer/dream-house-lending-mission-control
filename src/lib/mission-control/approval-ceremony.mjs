// Server-only same-origin approval CEREMONY adapter (owner challenge issue, challenge decision, logout revocation).
// It signs bridge requests through bridge-client.mjs, so it must never be imported from a client component.
// Nothing here logs.
//
// FAIL CLOSED BY DEFAULT. Every entry point refuses (503 ceremony_unavailable) unless ALL of these hold:
//   1. the owner opted this deployment in: MISSION_CONTROL_APPROVAL_CEREMONY === "challenge_only_v1";
//   2. the bridge's GET /v0/capabilities advertises the exact reviewed challenge-only block (CEREMONY_CONTRACT):
//      mode challenge_only v1, legacy decision disabled AND the legacy decision op absent from `ops`, at least one
//      pinned WebAuthn owner credential whose rp_id is the canonical app host, durable session revocation, a
//      bridge-side issue rate limit, and every fixed ceremony op below.
// The production bridge advertises none of this today (the issue/decision/revoke routes exist only in its
// NODE_TEST_CONTEXT ceremony harness, which also advertises no ceremony block), so this build performs no challenge,
// decision or revocation call in practice. The opt-in local integration test (test-approval-ceremony-integration)
// exercises these handlers over real Next HTTP against that harness. See GATE3-SESSION-INTEGRATION-CHECKPOINT.md.
//
// What the app adds (and the bridge still re-checks authoritatively):
//   - owner identity/session binding ONLY from the verified signed cookie (guardApprovalRequest, ceremony mode:
//     exact canonical https Origin + Sec-Fetch-Site same-origin + fresh auth). Caller-supplied session/human/
//     principal/credential claims are refused, never merged.
//   - the exact approval/row_version/artifact/action/terms tuple the owner viewed must equal the bridge's current
//     record before a challenge is requested, and the issued payload bytes must hash to challenge_sha256 and carry
//     exactly that tuple, this session's binding and the canonical rp_id.
//   - fixed backend paths only; the legacy POST /v0/approvals/:id/decision is never called from here.
// What it does NOT add: owner assurance. Only the bridge's WebAuthn verifier over the issued bytes decides.
import { createHash, randomBytes } from "node:crypto";
import { APPROVAL_ID_RE, checkApproval, guardApprovalRequest, readCanonicalOrigin } from "./approvals-client.mjs";
import { readSessionConfig, verifySessionBinding } from "../auth/session.mjs";
import { bridgeGet, bridgeRequest } from "./bridge-client.mjs";

export const CEREMONY_OPT_IN = "challenge_only_v1";
export const CHALLENGE_ID_RE = /^och_[A-Za-z0-9_-]{32}$/;
export const SHA_RE = /^[0-9a-f]{64}$/;
export const DECISIONS = ["approve", "reject", "revise"];
export const MAX_NOTE = 2000;
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_RETRY_AFTER_S = 24 * 60 * 60;
export const CEREMONY_UNAVAILABLE = "ceremony_unavailable";
// The private bridge's canonical owner-assertion payload (owner-assertion.js canonicalPayload): exact key order,
// JSON.stringify bytes. The WebAuthn challenge is the raw sha256 digest of those bytes.
export const PAYLOAD_VERSION = "mcoa1";
export const PAYLOAD_PURPOSE = "mc-bridge:approval-decision";
export const PAYLOAD_KEYS = ["v", "purpose", "rp_id", "approval_id", "row_version", "task_id", "requested_by", "artifact_id",
  "artifact_version", "artifact_sha256", "action", "destination", "max_cost_cents", "not_before", "expires_at",
  "decision", "note_sha256", "human", "session_sha256", "credential_id", "iat", "exp", "nonce"];
export const MAX_CHALLENGE_TTL_S = 300;

/** Fixed bridge paths. Ids are validated against their regexes before interpolation. */
export const CEREMONY_OPS = {
  issue: "POST /v0/approvals/:id/owner-challenges",
  decide: "POST /v0/approvals/:id/owner-challenges/:challenge_id/decision",
  revoke: "POST /v0/sessions/revoke",
};
export const LEGACY_DECISION_OP = "POST /v0/approvals/:id/decision";
const issuePath = (approvalId) => `/v0/approvals/${approvalId}/owner-challenges`;
const decidePath = (approvalId, challengeId) => `/v0/approvals/${approvalId}/owner-challenges/${challengeId}/decision`;
const REVOKE_PATH = "/v0/sessions/revoke";

// Keys a caller must never supply: the server derives the binding and the bridge resolves the pinned principal.
const CLIENT_CLAIM_KEYS = [
  "session_sha256", "session_hash", "session", "session_id", "sessionSha256", "human", "principal", "approver",
  "owner", "owner_verified", "approver_assurance", "credential", "rp_id", "idempotency_key",
];
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const B64U_RE = /^[A-Za-z0-9_-]+$/;
const CODE_RE = /^[a-z0-9_]{1,64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const exactKeys = (o, keys) => isObj(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const out = (status, body) => ({ status, body });
const refuse = (status, code, extra = {}) => out(status, { ok: false, state: status === 401 ? "unauthenticated" : status === 503 ? "unavailable" : "refused", code, ...extra });
const sha256Hex = (b) => createHash("sha256").update(b).digest("hex");
const sameInstant = (a, b) => typeof a === "string" && typeof b === "string" && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

// ---- capability gate --------------------------------------------------------------------------------------

/**
 * Strict reading of the bridge's reviewed challenge-only advertisement. Anything missing, extra-permissive or
 * contradictory (e.g. the legacy decision op still advertised) yields { available: false, reason }.
 * @param {unknown} caps raw GET /v0/capabilities JSON
 * @param {{ canonicalHost: string }} ctx
 */
export function checkCeremonyCapability(caps, { canonicalHost } = {}) {
  const no = (reason) => ({ available: false, reason });
  if (!isObj(caps) || !Array.isArray(caps.ops)) return no("capabilities_malformed");
  if (caps.ops.includes(LEGACY_DECISION_OP)) return no("legacy_decision_still_advertised");
  for (const op of Object.values(CEREMONY_OPS)) if (!caps.ops.includes(op)) return no("ceremony_ops_missing");
  const c = caps.approval_ceremony;
  if (!isObj(c)) return no("ceremony_not_advertised");
  if (c.mode !== "challenge_only" || c.version !== 1) return no("ceremony_mode_unsupported");
  if (c.legacy_decision !== "disabled") return no("legacy_decision_not_disabled");
  if (c.session_revocation !== "durable") return no("session_revocation_not_durable");
  const e = c.owner_enrollment;
  if (!isObj(e) || e.kind !== "webauthn_pinned" || !Number.isSafeInteger(e.credentials) || e.credentials < 1) return no("owner_enrollment_missing");
  if (typeof canonicalHost !== "string" || !canonicalHost || e.rp_id !== canonicalHost) return no("owner_rp_id_mismatch");
  const r = c.issue_rate_limit;
  if (!isObj(r) || !Number.isSafeInteger(r.window_seconds) || r.window_seconds < 1 ||
      !Number.isSafeInteger(r.max_per_session) || r.max_per_session < 1) return no("issue_rate_limit_missing");
  return { available: true, rpId: e.rp_id };
}

/**
 * Deployment-level availability: owner opt-in, canonical origin and the bridge advertisement. Never throws.
 * @param {{ env?: Record<string, string | undefined>, bridgeConfig?: any, transport?: Function, now?: number }} [input]
 * @returns {Promise<{ available: true, rpId: string, origin: string } | { available: false, reason: string }>}
 */
export async function ceremonyAvailability({ env = {}, bridgeConfig, transport, now = Date.now() } = {}) {
  if (env.MISSION_CONTROL_APPROVAL_CEREMONY !== CEREMONY_OPT_IN) return { available: false, reason: "ceremony_not_enabled" };
  const canonical = readCanonicalOrigin(env.MISSION_CONTROL_CANONICAL_ORIGIN);
  if (!canonical.ok) return { available: false, reason: canonical.reason };
  const res = await bridgeGet(bridgeConfig, "/v0/capabilities", bridgeOpts(transport, now));
  if (!res.ok) return { available: false, reason: `bridge_${res.state}` };
  const cap = checkCeremonyCapability(res.data, { canonicalHost: new URL(canonical.origin).hostname });
  return cap.available ? { ...cap, origin: canonical.origin } : cap;
}

function bridgeOpts(transport, now) {
  return transport ? { transport, now: () => now } : { now: () => now };
}

// ---- request shape ----------------------------------------------------------------------------------------

/** Bounded JSON body read: exact bytes cap, plain object only. Returns { ok, value } or { ok: false, code }. */
export function parseJsonBody(text) {
  if (typeof text !== "string") return { ok: false, code: "invalid_body" };
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return { ok: false, code: "body_too_large" };
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_json" };
  }
  return isObj(v) ? { ok: true, value: v } : { ok: false, code: "invalid_body" };
}

const TUPLE_KEYS = ["approval_id", "row_version", "task_id", "requested_by", "artifact", "action", "destination", "max_cost_cents", "not_before", "expires_at"];
const ISSUE_KEYS = ["expected", "decision", "note"];

function claimSupplied(body) {
  const seen = (o, depth) => isObj(o) && depth < 3 && Object.entries(o).some(([k, v]) => CLIENT_CLAIM_KEYS.includes(k) || seen(v, depth + 1));
  return seen(body, 0);
}

/**
 * Exact issue request: { expected: <tuple the owner viewed>, decision, note }. No other key at any level.
 * @returns {{ ok: true, value: { expected: object, decision: string, note: string | null } } | { ok: false, code: string }}
 */
export function parseIssueRequest(body, approvalId) {
  if (!exactKeys(body, ISSUE_KEYS)) return { ok: false, code: "invalid_shape" };
  const { expected: x, decision, note } = body;
  if (!exactKeys(x, TUPLE_KEYS) || !exactKeys(x.artifact, ["id", "version", "sha256"])) return { ok: false, code: "invalid_expected_terms" };
  if (x.approval_id !== approvalId) return { ok: false, code: "approval_id_mismatch" };
  if (!Number.isSafeInteger(x.row_version) || x.row_version < 1) return { ok: false, code: "invalid_expected_terms" };
  if (typeof x.artifact.id !== "string" || !Number.isSafeInteger(x.artifact.version) || typeof x.artifact.sha256 !== "string" || !SHA_RE.test(x.artifact.sha256)) {
    return { ok: false, code: "invalid_expected_terms" };
  }
  for (const k of ["task_id", "requested_by", "action"]) if (typeof x[k] !== "string" || !x[k]) return { ok: false, code: "invalid_expected_terms" };
  if (x.destination !== null && typeof x.destination !== "string") return { ok: false, code: "invalid_expected_terms" };
  if (x.max_cost_cents !== null && !Number.isSafeInteger(x.max_cost_cents)) return { ok: false, code: "invalid_expected_terms" };
  for (const k of ["not_before", "expires_at"]) if (typeof x[k] !== "string" || !Number.isFinite(Date.parse(x[k]))) return { ok: false, code: "invalid_expected_terms" };
  if (!DECISIONS.includes(decision)) return { ok: false, code: "invalid_decision" };
  if (!noteOk(note)) return { ok: false, code: "invalid_note" };
  if (decision === "revise" && !(note && note.trim())) return { ok: false, code: "revision_note_required" };
  return { ok: true, value: { expected: x, decision, note } };
}

const ASSERTION_KEYS = ["credential_id", "client_data_json", "authenticator_data", "signature"];
const DECIDE_KEYS = ["approval_id", "challenge_id", "challenge_sha256", "payload_b64u", "note", "assertion"];
const b64uOk = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && B64U_RE.test(v);
// Canonical base64url only (the bridge verifier refuses non-canonical encodings).
const b64uBytes = (v, max) => {
  if (!b64uOk(v, max)) return null;
  const b = Buffer.from(v, "base64url");
  return b.toString("base64url") === v ? b : null;
};
const noteOk = (note) => note === null || (typeof note === "string" && note.length <= MAX_NOTE && !CTRL.test(note));
const noteSha256 = (note) => (note === null ? null : sha256Hex(Buffer.from(note, "utf8")));

/**
 * Exact decision request: the issued challenge reference, the issued payload bytes and note (the bridge stores only
 * the note digest), plus the owner's WebAuthn get() assertion, verbatim. The assertion is evidence for the bridge's
 * pinned-key verifier, not a credential the app trusts.
 */
export function parseDecideRequest(body, approvalId) {
  if (!exactKeys(body, DECIDE_KEYS)) return { ok: false, code: "invalid_shape" };
  if (body.approval_id !== approvalId) return { ok: false, code: "approval_id_mismatch" };
  if (typeof body.challenge_id !== "string" || !CHALLENGE_ID_RE.test(body.challenge_id)) return { ok: false, code: "invalid_challenge_id" };
  if (typeof body.challenge_sha256 !== "string" || !SHA_RE.test(body.challenge_sha256)) return { ok: false, code: "invalid_challenge_sha256" };
  if (!b64uBytes(body.payload_b64u, 8192)) return { ok: false, code: "invalid_payload" };
  if (!noteOk(body.note)) return { ok: false, code: "invalid_note" };
  const a = body.assertion;
  if (!exactKeys(a, ASSERTION_KEYS)) return { ok: false, code: "invalid_assertion_shape" };
  if (!b64uOk(a.credential_id, 1366) || !b64uBytes(a.client_data_json, 4096) || !b64uBytes(a.authenticator_data, 2048) || !b64uBytes(a.signature, 1024)) {
    return { ok: false, code: "invalid_assertion_shape" };
  }
  return { ok: true, value: body };
}

/** The tuple the owner viewed must equal the bridge's current record, field for field. */
export function tupleMatches(expected, approval) {
  return (
    approval.approval_id === expected.approval_id && approval.row_version === expected.row_version &&
    approval.task_id === expected.task_id && approval.requested_by === expected.requested_by &&
    approval.artifact.id === expected.artifact.id && approval.artifact.version === expected.artifact.version &&
    approval.artifact.sha256 === expected.artifact.sha256 && approval.action === expected.action &&
    approval.destination === expected.destination && approval.max_cost_cents === expected.max_cost_cents &&
    sameInstant(approval.not_before, expected.not_before) && sameInstant(approval.expires_at, expected.expires_at)
  );
}

/**
 * Strict parse of issued payload bytes: canonical base64url, sha256 === challengeSha256, the bridge's exact canonical
 * key order and JSON bytes, version/purpose, nonce and a short iat..exp window. Returns the parsed payload or null.
 */
export function parseIssuedPayload(payloadB64u, challengeSha256) {
  const bytes = b64uBytes(payloadB64u, 8192);
  if (!bytes || typeof challengeSha256 !== "string" || !SHA_RE.test(challengeSha256) || sha256Hex(bytes) !== challengeSha256) return null;
  let p;
  try {
    p = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!isObj(p)) return null;
  const keys = Object.keys(p);
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((k, i) => k !== PAYLOAD_KEYS[i])) return null;
  if (JSON.stringify(p) !== bytes.toString("utf8")) return null;
  const ok =
    p.v === PAYLOAD_VERSION && p.purpose === PAYLOAD_PURPOSE && typeof p.nonce === "string" && NONCE_RE.test(p.nonce) &&
    typeof p.human === "string" && p.human.length > 0 && typeof p.credential_id === "string" && p.credential_id.length > 0 &&
    typeof p.session_sha256 === "string" && SHA_RE.test(p.session_sha256) &&
    Number.isSafeInteger(p.iat) && Number.isSafeInteger(p.exp) && p.exp > p.iat && p.exp - p.iat <= MAX_CHALLENGE_TTL_S;
  return ok ? p : null;
}

/**
 * The issued bytes must parse strictly (parseIssuedPayload), be unexpired, and carry exactly the viewed tuple, the
 * decision, the note digest, this server-derived session binding and the canonical rp_id. Returns the payload or null.
 */
export function checkIssuedPayload(payloadB64u, challengeSha256, { expected, decision, note, sessionSha256, rpId, now = Date.now() }) {
  const p = parseIssuedPayload(payloadB64u, challengeSha256);
  if (!p) return null;
  const ok =
    p.rp_id === rpId && p.session_sha256 === sessionSha256 && p.decision === decision && p.note_sha256 === noteSha256(note) &&
    p.approval_id === expected.approval_id && p.row_version === expected.row_version && p.task_id === expected.task_id &&
    p.requested_by === expected.requested_by && p.artifact_id === expected.artifact.id &&
    p.artifact_version === expected.artifact.version && p.artifact_sha256 === expected.artifact.sha256 &&
    p.action === expected.action && p.destination === expected.destination && p.max_cost_cents === expected.max_cost_cents &&
    sameInstant(p.not_before, expected.not_before) && sameInstant(p.expires_at, expected.expires_at) &&
    p.exp * 1000 > now && Date.parse(p.expires_at) >= p.exp * 1000;
  return ok ? p : null;
}

/** WebAuthn clientDataJSON pre-check: a get() on the canonical origin over exactly sha256(payload). */
export function clientDataMatches(clientDataB64u, challengeSha256, origin) {
  const bytes = b64uBytes(clientDataB64u, 4096);
  if (!bytes) return false;
  let cd;
  try {
    cd = JSON.parse(bytes.toString("utf8"));
  } catch {
    return false;
  }
  return isObj(cd) && cd.type === "webauthn.get" && cd.challenge === Buffer.from(challengeSha256, "hex").toString("base64url") &&
    cd.origin === origin && cd.crossOrigin !== true;
}

// ---- bridge answers ---------------------------------------------------------------------------------------

const PASS_STATUS = [200, 400, 403, 404, 409, 429];

function bridgeRefusal(res) {
  if (!res.ok) return refuse(res.state === "not_configured" || res.state === "offline" || res.state === "hermes_unavailable" ? 503 : 502, `bridge_${res.state}`);
  const code = isObj(res.data) && typeof res.data.error === "string" && CODE_RE.test(res.data.error) ? res.data.error : `bridge_http_${res.status}`;
  if (res.status === 429) {
    const ra = isObj(res.data) && Number.isSafeInteger(res.data.retry_after) && res.data.retry_after > 0 ? Math.min(res.data.retry_after, MAX_RETRY_AFTER_S) : 60;
    return refuse(429, "issue_rate_limited", { retry_after: ra });
  }
  return refuse(res.status === 404 ? 404 : res.status === 400 ? 400 : res.status === 403 ? 403 : 409, code);
}

// ---- handlers (framework-neutral; the Next routes are thin wrappers) --------------------------------------

async function ownerCeremonyPreamble({ env, token, headers, body, bridgeConfig, transport, now }) {
  // Caller claims are refused before anything else, including before the availability probe.
  if (claimSupplied(body)) return { deny: refuse(400, "client_claim_refused") };
  const guard = await guardApprovalRequest({ env, token, headers, mode: "ceremony", requireFreshAuth: true, body, now });
  if (!guard.ok) return { deny: refuse(guard.status, guard.reason) };
  const avail = await ceremonyAvailability({ env, bridgeConfig, transport, now });
  if (!avail.available) return { deny: refuse(503, CEREMONY_UNAVAILABLE, { reason: avail.reason }) };
  return { session: guard.session, rpId: avail.rpId, origin: avail.origin };
}

/**
 * POST /api/control/approvals/:id/challenge. Re-reads the approval, requires the viewed tuple to be current, asks
 * the bridge to issue a single-use challenge bound to the cookie-derived session, then verifies the issued bytes.
 * Grants nothing. A fresh server-random idempotency key per request: re-issuing supersedes (one live challenge per
 * approval, bridge invariant), and the bridge's durable issue rate limit bounds it.
 * @param {{ env: Record<string, string | undefined>, token?: string, headers?: any, approvalId: string, bodyText: string,
 *   bridgeConfig: any, transport?: Function, now?: number }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleChallengeIssue({ env, token, headers, approvalId, bodyText, bridgeConfig, transport, now = Date.now() }) {
  if (typeof approvalId !== "string" || !APPROVAL_ID_RE.test(approvalId)) return refuse(400, "invalid_approval_id");
  const parsed = parseJsonBody(bodyText);
  if (!parsed.ok) return refuse(400, parsed.code);
  const pre = await ownerCeremonyPreamble({ env, token, headers, body: parsed.value, bridgeConfig, transport, now });
  if (pre.deny) return pre.deny;
  const req = parseIssueRequest(parsed.value, approvalId);
  if (!req.ok) return refuse(400, req.code);

  const opts = bridgeOpts(transport, now);
  const cur = await bridgeGet(bridgeConfig, `/v0/approvals/${approvalId}`, opts);
  if (!cur.ok) return bridgeRefusal(cur);
  const approval = isObj(cur.data) ? checkApproval(cur.data.approval) : null;
  if (!approval || approval.approval_id !== approvalId) return refuse(502, "schema_mismatch");
  if (approval.state !== "awaiting_approval" || !approval.artifact.is_latest) return refuse(409, "approval_not_pending");
  if (!tupleMatches(req.value.expected, approval)) return refuse(409, "terms_changed");

  const res = await bridgeRequest(bridgeConfig, "POST", issuePath(approvalId), {
    ...opts,
    acceptStatus: PASS_STATUS,
    idempotencyKey: `och-issue-${randomBytes(18).toString("base64url")}`,
    body: { session_sha256: pre.session.sessionSha256, expected: req.value.expected, decision: req.value.decision, note: req.value.note },
  });
  if (!res.ok || res.status !== 200) return bridgeRefusal(res);
  const c = isObj(res.data) ? res.data.challenge : null;
  if (!isObj(c) || typeof c.challenge_id !== "string" || !CHALLENGE_ID_RE.test(c.challenge_id) || c.approval_id !== approvalId ||
      c.row_version !== approval.row_version || c.owner_assurance !== false) return refuse(502, "schema_mismatch");
  const payload = checkIssuedPayload(c.payload_b64u, c.challenge_sha256, { ...req.value, sessionSha256: pre.session.sessionSha256, rpId: pre.rpId, now });
  if (!payload) return refuse(502, "challenge_payload_mismatch");
  return out(200, {
    ok: true,
    state: "challenge_issued",
    challenge: {
      challenge_id: c.challenge_id, challenge_sha256: c.challenge_sha256, payload_b64u: c.payload_b64u,
      // WebAuthn get(): challenge = sha256(payload) bytes, rpId pinned by the bridge.
      webauthn_challenge_b64u: Buffer.from(c.challenge_sha256, "hex").toString("base64url"),
      rp_id: pre.rpId, approval_id: approvalId, row_version: approval.row_version,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    },
    owner_assurance: false,
  });
}

/**
 * POST /api/control/approvals/:id/decision. Pre-checks that the issued payload is this approval's, bound to THIS
 * cookie session and rp_id, unexpired, matches the note and the asserting credential, and that clientDataJSON is a
 * get() on the canonical origin over sha256(payload); then forwards the verifier's raw assertion shape
 * ({ payload, credential_id, client_data_json, authenticator_data, signature }) to the bridge's challenge-only
 * decision path. decision/artifact_version/artifact_sha256 come from the sha256-checked issued payload, never from a
 * separate caller field. The bridge replays on the challenge's stored server idempotency key; its transport still
 * requires an Idempotency-Key header, so the app sends one derived only from the challenge id (identical on replay).
 * Only the bridge's WebAuthn verifier can make this an owner decision.
 * @param {{ env: Record<string, string | undefined>, token?: string, headers?: any, approvalId: string, bodyText: string,
 *   bridgeConfig: any, transport?: Function, now?: number }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleChallengeDecision({ env, token, headers, approvalId, bodyText, bridgeConfig, transport, now = Date.now() }) {
  if (typeof approvalId !== "string" || !APPROVAL_ID_RE.test(approvalId)) return refuse(400, "invalid_approval_id");
  const parsed = parseJsonBody(bodyText);
  if (!parsed.ok) return refuse(400, parsed.code);
  const pre = await ownerCeremonyPreamble({ env, token, headers, body: parsed.value, bridgeConfig, transport, now });
  if (pre.deny) return pre.deny;
  const req = parseDecideRequest(parsed.value, approvalId);
  if (!req.ok) return refuse(400, req.code);
  const { challenge_sha256: challengeSha256, payload_b64u: payloadB64u, note, assertion } = req.value;
  const p = parseIssuedPayload(payloadB64u, challengeSha256);
  if (!p || p.approval_id !== approvalId || p.rp_id !== pre.rpId) return refuse(400, "challenge_payload_mismatch");
  if (p.session_sha256 !== pre.session.sessionSha256) return refuse(403, "challenge_session_mismatch");
  if (p.note_sha256 !== noteSha256(note)) return refuse(400, "note_mismatch");
  if (p.credential_id !== assertion.credential_id) return refuse(400, "credential_mismatch");
  if (p.exp * 1000 <= now) return refuse(409, "challenge_expired");
  if (!clientDataMatches(assertion.client_data_json, challengeSha256, pre.origin)) return refuse(400, "client_data_mismatch");
  const res = await bridgeRequest(bridgeConfig, "POST", decidePath(approvalId, req.value.challenge_id), {
    ...bridgeOpts(transport, now),
    acceptStatus: PASS_STATUS,
    idempotencyKey: `och-decide-${req.value.challenge_id}`,
    body: {
      session_sha256: pre.session.sessionSha256, decision: p.decision, note, artifact_version: p.artifact_version,
      artifact_sha256: p.artifact_sha256, owner_assertion: { payload: payloadB64u, ...assertion },
    },
  });
  if (!res.ok || res.status !== 200) return bridgeRefusal(res);
  const approval = isObj(res.data) ? checkApproval(res.data.approval) : null;
  if (!approval || approval.approval_id !== approvalId || typeof res.data.deduplicated !== "boolean") return refuse(502, "schema_mismatch");
  return out(200, { ok: true, state: "decided", approval, replay: res.data.deduplicated });
}

/**
 * Logout plumbing: when (and only when) the ceremony is available, durably revoke the CURRENT verified session's
 * binding on the bridge before the cookie is cleared. Never throws and never blocks the cookie clear.
 * @param {{ env?: Record<string, string | undefined>, token?: string, bridgeConfig?: any, transport?: Function, now?: number }} [input]
 * @returns {Promise<"revoked" | "unsupported" | "no_session" | "failed">}
 */
export async function revokeSessionOnLogout({ env = {}, token, bridgeConfig, transport, now = Date.now() } = {}) {
  try {
    const config = readSessionConfig({ pin: env.MISSION_CONTROL_PIN, secret: env.MISSION_CONTROL_SESSION_SECRET });
    if (!config.ok) return "no_session";
    const v = await verifySessionBinding(config, token, { now });
    if (!v.ok) return "no_session";
    const avail = await ceremonyAvailability({ env, bridgeConfig, transport, now });
    if (!avail.available) return "unsupported";
    const res = await bridgeRequest(bridgeConfig, "POST", REVOKE_PATH, {
      ...bridgeOpts(transport, now),
      idempotencyKey: `mc-revoke-${v.sessionSha256}`,
      body: { session_sha256: v.sessionSha256, reason: "app_logout" },
    });
    return res.ok && isObj(res.data) && res.data.revoked === true ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}
