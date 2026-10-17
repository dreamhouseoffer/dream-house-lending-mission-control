// Pure post-login redirect sanitiser, shared by the login page (client) and tests. No crypto, no env, no logging.
// Only same-origin absolute paths survive; anything that could leave the origin or loop back to /login falls back.

export const DEFAULT_NEXT_PATH = "/projects";
const MAX_NEXT_LENGTH = 512;
const BASE = "https://mission-control.invalid";

/**
 * @param {unknown} raw  untrusted `next` query value
 * @param {string} [fallback]
 * @returns {string} a path beginning with a single "/" on this origin
 */
export function safeNextPath(raw, fallback = DEFAULT_NEXT_PATH) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_NEXT_LENGTH) return fallback;
  // Must be a rooted path, never protocol-relative ("//host") or a backslash variant browsers treat as one.
  if (raw[0] !== "/" || raw[1] === "/" || raw.includes("\\")) return fallback;
  // Control characters and whitespace (tab/newline stripping is how "/\t/evil.com" becomes "//evil.com").
  if (/[\u0000-\u0020\u007f-\u009f\u2028\u2029]/.test(raw)) return fallback;
  // Encoded slashes/backslashes in the leading segment, or a decoded form that would be protocol-relative.
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded[1] === "/" || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return fallback;
  let url;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  // Never resume into /login itself or any child of it (a valid session would bounce straight back: a loop),
  // nor into an API route. Compared on the decoded, case-folded path so "/LOGIN/", "/%6Cogin" and "/login/x" all match.
  let path;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return fallback;
  }
  if (path === "/login" || path.startsWith("/login/") || path === "/api" || path.startsWith("/api/")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
