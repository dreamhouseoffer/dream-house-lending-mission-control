import { NextResponse } from "next/server";
import { retryOutputHandoff } from "@/lib/mission-control/output-review";
import { isRecordId } from "@/lib/mission-control/output-review-client.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: HEADERS });

// Re-attempts an unconfirmed revision handoff for an existing revise decision. Same native idempotency key on the
// bridge, so at most one native revision task ever exists for that decision.
export async function POST(request: Request, { params }: { params: { recordId: string } }) {
  if (!isSameOriginMutation(request.headers, request.url)) return json({ outcome: "refused", code: "forbidden" }, 403);
  if (!isRecordId(params.recordId)) return json({ outcome: "refused", code: "invalid_record_id" }, 400);
  const raw = await request.text();
  if (raw.length > 256) return json({ outcome: "refused", code: "body_too_large" }, 413);
  let parsed: { decision_id?: unknown } | null = null;
  try { parsed = JSON.parse(raw); } catch { return json({ outcome: "refused", code: "malformed_json" }, 400); }
  const id = parsed && typeof parsed === "object" && Object.keys(parsed).length === 1 ? parsed.decision_id : null;
  if (typeof id !== "string") return json({ outcome: "refused", code: "invalid_input" }, 400);
  const r = (await retryOutputHandoff(params.recordId, id)) as { ok?: false; state?: string; outcome?: string; code?: string };
  if (r.ok === false) return json({ outcome: "refused", code: r.code ?? r.state }, r.state === "unauthenticated" ? 401 : 503);
  return json(r, r.outcome === "saved" ? 200 : r.outcome === "refused" ? 409 : 502);
}
