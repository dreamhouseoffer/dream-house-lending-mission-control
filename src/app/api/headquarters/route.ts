import { NextResponse } from "next/server";
import { loadHeadquartersSnapshot } from "@/lib/headquarters/loader.mjs";
import { hasHeadquartersAccess } from "@/lib/headquarters/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only: serves the whitelisted private audit snapshot. No writes or actions exist on this route.
export async function GET() {
  if (!(await hasHeadquartersAccess())) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: HEADERS });
  }
  const snapshot = await loadHeadquartersSnapshot();
  return NextResponse.json(snapshot, { status: 200, headers: HEADERS });
}
