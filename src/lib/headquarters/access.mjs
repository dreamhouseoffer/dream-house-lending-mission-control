// Pure access decision for Headquarters. Fails closed: no configured PIN or signing secret means no access, even
// in local development. Accepts only a valid, unexpired signed owner session (legacy raw-PIN cookies are rejected).
// Always async: callers must `await` it; never sets cookies.
import { readSessionConfig, verifySessionToken } from "../auth/session.mjs";

/** @returns {Promise<boolean>} */
export async function isHeadquartersAuthorized({ pin, secret, cookie, now } = {}) {
  const config = readSessionConfig({ pin, secret });
  if (!config.ok) return false;
  const session = await verifySessionToken(config, cookie, now === undefined ? {} : { now });
  return session.ok === true;
}
