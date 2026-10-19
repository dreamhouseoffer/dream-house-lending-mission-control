import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { beginWhoopOAuth } from "@/lib/mission-control/fitness";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/mission-control/whoop-oauth-model.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

// Starts one WHOOP authorization attempt for the signed-in owner. A fresh random nonce goes ONLY into the companion
// HttpOnly cookie; the bridge stores its hash next to a random state. The browser then navigates to the fixed WHOOP URL.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers, request.url)) return NextResponse.json({ ok: false, state: "forbidden" }, { status: 403, headers: HEADERS });
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (request.nextUrl.search) return NextResponse.json({ ok: false, code: "invalid_query" }, { status: 400, headers: HEADERS });
  const raw = await request.text().catch(() => null);
  if (raw === null || (raw !== "" && raw !== "{}")) return NextResponse.json({ ok: false, code: "unexpected_body" }, { status: 400, headers: HEADERS });
  const nonce = randomBytes(32).toString("base64url");
  const r = await beginWhoopOAuth(createHash("sha256").update(nonce).digest("hex"));
  if (r.ok !== true) {
    const code = String(r.code ?? "unavailable");
    const status = "state" in r ? failureHttpStatus(String(r.state)) : code === "needs_setup" ? 409 : 502;
    return NextResponse.json({ ok: false, code }, { status, headers: HEADERS });
  }
  const res = NextResponse.json({ ok: true, authorization_url: r.authorization_url }, { status: 200, headers: HEADERS });
  res.cookies.set(OAUTH_COOKIE, nonce, oauthCookieOptions());
  return res;
}
