import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { readWhoop } from "@/lib/mission-control/fitness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only WHOOP view via the signed bridge: allowlisted fields only; no tokens, no OAuth, no credential intake.
export async function GET() {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const r = await readWhoop();
  if (!r.ok) return NextResponse.json({ ok: false, state: r.state, code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  return NextResponse.json(r, { status: 200, headers: HEADERS });
}
