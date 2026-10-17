import { NextResponse, type NextRequest } from "next/server";
import { failureHttpStatus, hasControlAccess, readTasks } from "@/lib/mission-control/bridge";
import { countByBucket, filterTasks, observationState } from "@/lib/mission-control/bridge-client.mjs";
import { parseTaskStatus } from "@/lib/mission-control/capabilities.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only task list from the Hermes board via the signed bridge. No create/execute exists on this route.
export async function GET(request: NextRequest) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const status = parseTaskStatus(request.nextUrl.searchParams.get("status"));
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const result = await readTasks();
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  const tasks = filterTasks(result.tasks, { status, q });
  return NextResponse.json(
    {
      ok: true,
      observed_at: result.observedAt,
      observation: observationState(result.observedAt),
      heartbeat: "unavailable",
      counts: countByBucket(result.tasks),
      filter: { status, q },
      tasks,
    },
    { status: 200, headers: HEADERS }
  );
}
