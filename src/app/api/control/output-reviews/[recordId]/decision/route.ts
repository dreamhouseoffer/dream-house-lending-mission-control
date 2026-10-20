import { NextResponse } from "next/server";
import { decideOutput } from "@/lib/mission-control/output-review";
import { OUTPUT_IDEM_RE, OUTPUT_MAX_BODY, isRecordId, validateDecisionBody } from "@/lib/mission-control/output-review-client.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: HEADERS });

// One owner decision on one exact registered output version. Approve/reject record a private decision only; revise
// also hands off one supervised native revision task. Nothing here publishes or writes a source card.
export async function POST(request: Request, { params }: { params: { recordId: string } }) {
  if (!isSameOriginMutation(request.headers, request.url)) return json({ outcome: "refused", code: "forbidden" }, 403);
  if (!isRecordId(params.recordId)) return json({ outcome: "refused", code: "invalid_record_id" }, 400);
  const key = request.headers.get("idempotency-key") ?? "";
  if (!OUTPUT_IDEM_RE.test(key)) return json({ outcome: "refused", code: "idempotency_key_required" }, 400);
  if (!String(request.headers.get("content-type") ?? "").startsWith("application/json")) return json({ outcome: "refused", code: "json_required" }, 415);
  const raw = await request.text();
  if (raw.length > OUTPUT_MAX_BODY) return json({ outcome: "refused", code: "body_too_large" }, 413);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return json({ outcome: "refused", code: "malformed_json" }, 400); }
  const body = validateDecisionBody(parsed);
  if (!body) return json({ outcome: "refused", code: "invalid_input" }, 400);
  const r = (await decideOutput(params.recordId, body, key)) as { ok?: false; state?: string; outcome?: string; code?: string };
  if (r.ok === false) return json({ outcome: "refused", code: r.code ?? r.state }, r.state === "unauthenticated" ? 401 : 503);
  if (r.outcome === "saved" || r.outcome === "replayed") return json(r, 200);
  if (r.outcome === "refused") return json(r, 409);
  return json(r, 502); // unknown: the browser retries with the same key and body
}
