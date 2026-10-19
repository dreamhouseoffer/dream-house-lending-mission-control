import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { readRecordLinks } from "@/lib/mission-control/artifacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only structured source-card -> native task links (workspace segment only; titles are never matched).
export async function GET() {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const result = await readRecordLinks();
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json({ ...result, ok: true }, { status: 200, headers: HEADERS });
}
