import { NextResponse, type NextRequest } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { readFitnessLogs, saveFitnessSet } from "@/lib/mission-control/fitness";
import { IDEM_RE, MAX_SET_REQUEST_BYTES, SESSION_RE, isIsoDate, validateSetInput } from "@/lib/mission-control/fitness-model.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const STATUS: Record<string, number> = { saved: 200, rejected: 400, conflict: 409, unavailable: 503 };

// Actual logged sets (GET, optional ?date=YYYY-MM-DD&session=A-D) and one-set append (POST) via the signed bridge.
export async function GET(request: NextRequest) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const sp = request.nextUrl.searchParams;
  const keys = Array.from(sp.keys());
  const date = sp.get("date");
  const session = sp.get("session");
  if (keys.some((k) => k !== "date" && k !== "session") || new Set(keys).size !== keys.length
    || (date !== null && !isIsoDate(date)) || (session !== null && !SESSION_RE.test(session))) {
    return NextResponse.json({ ok: false, state: "rejected", code: "invalid_query" }, { status: 400, headers: HEADERS });
  }
  const r = await readFitnessLogs({ date, session });
  if (!r.ok) return NextResponse.json({ ok: false, state: r.state, code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  return NextResponse.json(r, { status: 200, headers: HEADERS });
}

// Order: same-origin -> signed session -> JSON + size -> strict shape + Idempotency-Key -> signed bridge POST.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers, request.url)) return NextResponse.json({ ok: false, state: "forbidden" }, { status: 403, headers: HEADERS });
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const reject = (code: string, status = 400) => NextResponse.json({ ok: false, outcome: "rejected", code }, { status, headers: HEADERS });
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return reject("json_required", 415);
  const key = request.headers.get("idempotency-key") ?? "";
  if (!IDEM_RE.test(key)) return reject("idempotency_key_required");
  const raw = await request.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_SET_REQUEST_BYTES) return reject("body_too_large", 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return reject("malformed_json");
  }
  const invalid = validateSetInput(input);
  if (invalid) return reject(invalid);
  const r = await saveFitnessSet(input as Record<string, unknown>, key);
  if (r.ok === false) return NextResponse.json({ ok: false, outcome: "unavailable", code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  const outcome = String(r.outcome);
  return NextResponse.json({ ...r, ok: outcome === "saved" }, { status: STATUS[outcome] ?? 502, headers: HEADERS });
}
