// Body OS server-side signed bridge calls (route handlers only). Pure helpers live in fitness-model.mjs.
import { bridgeGet, bridgeRequest } from "./bridge-client.mjs";
import { IDEM_RE, checkLogs, checkPlan, checkWhoop, validateSetInput } from "./fitness-model.mjs";

import { checkAuthorizationUrl, checkOAuthStatus, validateClientInput } from "./whoop-oauth-model.mjs";

export * from "./fitness-model.mjs";

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const ENTRY = (e) => checkLogs({ sets: [e], total: 1 }) !== null;

// ---- signed bridge calls (server-only callers) ----
async function readChecked(config, target, check) {
  const res = await bridgeGet(config, target);
  if (!res.ok) return res;
  const v = check(res.data);
  return v ? { ok: true, ...v } : { ok: false, state: "bad_payload", code: "schema_mismatch" };
}
export const fetchPlan = (config) => readChecked(config, "/v0/fitness/plan", checkPlan);
export const fetchWhoop = (config) => readChecked(config, "/v0/fitness/whoop", checkWhoop);
/**
 * @param {unknown} config
 * @param {{ date?: string | null, session?: string | null }} [filter]
 */
export function fetchLogs(config, filter = {}) {
  const date = filter.date ?? null;
  const session = filter.session ?? null;
  const q = new URLSearchParams();
  if (date !== null) q.set("date", date);
  if (session !== null) q.set("session", session);
  const s = q.toString();
  return readChecked(config, `/v0/fitness/logs${s ? `?${s}` : ""}`, checkLogs);
}
// ---- WHOOP OAuth (signed bridge; the bridge holds client config, pending flows and tokens) ----
const codeOf = (d) => (isObj(d) && typeof d.error === "string" && /^[a-z_]{1,40}$/.test(d.error) ? d.error : "bad_payload");
export const fetchWhoopOAuthStatus = (config) => readChecked(config, "/v0/fitness/whoop/oauth", checkOAuthStatus);
/** First-time client config. Returns { outcome: "configured"|"unchanged"|"conflict"|"rejected"|"unavailable", code? }; never echoes values. */
export async function postWhoopClient(config, input, options = {}) {
  if (validateClientInput(input) !== null) return { outcome: "rejected", code: "invalid_input" };
  const res = await bridgeRequest(config, "POST", "/v0/fitness/whoop/oauth/client", { ...options, body: { client_id: input.client_id, client_secret: input.client_secret }, acceptStatus: [200, 201, 400, 409] });
  if (!res.ok) return { outcome: "unavailable", code: res.code };
  const d = res.data;
  if (res.status === 201 && isObj(d) && d.outcome === "configured") return { outcome: "configured" };
  if (res.status === 200 && isObj(d) && d.outcome === "unchanged") return { outcome: "unchanged" };
  if (res.status === 409) return { outcome: "conflict", code: codeOf(d) };
  if (res.status === 400) return { outcome: "rejected", code: codeOf(d) };
  return { outcome: "unavailable", code: "bad_payload" };
}
/** Starts one attempt bound to the browser nonce hash. Returns { ok: true, authorization_url } only for the exact fixed WHOOP URL. */
export async function startWhoopOAuth(config, nonceSha256, options = {}) {
  if (!/^[0-9a-f]{64}$/.test(nonceSha256)) return { ok: false, code: "invalid_input" };
  const res = await bridgeRequest(config, "POST", "/v0/fitness/whoop/oauth/start", { ...options, body: { nonce_sha256: nonceSha256 }, acceptStatus: [200, 409] });
  if (!res.ok) return { ok: false, code: res.code };
  if (res.status === 409) return { ok: false, code: codeOf(res.data) };
  const u = isObj(res.data) ? res.data.authorization_url : null;
  return checkAuthorizationUrl(u) ? { ok: true, authorization_url: u } : { ok: false, code: "bad_payload" };
}
const OUTCOMES = new Set(["authorized", "denied", "expired", "superseded", "replayed", "invalid_state", "authorization_failed", "needs_reauthorization", "needs_setup", "provider_error"]);
/** Forwards a validated callback (state + browser nonce + code|error). Returns a fixed outcome code only. */
export async function completeWhoopOAuth(config, cb, options = {}) {
  const body = cb.code !== undefined ? { state: cb.state, nonce: cb.nonce, code: cb.code } : { state: cb.state, nonce: cb.nonce, error: cb.error };
  const res = await bridgeRequest(config, "POST", "/v0/fitness/whoop/oauth/callback", { ...options, body, acceptStatus: [200] });
  if (!res.ok) return "unavailable";
  const o = isObj(res.data) ? res.data.outcome : null;
  return OUTCOMES.has(o) ? o : "unavailable";
}

/** Signed POST of one validated set. Returns { outcome: "saved", deduplicated, set } | { outcome: "rejected"|"conflict"|"unavailable", code }. */
export async function postSet(config, set, key, options = {}) {
  if (validateSetInput(set) !== null || !IDEM_RE.test(key)) return { outcome: "rejected", code: "invalid_input" };
  const res = await bridgeRequest(config, "POST", "/v0/fitness/sets", { ...options, body: set, idempotencyKey: key, acceptStatus: [200, 201, 400, 409, 413, 415, 507] });
  if (!res.ok) return { outcome: "unavailable", code: res.code };
  const d = res.data;
  if ((res.status === 200 || res.status === 201) && isObj(d) && d.outcome === "saved" && ENTRY(d.set) && d.set.key === key) {
    return { outcome: "saved", deduplicated: d.deduplicated === true, set: d.set };
  }
  const code = isObj(d) && typeof d.error === "string" && /^[a-z_]{1,40}$/.test(d.error) ? d.error : "bad_payload";
  if (res.status === 409) return { outcome: "conflict", code };
  if (res.status === 507) return { outcome: "unavailable", code };
  return res.status >= 400 && res.status < 500 ? { outcome: "rejected", code } : { outcome: "unavailable", code: "bad_payload" };
}
