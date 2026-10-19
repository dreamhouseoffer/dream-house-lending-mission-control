import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { readBridgeConfig } from "@/lib/mission-control/bridge-client.mjs";
import { fetchMiloBoard } from "@/lib/mission-control/milo-board-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only supervisor state for the Milo Growth Board (ids, versions, classes, linked native facts). No writes.
export async function GET() {
  noStore();
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const config = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!config.configured) return NextResponse.json({ ok: false, state: "not_configured", code: config.reason ?? "not_configured" }, { status: 503, headers: HEADERS });
  const result = (await fetchMiloBoard(config)) as { ok: true; board: unknown } | { ok: false; state: string; code: string };
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json({ ok: true, board: result.board }, { status: 200, headers: HEADERS });
}
