import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/login.mjs";
import { SESSION_COOKIE, cookieOptions, isProductionEnv } from "@/lib/auth/session.mjs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers, request.url)) {
    return NextResponse.json({ ok: false }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions({ production: isProductionEnv({ NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }), maxAge: 0 }));
  return response;
}
