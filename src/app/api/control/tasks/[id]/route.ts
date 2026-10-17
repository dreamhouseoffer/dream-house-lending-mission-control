import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess, isTaskId, readTask } from "@/lib/mission-control/bridge";
import { observationState } from "@/lib/mission-control/bridge-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only task detail (task, runs, events, latest summary). No mutation exists on this route.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (!isTaskId(params.id)) return NextResponse.json({ ok: false, state: "invalid_task_id" }, { status: 400, headers: HEADERS });
  const result = await readTask(params.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json(
    {
      ok: true,
      observed_at: result.observedAt,
      observation: observationState(result.observedAt),
      heartbeat: "unavailable",
      task: result.task,
      runs: result.runs,
      events: result.events,
      latest_summary: result.latestSummary,
    },
    { status: 200, headers: HEADERS }
  );
}
