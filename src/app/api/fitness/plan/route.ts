import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { readFitnessPlan } from "@/lib/mission-control/fitness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Private reviewed training program via the signed bridge (read-only). `missing` is reported, never filled in.
export async function GET() {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const r = await readFitnessPlan();
  if (!r.ok) return NextResponse.json({ ok: false, state: r.state, code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  return NextResponse.json(r, { status: 200, headers: HEADERS });
}
