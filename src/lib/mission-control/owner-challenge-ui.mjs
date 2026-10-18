// Browser-safe logic for the owner-challenge panel (issue -> navigator.credentials.get -> challenge decision).
// No node:* imports and no secrets: it runs in the client component and in node --test. It never decides anything
// itself. The server adapter (approval-ceremony.mjs) and ultimately the bridge's pinned-key WebAuthn verifier do.
//
// DISABLED BY DEFAULT. The panel offers a gesture only when ALL of these hold (panelGate + approvalEligibility):
//   - the server says the ceremony is available: owner opt-in plus the bridge's exact reviewed challenge-only
//     advertisement (ceremonyAvailability), with the canonical origin and rp_id it derived;
//   - this page's origin is exactly that canonical origin and its hostname is exactly the advertised rp_id;
//   - the browser exposes WebAuthn get() in a secure context;
//   - the approval is still awaiting approval on the latest artifact version and inside its window.
// The browser never supplies session, human, principal, credential or rp_id claims: the request bodies built here
// have exactly the server adapter's keys, and identity comes only from the signed cookie.
// An approval is permission only. Nothing here (or anywhere in this app) executes, sends or publishes.

export const DECISIONS = ["approve", "reject", "revise"];
export const MAX_NOTE = 2000;
export const PAYLOAD_VERSION = "mcoa1";
export const PAYLOAD_PURPOSE = "mc-bridge:approval-decision";
export const MAX_GET_TIMEOUT_MS = 300_000;
const CHALLENGE_ID_RE = /^och_[A-Za-z0-9_-]{32}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const B64U_RE = /^[A-Za-z0-9_-]*$/;
const CODE_RE = /^[a-z0-9_]{1,64}$/;
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const sameInstant = (a, b) => typeof a === "string" && typeof b === "string" && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

// ---- base64url (canonical, unpadded) ----------------------------------------------------------------------

const toBytes = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null);

/** Canonical unpadded base64url of an ArrayBuffer / typed array. Returns null for anything else. */
export function b64uEncode(value) {
  const bytes = toBytes(value);
  if (!bytes) return null;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict decode: base64url alphabet, no padding, canonical (re-encodes to the same text). Null otherwise. */
export function b64uDecode(text) {
  if (typeof text !== "string" || !B64U_RE.test(text) || text.length % 4 === 1) return null;
  let bin;
  try {
    bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return b64uEncode(bytes) === text ? bytes : null;
}

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}

// ---- gating -----------------------------------------------------------------------------------------------

/** Owner-facing copy for every reason the panel stays disabled. Unknown reasons fall back to a generic line. */
export const GATE_COPY = {
  ceremony_not_enabled: "Owner challenge approval is not enabled for this deployment.",
  origin_not_configured: "No canonical Mission Control address is configured, so passkey approval stays off.",
  origin_invalid: "The configured canonical address is not a plain https origin, so passkey approval stays off.",
  ceremony_not_advertised: "The Mac bridge does not offer the reviewed owner-challenge flow.",
  legacy_decision_still_advertised: "The Mac bridge still offers the older decision path, so the owner-challenge flow stays off.",
  owner_rp_id_mismatch: "The bridge's enrolled passkey is for a different site than this deployment.",
  canonical_origin_mismatch: "This page is not open on the canonical Mission Control address.",
  rp_id_mismatch: "This page's host does not match the enrolled passkey's site.",
  webauthn_unsupported: "This browser cannot use a passkey or security key here (WebAuthn unavailable or not a secure context).",
  unauthenticated: "Sign in to use owner approval.",
  invalid_approval_id: "This is not a valid approval id.",
};
const gateCopy = (reason) => GATE_COPY[reason] ?? (String(reason).startsWith("bridge_") ? "The Mac bridge could not be reached to confirm the owner-challenge flow." : "Owner challenge approval is unavailable.");

/** What the browser offers. Pure: callers pass window-derived facts (see readBrowserSupport in the component). */
export function webauthnSupported({ secureContext, publicKeyCredential, credentialsGet } = {}) {
  return secureContext === true && publicKeyCredential === true && credentialsGet === true;
}

/**
 * The panel's gate. server is the server-computed ceremony availability; location is this page's origin/hostname.
 * @returns {{ enabled: true, rpId: string, origin: string } | { enabled: false, reason: string, message: string }}
 */
export function panelGate({ server, location, browser } = {}) {
  const no = (reason) => ({ enabled: false, reason, message: gateCopy(reason) });
  if (!isObj(server) || server.available !== true) return no(isObj(server) && typeof server.reason === "string" ? server.reason : "ceremony_not_enabled");
  if (typeof server.rpId !== "string" || !server.rpId || typeof server.origin !== "string" || !server.origin) return no("ceremony_not_advertised");
  let host;
  try {
    const u = new URL(server.origin);
    if (u.protocol !== "https:" || u.origin !== server.origin) return no("origin_invalid");
    host = u.hostname;
  } catch {
    return no("origin_invalid");
  }
  if (host !== server.rpId) return no("owner_rp_id_mismatch");
  if (!isObj(location) || location.origin !== server.origin) return no("canonical_origin_mismatch");
  if (location.hostname !== server.rpId) return no("rp_id_mismatch");
  if (!webauthnSupported(browser)) return no("webauthn_unsupported");
  return { enabled: true, rpId: server.rpId, origin: server.origin };
}

const STATE_COPY = {
  expired: "This approval request expired.",
  stale: "A newer artifact version replaced the one this approval was for.",
  invalidated: "This approval was invalidated.",
  rejected: "This approval was already rejected.",
  revision_requested: "A revision was already requested.",
  authorization_expired: "The earlier authorization expired.",
  authorized_not_executed: "Already approved: authorized, not executed.",
};

/**
 * Is this read-model approval still decidable right now? Never consults decision/legacy fields.
 * @returns {{ eligible: true } | { eligible: false, reason: string, message: string }}
 */
export function approvalEligibility(approval, now = Date.now()) {
  const no = (reason, message) => ({ eligible: false, reason, message });
  if (!isObj(approval) || !isObj(approval.artifact)) return no("approval_unreadable", "The approval could not be read.");
  if (approval.state !== "awaiting_approval") return no("approval_not_pending", STATE_COPY[approval.state] ?? "This approval is no longer awaiting a decision.");
  if (approval.artifact.is_latest !== true) return no("artifact_not_latest", STATE_COPY.stale);
  if (approval.executed !== false) return no("approval_not_pending", "This approval is no longer awaiting a decision.");
  const exp = Date.parse(approval.expires_at);
  if (!Number.isFinite(exp) || exp <= now) return no("approval_expired", STATE_COPY.expired);
  if (approval.not_before !== null && !(Date.parse(approval.not_before) <= now)) return no("approval_not_yet_open", "This approval's decision window has not opened yet.");
  return { eligible: true };
}

// ---- request bodies (exact server adapter keys; no identity claims) ---------------------------------------

/** The exact tuple the owner is viewing, in the adapter's key set. */
export function expectedTuple(a) {
  return {
    approval_id: a.approval_id, row_version: a.row_version, task_id: a.task_id, requested_by: a.requested_by,
    artifact: { id: a.artifact.id, version: a.artifact.version, sha256: a.artifact.sha256 },
    action: a.action, destination: a.destination, max_cost_cents: a.max_cost_cents, not_before: a.not_before, expires_at: a.expires_at,
  };
}

/**
 * Normalizes the owner's note: blank -> null.
 * @returns {{ ok: true, note: string | null } | { ok: false, code: string }}
 */
export function normalizeNote(decision, raw) {
  if (!DECISIONS.includes(decision)) return { ok: false, code: "invalid_decision" };
  const note = typeof raw === "string" && raw.trim() ? raw : null;
  if (note !== null && (note.length > MAX_NOTE || CTRL.test(note))) return { ok: false, code: "invalid_note" };
  if (decision === "revise" && note === null) return { ok: false, code: "revision_note_required" };
  return { ok: true, note };
}

/** JSON body for POST /api/control/approvals/:id/challenge: exactly { expected, decision, note }. */
export function buildIssueBody(approval, decision, note) {
  return JSON.stringify({ expected: expectedTuple(approval), decision, note });
}

/** JSON body for POST /api/control/approvals/:id/decision: exactly the adapter's DECIDE_KEYS. */
export function buildDecideBody(challenge, note, assertion) {
  return JSON.stringify({
    approval_id: challenge.approval_id, challenge_id: challenge.challenge_id, challenge_sha256: challenge.challenge_sha256,
    payload_b64u: challenge.payload_b64u, note, assertion,
  });
}

// ---- issued challenge: re-checked in the browser so what is shown is exactly what is signed ----------------

/**
 * Verifies the server's issued challenge against the approval the owner viewed and the chosen decision/note, then
 * returns the exact signed terms decoded from the issued payload bytes. Async (WebCrypto sha256).
 * @returns {Promise<{ ok: true, challenge: any, terms: any } | { ok: false, code: string }>}
 */
export async function verifyIssuedChallenge(challenge, { approval, decision, note, rpId, now = Date.now() }) {
  const no = (code) => ({ ok: false, code });
  const c = challenge;
  if (!isObj(c) || typeof c.challenge_id !== "string" || !CHALLENGE_ID_RE.test(c.challenge_id)) return no("challenge_malformed");
  if (c.approval_id !== approval.approval_id || c.row_version !== approval.row_version || c.rp_id !== rpId) return no("challenge_mismatch");
  if (typeof c.challenge_sha256 !== "string" || !SHA_RE.test(c.challenge_sha256)) return no("challenge_malformed");
  if (c.webauthn_challenge_b64u !== b64uEncode(hexToBytes(c.challenge_sha256))) return no("challenge_mismatch");
  const bytes = b64uDecode(c.payload_b64u);
  if (!bytes || bytes.length === 0 || bytes.length > 8192) return no("challenge_malformed");
  if ((await sha256Hex(bytes)) !== c.challenge_sha256) return no("challenge_mismatch");
  let p;
  try {
    p = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return no("challenge_malformed");
  }
  if (!isObj(p) || p.v !== PAYLOAD_VERSION || p.purpose !== PAYLOAD_PURPOSE) return no("challenge_malformed");
  const noteSha = note === null ? null : await sha256Hex(new TextEncoder().encode(note));
  const x = expectedTuple(approval);
  const matches =
    p.rp_id === rpId && p.approval_id === x.approval_id && p.row_version === x.row_version && p.task_id === x.task_id &&
    p.requested_by === x.requested_by && p.artifact_id === x.artifact.id && p.artifact_version === x.artifact.version &&
    p.artifact_sha256 === x.artifact.sha256 && p.action === x.action && p.destination === x.destination &&
    p.max_cost_cents === x.max_cost_cents && sameInstant(p.not_before, x.not_before) && sameInstant(p.expires_at, x.expires_at) &&
    p.decision === decision && p.note_sha256 === noteSha;
  if (!matches) return no("challenge_terms_mismatch");
  const cred = b64uDecode(p.credential_id);
  if (!cred || cred.length < 16) return no("credential_id_unusable");
  if (!Number.isSafeInteger(p.exp) || p.exp * 1000 <= now) return no("challenge_expired");
  return {
    ok: true,
    challenge: { approval_id: c.approval_id, challenge_id: c.challenge_id, challenge_sha256: c.challenge_sha256, payload_b64u: c.payload_b64u, rp_id: c.rp_id },
    terms: {
      decision: p.decision, approval_id: p.approval_id, row_version: p.row_version, task_id: p.task_id, requested_by: p.requested_by,
      artifact: { id: p.artifact_id, version: p.artifact_version, sha256: p.artifact_sha256 },
      action: p.action, destination: p.destination, max_cost_cents: p.max_cost_cents, not_before: p.not_before, expires_at: p.expires_at,
      note_sha256: p.note_sha256, human: p.human, credential_id: p.credential_id, rp_id: p.rp_id, challenge_expires_at: new Date(p.exp * 1000).toISOString(),
    },
  };
}

/** navigator.credentials.get() options for a verified challenge: pinned credential, rpId, UV required, bounded timeout. */
export function requestOptions(verified, now = Date.now()) {
  const remaining = Date.parse(verified.terms.challenge_expires_at) - now;
  return {
    challenge: hexToBytes(verified.challenge.challenge_sha256),
    rpId: verified.challenge.rp_id,
    allowCredentials: [{ type: "public-key", id: b64uDecode(verified.terms.credential_id) }],
    userVerification: "required",
    timeout: Math.max(1000, Math.min(MAX_GET_TIMEOUT_MS, Math.floor(remaining))),
  };
}

/**
 * Serializes a get() PublicKeyCredential to the adapter's assertion shape (canonical base64url) and checks it is the
 * pinned credential the payload names. Never inspects or trusts anything else on the credential object.
 * @returns {{ ok: true, assertion: { credential_id: string, client_data_json: string, authenticator_data: string, signature: string } } | { ok: false, code: string }}
 */
export function serializeAssertion(credential, expectedCredentialId) {
  const no = (code) => ({ ok: false, code });
  if (!credential || credential.type !== "public-key") return no("assertion_unusable");
  const r = credential.response;
  if (!r) return no("assertion_unusable");
  const assertion = {
    credential_id: b64uEncode(credential.rawId),
    client_data_json: b64uEncode(r.clientDataJSON),
    authenticator_data: b64uEncode(r.authenticatorData),
    signature: b64uEncode(r.signature),
  };
  if (Object.values(assertion).some((v) => !v)) return no("assertion_unusable");
  if (assertion.credential_id !== expectedCredentialId) return no("credential_mismatch");
  return { ok: true, assertion };
}

// ---- outcomes ---------------------------------------------------------------------------------------------

/** Maps a get() rejection to a bounded outcome. NotAllowedError covers both owner cancel and timeout (by design). */
export function classifyWebAuthnError(err) {
  const name = isObj(err) || err instanceof Error ? err.name : "";
  if (name === "AbortError") return { outcome: "cancelled", message: "Passkey request cancelled. Nothing was signed or sent." };
  if (name === "NotAllowedError") return { outcome: "cancelled", message: "The passkey prompt was dismissed or timed out. Nothing was signed or sent." };
  if (name === "SecurityError") return { outcome: "blocked", message: "The browser refused this site for the enrolled passkey. Nothing was signed or sent." };
  if (name === "InvalidStateError" || name === "NotSupportedError") return { outcome: "unsupported", message: "This authenticator cannot complete the request. Nothing was signed or sent." };
  return { outcome: "error", message: "The passkey request failed. Nothing was signed or sent." };
}

const codeOf = (data) => (isObj(data) && typeof data.code === "string" && CODE_RE.test(data.code) ? data.code : null);

const REFUSAL_COPY = {
  reauth_required: "Sign in again (owner approval needs a sign-in within the last 15 minutes), then retry.",
  terms_changed: "The approval changed since it was shown. Reload it and review the new terms.",
  approval_not_pending: "This approval is no longer awaiting a decision. Reload it.",
  ceremony_unavailable: "Owner challenge approval is unavailable right now.",
  session_revoked: "This session was signed out. Sign in again.",
  challenge_expired: "The challenge expired. Request a new one.",
  challenge_session_mismatch: "The challenge belongs to a different session. Request a new one.",
  issue_rate_limited: "Too many challenge requests. Wait, then retry.",
  origin_mismatch: "Request blocked: open Mission Control from its canonical address.",
};

/** Classifies a challenge-issue answer. Only HTTP 200 with state challenge_issued is an issued challenge. */
export function classifyIssueResponse({ status, data, network = false }) {
  if (network) return { outcome: "error", code: "network", message: "The challenge request did not complete. Nothing was signed; it is safe to retry." };
  if (status === 200 && isObj(data) && data.ok === true && data.state === "challenge_issued" && isObj(data.challenge) && data.owner_assurance === false) {
    return { outcome: "issued", challenge: data.challenge };
  }
  const code = codeOf(data) ?? `http_${Number.isSafeInteger(status) ? status : 0}`;
  const outcome = status === 401 ? "reauth" : status === 429 ? "rate_limited" : status === 409 ? "stale" : status === 503 ? "unavailable" : "refused";
  const retryAfter = status === 429 && isObj(data) && Number.isSafeInteger(data.retry_after) ? data.retry_after : undefined;
  return { outcome, code, retryAfter, message: REFUSAL_COPY[code] ?? "The challenge was refused. Nothing was signed." };
}

/** The only decide 503s known to be refused before the signed decision is sent to the bridge. */
const PRE_SEND_503 = ["ceremony_unavailable", "bridge_not_configured"];

/**
 * Classifies a decision answer. A network failure, malformed 200 or any 5xx other than a known pre-send 503 (a
 * post-send timeout, reset or bridge 503/504 may have applied) is UNCONFIRMED: the same body may be resent (the
 * bridge deduplicates on the challenge), never a fresh challenge silently.
 */
export function classifyDecideResponse({ status, data, network = false }) {
  if (network) return { outcome: "unconfirmed", code: "network", message: "The decision may or may not have reached the bridge. Retry the same signed decision; it cannot apply twice." };
  if (status === 200 && isObj(data) && data.ok === true && data.state === "decided" && isObj(data.approval) && typeof data.replay === "boolean") {
    return { outcome: "decided", approval: data.approval, replay: data.replay };
  }
  if (status === 200 || (status >= 500 && !(status === 503 && PRE_SEND_503.includes(codeOf(data))))) {
    return { outcome: "unconfirmed", code: codeOf(data) ?? `http_${status}`, message: "The decision answer could not be confirmed. Retry the same signed decision; it cannot apply twice." };
  }
  const code = codeOf(data) ?? `http_${Number.isSafeInteger(status) ? status : 0}`;
  const outcome = status === 401 ? "reauth" : status === 409 ? "stale" : status === 503 ? "unavailable" : "refused";
  return { outcome, code, message: REFUSAL_COPY[code] ?? "The bridge refused this decision. Nothing was approved." };
}

/**
 * Owner-facing result for a recorded decision. Approval is authorization only: the copy never says executed, sent
 * or published, and always states that external execution is not connected.
 */
export function decisionResultCopy(approval) {
  const tail = "External execution is not connected: nothing has been sent, published or run.";
  if (!isObj(approval)) return { tone: "warn", title: "Decision recorded, state unreadable", detail: tail };
  if (approval.state === "authorized_not_executed") return { tone: "ok", title: "Approved: authorized, not executed", detail: tail };
  if (approval.state === "rejected") return { tone: "neutral", title: "Rejected", detail: tail };
  if (approval.state === "revision_requested") return { tone: "neutral", title: "Revision requested", detail: tail };
  return { tone: "warn", title: "Decision recorded", detail: `Bridge state: ${String(approval.state).slice(0, 40)}. ${tail}` };
}

