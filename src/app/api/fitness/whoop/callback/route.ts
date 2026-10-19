import { NextResponse, type NextRequest } from "next/server";
import { finishWhoopOAuth } from "@/lib/mission-control/fitness";
import { NONCE_RE, OAUTH_COOKIE, callbackResult, oauthCookieOptions, parseCallbackQuery } from "@/lib/mission-control/whoop-oauth-model.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The ONE public route for WHOOP's cross-site redirect (exact path, GET only, exempted in middleware). The owner session
// cookie (SameSite=Strict) may be absent here, so nothing is read or written without BOTH the unexpired pending state on
// the bridge AND this browser's companion nonce cookie. No session is minted; no token or health data is returned; the
// code, state and provider error text are never logged or reflected. Always: clear the companion cookie, 303 to /body-os
// with one allowlisted result code.
export async function GET(request: NextRequest) {
  const cb = parseCallbackQuery(request.nextUrl.searchParams);
  const nonce = request.cookies.get(OAUTH_COOKIE)?.value ?? "";
  let result = "invalid";
  if (cb && cb.state !== null && NONCE_RE.test(nonce)) {
    const outcome = await finishWhoopOAuth(cb.kind === "code" ? { state: cb.state, nonce, code: cb.code } : { state: cb.state, nonce, error: cb.error });
    result = callbackResult(outcome);
  }
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: `/body-os?whoop=${result}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
  res.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0));
  return res;
}
