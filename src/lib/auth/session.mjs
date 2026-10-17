// Pure owner-session primitives shared by the Edge middleware and Node route handlers / server components.
// WebCrypto + TextEncoder/atob/btoa only (no node:* imports, no Buffer, no process), so one verifier runs in both
// runtimes. Nothing here logs, and no return value ever contains the PIN, the signing secret or a client address.
//
// Token: "mcs1.<base64url(JSON claims)>.<base64url(HMAC-SHA256)>", claims = { v, sub, iat, exp, nonce }.
// The HMAC key is derived from MISSION_CONTROL_SESSION_SECRET *and* the PIN, so rotating either revokes every
// outstanding session. Legacy cookies that carried the raw PIN never parse as a token and are always rejected.

export const SESSION_COOKIE = "mission_control_auth";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_SECRET_BYTES = 32;
export const UNKNOWN_CLIENT = "unknown";

const TOKEN_PREFIX = "mcs1";
const SUBJECT = "owner";
const MAX_TOKEN_LENGTH = 512;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_SKEW_SECONDS = 60;
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;
const IP_RE = /^[0-9A-Fa-f:.]{2,45}$/;

const enc = new TextEncoder();
const dec = new TextDecoder();

function webCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle || typeof c.getRandomValues !== "function") throw new Error("webcrypto_unavailable");
  return c;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict decoder: rejects non-canonical encodings so a token has exactly one valid spelling. */
function fromB64url(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  let bin;
  try {
    bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return b64url(out) === s ? out : null;
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function hmacKey(raw) {
  return webCrypto().subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function hmac(raw, message) {
  return new Uint8Array(await webCrypto().subtle.sign("HMAC", await hmacKey(raw), enc.encode(message)));
}

async function sessionKey(config) {
  return hmacKey(await hmac(enc.encode(config.secret), `mc-session-key-v1\n${config.pin}`));
}

export function isProductionEnv(env = {}) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

/**
 * Validate sign-in configuration without echoing values. Fails closed: a missing PIN or a missing/short signing
 * secret yields { ok: false, reason } and nothing can be issued or verified.
 */
export function readSessionConfig({ pin, secret } = {}) {
  if (typeof pin !== "string" || !pin.trim()) return { ok: false, reason: "pin_missing" };
  if (typeof secret !== "string" || !secret) return { ok: false, reason: "secret_missing" };
  if (enc.encode(secret).length < MIN_SECRET_BYTES) return { ok: false, reason: "secret_too_short" };
  return { ok: true, pin, secret };
}

/**
 * Cookie attributes for the session cookie (HttpOnly, SameSite=Strict, Secure in production).
 * @param {{ production: boolean, maxAge?: number }} input
 * @returns {{ httpOnly: true, sameSite: "strict", secure: boolean, path: string, maxAge: number }}
 */
export function cookieOptions({ production, maxAge = SESSION_TTL_SECONDS }) {
  return { httpOnly: true, sameSite: "strict", secure: Boolean(production), path: "/", maxAge };
}

export async function createSessionToken(config, { now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS } = {}) {
  if (!config || config.ok !== true) throw new Error("session_not_configured");
  const iat = Math.floor(now / 1000);
  const ttl = Math.min(Math.max(Math.floor(Number(ttlSeconds) || SESSION_TTL_SECONDS), 60), MAX_TTL_SECONDS);
  const nonce = b64url(webCrypto().getRandomValues(new Uint8Array(24)));
  const body = b64url(enc.encode(JSON.stringify({ v: 1, sub: SUBJECT, iat, exp: iat + ttl, nonce })));
  const signed = `${TOKEN_PREFIX}.${body}`;
  const key = await sessionKey(config);
  const sig = new Uint8Array(await webCrypto().subtle.sign("HMAC", key, enc.encode(signed)));
  return `${signed}.${b64url(sig)}`;
}

function validClaims(c) {
  return (
    Boolean(c) && typeof c === "object" && !Array.isArray(c) &&
    Object.keys(c).length === 5 &&
    c.v === 1 && c.sub === SUBJECT &&
    Number.isSafeInteger(c.iat) && Number.isSafeInteger(c.exp) &&
    c.exp > c.iat && c.exp - c.iat <= MAX_TTL_SECONDS &&
    typeof c.nonce === "string" && NONCE_RE.test(c.nonce)
  );
}

const reject = (reason) => ({ ok: false, reason });

/**
 * Verify a session cookie value. Always async and always resolves to an object, never a bare boolean, so callers
 * must `await` and read `.ok` (a forgotten await yields a Promise whose `.ok` is undefined, i.e. denied).
 * @returns {Promise<{ ok: true, claims: { sub: string, iat: number, exp: number } } | { ok: false, reason: string }>}
 */
export async function verifySessionToken(config, token, { now = Date.now() } = {}) {
  if (!config || config.ok !== true) return reject("not_configured");
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return reject("missing");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return reject("malformed");
  const payload = fromB64url(parts[1]);
  const sig = fromB64url(parts[2]);
  if (!payload || !sig || sig.length !== 32) return reject("malformed");
  const key = await sessionKey(config);
  const valid = await webCrypto().subtle.verify("HMAC", key, sig, enc.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return reject("bad_signature");
  let claims;
  try {
    claims = JSON.parse(dec.decode(payload));
  } catch {
    return reject("malformed");
  }
  if (!validClaims(claims)) return reject("malformed");
  const t = Math.floor(now / 1000);
  if (claims.iat > t + MAX_SKEW_SECONDS) return reject("not_yet_valid");
  if (claims.exp <= t) return reject("expired");
  return { ok: true, claims: { sub: claims.sub, iat: claims.iat, exp: claims.exp } };
}

/** Constant-time PIN comparison: both sides are hashed to fixed-length digests before an XOR fold. */
export async function pinMatches(input, configured) {
  if (typeof input !== "string" || typeof configured !== "string" || !configured) return false;
  const [a, b] = await Promise.all(
    [input, configured].map(async (s) => new Uint8Array(await webCrypto().subtle.digest("SHA-256", enc.encode(s))))
  );
  let diff = input.length === 0 ? 1 : 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Client identifier for login throttling. Only Vercel-injected metadata is trusted (and only when the caller says
 * the request came through Vercel); otherwise every caller shares one "unknown" bucket rather than trusting
 * arbitrary client-supplied forwarding headers.
 * @param {{ get(name: string): string | null }} headers
 */
export function clientIdentifier(headers, { trustVercel = false } = {}) {
  if (!trustVercel || !headers || typeof headers.get !== "function") return UNKNOWN_CLIENT;
  for (const name of ["x-vercel-forwarded-for", "x-real-ip"]) {
    const first = String(headers.get(name) ?? "").split(",")[0].trim();
    if (IP_RE.test(first) && /[.:]/.test(first)) return `ip:${first.toLowerCase()}`;
  }
  return UNKNOWN_CLIENT;
}

/** 64-hex keyed hash of a client identifier; the raw address never leaves this process. */
export async function hashClientKey(config, clientId) {
  if (!config || config.ok !== true) throw new Error("session_not_configured");
  return toHex(await hmac(enc.encode(config.secret), `mc-login-attempt-v1\n${String(clientId)}`));
}
