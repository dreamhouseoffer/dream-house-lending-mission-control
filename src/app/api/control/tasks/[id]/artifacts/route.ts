import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess, isTaskId } from "@/lib/mission-control/bridge";
import { readArtifactList } from "@/lib/mission-control/artifacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Read-only list of a task's registered native attachments (opaque ids, names, sizes, digests, review flags).
// No paths are ever returned; nothing is attached, edited or published here.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (!isTaskId(params.id)) return NextResponse.json({ ok: false, state: "invalid_task_id" }, { status: 400, headers: HEADERS });
  const result = await readArtifactList(params.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status: failureHttpStatus(result.state), headers: HEADERS });
  }
  return NextResponse.json({ ...result, ok: true }, { status: 200, headers: HEADERS });
}
