import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { observationState } from "@/lib/mission-control/bridge-client.mjs";
import { readOperations } from "@/lib/mission-control/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Configured profiles and cron schedules read via the signed bridge. Read-only; an unavailable source is null, not [].
export async function GET() {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const result = await readOperations();
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json(
    {
      ok: true,
      observed_at: result.observedAt,
      observation: observationState(result.observedAt),
      heartbeat: "unavailable",
      sources: {
        profiles: { available: result.sources.profiles.available, updated_at: result.sources.profiles.updatedAt },
        schedules: { available: result.sources.schedules.available, updated_at: result.sources.schedules.updatedAt },
      },
      profiles: result.profiles,
      schedules: result.schedules,
    },
    { status: 200, headers: HEADERS }
  );
}
