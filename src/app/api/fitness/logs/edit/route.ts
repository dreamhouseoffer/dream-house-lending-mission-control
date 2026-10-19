import { NextResponse, type NextRequest } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { editFitnessSet } from "@/lib/mission-control/fitness";
import { IDEM_RE, MAX_EDIT_REQUEST_BYTES, validateEditInput } from "@/lib/mission-control/fitness-model.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const STATUS: Record<string, number> = { updated: 200, unchanged: 200, rejected: 400, conflict: 409, unavailable: 503 };

// In-place correction of ONE saved set (weight/unit/reps/RIR/notes) via the signed bridge. No create, no delete.
// Order: same-origin -> signed session -> JSON + size -> strict shape + Idempotency-Key (op key) -> signed bridge POST.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers, request.url)) return NextResponse.json({ ok: false, state: "forbidden" }, { status: 403, headers: HEADERS });
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const reject = (code: string, status = 400) => NextResponse.json({ ok: false, outcome: "rejected", code }, { status, headers: HEADERS });
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return reject("json_required", 415);
  const key = request.headers.get("idempotency-key") ?? "";
  if (!IDEM_RE.test(key)) return reject("idempotency_key_required");
  const raw = await request.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_EDIT_REQUEST_BYTES) return reject("body_too_large", 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return reject("malformed_json");
  }
  const invalid = validateEditInput(input);
  if (invalid) return reject(invalid);
  const r = await editFitnessSet(input as Record<string, unknown>, key);
  if (r.ok === false) return NextResponse.json({ ok: false, outcome: "unavailable", code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  const outcome = String(r.outcome);
  const status = outcome === "rejected" && r.code === "set_not_found" ? 404 : STATUS[outcome] ?? 502;
  return NextResponse.json({ ...r, ok: outcome === "updated" || outcome === "unchanged" }, { status, headers: HEADERS });
}
