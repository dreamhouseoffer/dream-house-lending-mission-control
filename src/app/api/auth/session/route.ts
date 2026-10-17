import { NextResponse, type NextRequest } from "next/server";
import { handleSessionProbe } from "@/lib/auth/login.mjs";
import { SESSION_COOKIE } from "@/lib/auth/session.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Boolean-only probe used by the login page to skip the PIN when a valid signed session already exists.
// Never issues or refreshes a cookie, never contacts the bridge, and returns no claims or metadata.
export async function GET(request: NextRequest) {
  const result = await handleSessionProbe({
    env: {
      MISSION_CONTROL_PIN: process.env.MISSION_CONTROL_PIN,
      MISSION_CONTROL_SESSION_SECRET: process.env.MISSION_CONTROL_SESSION_SECRET,
    },
    token: request.cookies.get(SESSION_COOKIE)?.value,
  });
  return NextResponse.json(result.body, { status: result.status, headers: HEADERS });
}
