// Pure owner sign-in decision. The throttle service is injected (`attempt`), so this runs under node --test with
// a synthetic fixture and in the Node route with the signed bridge call. Never logs; responses never echo the
// PIN, the secret, the client address or the hashed key.
import { clientIdentifier, createSessionToken, hashClientKey, pinMatches, readSessionConfig, verifySessionToken } from "./session.mjs";

const MAX_PIN_LENGTH = 64;

export const LOGIN_COPY = {
  not_configured: "Mission Control sign-in is not configured on this deployment.",
  throttle_offline:
    "Sign-in protection is offline because the Mac bridge did not answer, so new sign-ins are paused. Devices that are already signed in still work. Try again once the Mac is awake and the bridge is running.",
  wrong_pin: "Wrong PIN.",
};

// The bridge's longest window is 24h (daily cap), so retry_after is clamped to that before it reaches the user.
export const MAX_RETRY_AFTER_S = 24 * 60 * 60;

function limitedCopy(seconds) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.ceil(minutes / 60);
  const wait = minutes <= 1 ? "about a minute" : minutes < 60 ? `${minutes} minutes` : hours === 1 ? "about an hour" : `about ${hours} hours`;
  return `Too many sign-in attempts. Try again in ${wait}.`;
}

/**
 * @param {{
 *   pinInput: unknown,
 *   env: { MISSION_CONTROL_PIN?: string, MISSION_CONTROL_SESSION_SECRET?: string },
 *   headers?: { get(name: string): string | null },
 *   trustVercel?: boolean,
 *   attempt: (a: { key: string, matched: boolean }) => Promise<{ state: string, retryAfter?: number }>,
 *   now?: () => number,
 * }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown>, token?: string, retryAfter?: number }>}
 */
export async function handleLogin({ pinInput, env, headers, trustVercel = false, attempt, now = Date.now }) {
  const config = readSessionConfig({ pin: env?.MISSION_CONTROL_PIN, secret: env?.MISSION_CONTROL_SESSION_SECRET });
  if (!config.ok) return { status: 503, body: { ok: false, error: LOGIN_COPY.not_configured } };

  const pin = typeof pinInput === "string" ? pinInput.trim().slice(0, MAX_PIN_LENGTH) : "";
  const matched = pin.length > 0 && (await pinMatches(pin, config.pin));
  const key = await hashClientKey(config, clientIdentifier(headers, { trustVercel }));

  let verdict;
  try {
    verdict = await attempt({ key, matched });
  } catch {
    verdict = { state: "unavailable" };
  }
  if (verdict?.state === "limited" && Number.isInteger(verdict.retryAfter) && verdict.retryAfter > 0) {
    const retryAfter = Math.min(verdict.retryAfter, MAX_RETRY_AFTER_S);
    return { status: 429, body: { ok: false, error: limitedCopy(retryAfter), retry_after: retryAfter }, retryAfter };
  }
  if (verdict?.state !== "allowed") return { status: 503, body: { ok: false, error: LOGIN_COPY.throttle_offline } };
  if (!matched) return { status: 401, body: { ok: false, error: LOGIN_COPY.wrong_pin } };

  return { status: 200, body: { ok: true }, token: await createSessionToken(config, { now: now() }) };
}

/**
 * Explicit same-origin check for state-changing auth POSTs (logout). A present Origin must equal the request's
 * own origin; without Origin, a Sec-Fetch-Site other than same-origin/none is rejected. Pure; never logs.
 * @param {{ get(name: string): string | null } | undefined} headers
 * @param {string} requestUrl
 * @returns {boolean}
 */
export function isSameOriginRequest(headers, requestUrl) {
  let self;
  try {
    self = new URL(requestUrl).origin;
  } catch {
    return false;
  }
  const origin = headers?.get("origin");
  if (origin != null) return origin === self;
  const site = headers?.get("sec-fetch-site");
  return site == null || site === "same-origin" || site === "none";
}

/**
 * Boolean session probe for the login page. Read-only: verifies the existing signed cookie and never issues,
 * refreshes or extends a session, never contacts the bridge, and returns no claims, reason or user metadata.
 * Misconfiguration fails closed (authenticated: false).
 * @param {{ env: { MISSION_CONTROL_PIN?: string, MISSION_CONTROL_SESSION_SECRET?: string }, token: unknown, now?: () => number }} input
 * @returns {Promise<{ status: 200, body: { authenticated: boolean } }>}
 */
export async function handleSessionProbe({ env, token, now = Date.now }) {
  const config = readSessionConfig({ pin: env?.MISSION_CONTROL_PIN, secret: env?.MISSION_CONTROL_SESSION_SECRET });
  const session = config.ok ? await verifySessionToken(config, token, { now: now() }) : null;
  return { status: 200, body: { authenticated: session?.ok === true } };
}
