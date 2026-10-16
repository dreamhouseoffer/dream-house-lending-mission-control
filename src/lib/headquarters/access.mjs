// Pure access decision for Headquarters. Fails closed: no configured PIN means no access,
// even in local development. Reuses the existing PIN/cookie contract; never sets cookies.
import { timingSafeEqual } from "node:crypto";

export function isHeadquartersAuthorized({ pin, cookie } = {}) {
  if (typeof pin !== "string" || !pin.trim()) return false;
  if (typeof cookie !== "string" || !cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(pin);
  return a.length === b.length && timingSafeEqual(a, b);
}
