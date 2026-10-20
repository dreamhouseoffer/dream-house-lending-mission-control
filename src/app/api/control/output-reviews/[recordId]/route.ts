import { NextResponse } from "next/server";
import { failureHttpStatus } from "@/lib/mission-control/bridge";
import { readOutputReview } from "@/lib/mission-control/output-review";
import { isRecordId } from "@/lib/mission-control/output-review-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Read-only: the exact registered output version for one source card and any decision on it.
export async function GET(_request: Request, { params }: { params: { recordId: string } }) {
  if (!isRecordId(params.recordId)) return NextResponse.json({ ok: false, state: "error", code: "invalid_record_id" }, { status: 400, headers: HEADERS });
  const r = (await readOutputReview(params.recordId)) as { ok: boolean; state?: string; code?: string; review?: unknown };
  if (!r.ok) return NextResponse.json({ ok: false, state: r.state, code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  return NextResponse.json({ ok: true, review: r.review }, { status: 200, headers: HEADERS });
}
