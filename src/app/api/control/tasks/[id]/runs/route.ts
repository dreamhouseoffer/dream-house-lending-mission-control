import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess, isTaskId, readTaskRuns } from "@/lib/mission-control/bridge";
import { observationState } from "@/lib/mission-control/bridge-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only native run receipts for one task. Retry/restart are not exposed.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (!isTaskId(params.id)) return NextResponse.json({ ok: false, state: "invalid_task_id" }, { status: 400, headers: HEADERS });
  const result = await readTaskRuns(params.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json(
    { ok: true, observed_at: result.observedAt, observation: observationState(result.observedAt), task_id: result.taskId, runs: result.runs },
    { status: 200, headers: HEADERS }
  );
}
