import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/login.mjs";
import { SESSION_COOKIE, cookieOptions, isProductionEnv } from "@/lib/auth/session.mjs";
import { revokeOnLogout } from "@/lib/mission-control/approval-ceremony-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers, request.url)) {
    return NextResponse.json({ ok: false }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // Durable bridge-side revocation of this session's approval binding, only when the challenge-only ceremony is
  // available; otherwise "unsupported". The cookie is cleared regardless of the outcome.
  const revocation = await revokeOnLogout(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true, revocation }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions({ production: isProductionEnv({ NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }), maxAge: 0 }));
  return response;
}
