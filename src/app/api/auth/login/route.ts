import { NextResponse } from "next/server";
import { handleLogin } from "@/lib/auth/login.mjs";
import { SESSION_COOKIE, cookieOptions, isProductionEnv } from "@/lib/auth/session.mjs";
import { readBridgeConfig, reportLoginAttempt } from "@/lib/mission-control/bridge-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Owner sign-in: constant-time PIN check, persistent throttle on the Mac bridge (fails closed when it is
// unreachable), then a signed expiring session cookie. Nothing here logs the PIN, address, key or secret.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const bridge = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });

  const result = await handleLogin({
    pinInput: body?.pin,
    env: {
      MISSION_CONTROL_PIN: process.env.MISSION_CONTROL_PIN,
      MISSION_CONTROL_SESSION_SECRET: process.env.MISSION_CONTROL_SESSION_SECRET,
    },
    headers: request.headers,
    trustVercel: process.env.VERCEL === "1",
    attempt: (a) => reportLoginAttempt(bridge, a),
  });

  const headers: Record<string, string> = { ...HEADERS };
  if (result.retryAfter) headers["Retry-After"] = String(result.retryAfter);
  const response = NextResponse.json(result.body, { status: result.status, headers });
  if (result.token) {
    response.cookies.set(SESSION_COOKIE, result.token, cookieOptions({ production: isProductionEnv({ NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }) }));
  }
  return response;
}
