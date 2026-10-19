// WHOOP OAuth helpers shared by the Body OS routes and page. Pure and browser-safe (no node imports, no secrets).
// The private bridge owns the client config, pending flows and tokens; the app only relays fixed-shape values.

export const WHOOP_CALLBACK_PATH = "/api/fitness/whoop/callback";
export const WHOOP_REDIRECT_URI = "https://dream-house-lending-mission-control.vercel.app/api/fitness/whoop/callback";
export const WHOOP_AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_SCOPES = "read:cycles read:recovery read:sleep offline";
// Companion cookie for one authorization attempt: HttpOnly, Secure, SameSite=Lax (WHOOP's redirect back is a cross-site
// top-level GET), path limited to the callback, short-lived. The owner session cookie stays SameSite=Strict.
export const OAUTH_COOKIE = "mc_whoop_oauth";
export const OAUTH_COOKIE_TTL_S = 600;
/** @returns {{ httpOnly: true, secure: true, sameSite: "lax", path: string, maxAge: number }} */
export const oauthCookieOptions = (maxAge = OAUTH_COOKIE_TTL_S) => ({ httpOnly: true, secure: true, sameSite: /** @type {"lax"} */ ("lax"), path: WHOOP_CALLBACK_PATH, maxAge });
export const NONCE_RE = /^[A-Za-z0-9_-]{43}$/;
export const MAX_CLIENT_REQUEST_BYTES = 1024;

const STATE_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_RE = /^[\x21-\x7e]{1,2048}$/;
const ERROR_RE = /^[a-z_]{1,64}$/;
const CLIENT_ID_RE = /^[A-Za-z0-9._~-]{8,200}$/;
const CLIENT_SECRET_RE = /^[\x21-\x7e]{8,512}$/;
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Exactly { client_id, client_secret } with bounded printable values. Returns null or an error code (never the value). */
export function validateClientInput(v) {
  if (!isObj(v) || Object.keys(v).length !== 2 || !Object.hasOwn(v, "client_id") || !Object.hasOwn(v, "client_secret")) return "invalid_fields";
  if (typeof v.client_id !== "string" || !CLIENT_ID_RE.test(v.client_id)) return "invalid_client_id";
  if (typeof v.client_secret !== "string" || !CLIENT_SECRET_RE.test(v.client_secret)) return "invalid_client_secret";
  return null;
}

/**
 * Strict callback query: success = state + code (+ optional scope echo); error = error (+ optional state,
 * error_description, error_hint). Every key at most once, nothing else. Returns null when malformed.
 * @param {URLSearchParams} sp
 * @returns {{ kind: "code", state: string, code: string } | { kind: "error", state: string | null, error: string } | null}
 */
export function parseCallbackQuery(sp) {
  const keys = Array.from(sp.keys());
  if (keys.length === 0 || keys.length > 4 || new Set(keys).size !== keys.length) return null;
  const has = (k) => keys.includes(k);
  const val = (k) => /** @type {string} */ (sp.get(k));
  if (has("code")) {
    if (keys.some((k) => !["code", "state", "scope"].includes(k)) || !has("state")) return null;
    if (!CODE_RE.test(val("code")) || !STATE_RE.test(val("state")) || (has("scope") && val("scope").length > 300)) return null;
    return { kind: "code", state: val("state"), code: val("code") };
  }
  if (has("error")) {
    if (keys.some((k) => !["error", "state", "error_description", "error_hint"].includes(k))) return null;
    if (!ERROR_RE.test(val("error")) || (has("state") && !STATE_RE.test(val("state")))) return null;
    if ((has("error_description") && val("error_description").length > 1000) || (has("error_hint") && val("error_hint").length > 1000)) return null;
    return { kind: "error", state: has("state") ? val("state") : null, error: val("error") };
  }
  return null;
}

/** The bridge-built authorize URL must be exactly WHOOP's endpoint with the fixed redirect, scopes and our 5 params. */
export function checkAuthorizationUrl(u) {
  if (typeof u !== "string" || u.length > 2048) return false;
  let url;
  try { url = new URL(u); } catch { return false; }
  if (`${url.origin}${url.pathname}` !== WHOOP_AUTHORIZE_URL || url.hash || url.username || url.password) return false;
  const keys = Array.from(url.searchParams.keys());
  return keys.join(",") === "response_type,client_id,redirect_uri,scope,state"
    && url.searchParams.get("response_type") === "code" && CLIENT_ID_RE.test(url.searchParams.get("client_id") ?? "")
    && url.searchParams.get("redirect_uri") === WHOOP_REDIRECT_URI && url.searchParams.get("scope") === WHOOP_SCOPES
    && STATE_RE.test(url.searchParams.get("state") ?? "");
}

// Allowlisted result codes for the fixed /body-os?whoop=<code> redirect. Nothing from the query is reflected.
export const CALLBACK_RESULTS = {
  authorized: "WHOOP authorized. Tokens were stored privately on the Mac; the panel below shows whether a read succeeds.",
  denied: "WHOOP authorization was declined. Nothing changed.",
  expired: "That authorization attempt expired. Nothing changed — start again with Connect WHOOP.",
  superseded: "A newer authorization attempt replaced that one. Nothing changed — use the latest attempt.",
  replayed: "That authorization link was already used. Nothing changed.",
  invalid: "The WHOOP callback could not be matched to an attempt from this browser. Nothing changed — start again with Connect WHOOP.",
  failed: "WHOOP did not grant access. Nothing changed — start again with Connect WHOOP.",
  reauthorize: "The WHOOP authorization outcome is unknown, so it was not retried. Connect WHOOP again.",
  needs_setup: "The WHOOP app is not configured yet. Enter the Client ID and Secret first.",
  provider_error: "WHOOP reported an error. Nothing changed — try Connect WHOOP again later.",
  // A post-send bridge timeout/5xx may still have exchanged and stored tokens, so this outcome is unconfirmed, never "no effect".
  unavailable: "The private bridge did not confirm the result, so WHOOP may or may not have been authorized. Check the WHOOP status below before starting a new attempt.",
};
const OUTCOME_TO_RESULT = { authorized: "authorized", denied: "denied", expired: "expired", superseded: "superseded", replayed: "replayed",
  invalid_state: "invalid", authorization_failed: "failed", needs_reauthorization: "reauthorize", needs_setup: "needs_setup", provider_error: "provider_error" };
export const callbackResult = (outcome) => OUTCOME_TO_RESULT[outcome] ?? "unavailable";
export const isCallbackResult = (v) => typeof v === "string" && Object.hasOwn(CALLBACK_RESULTS, v);

const TOKEN_STATES = new Set(["none", "stored", "blocked", "invalid"]);
const ATTEMPT_STATES = new Set(["pending", "superseded", "expired", "denied", "provider_error", "exchanging", "authorized",
  "authorization_failed", "needs_reauthorization", "needs_setup"]);
/** Setup status reader: booleans and fixed codes only. */
export function checkOAuthStatus(d) {
  if (!isObj(d) || typeof d.configured !== "boolean" || !TOKEN_STATES.has(d.token)) return null;
  const a = d.last_attempt;
  const last = isObj(a) && ATTEMPT_STATES.has(a.status) && typeof a.at === "string" && a.at.length <= 40 ? { status: a.status, at: a.at } : null;
  if (a !== null && last === null) return null;
  return { configured: d.configured, token: d.token, last_attempt: last, redirect_uri: WHOOP_REDIRECT_URI, scopes: WHOOP_SCOPES };
}
