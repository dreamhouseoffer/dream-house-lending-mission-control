import { NextResponse, type NextRequest } from "next/server";
import { failureHttpStatus, hasControlAccess } from "@/lib/mission-control/bridge";
import { saveWhoopClient } from "@/lib/mission-control/fitness";
import { MAX_CLIENT_REQUEST_BYTES, validateClientInput } from "@/lib/mission-control/whoop-oauth-model.mjs";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const STATUS: Record<string, number> = { configured: 201, unchanged: 200, conflict: 409, rejected: 400 };

// First-time WHOOP app config: exactly { client_id, client_secret }, relayed to the private bridge (owner-only file on the
// Mac). Order: same-origin -> signed session -> JSON + size -> exact shape -> signed bridge POST. Values are never echoed or logged.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers, request.url)) return NextResponse.json({ ok: false, state: "forbidden" }, { status: 403, headers: HEADERS });
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const reject = (code: string, status = 400) => NextResponse.json({ ok: false, outcome: "rejected", code }, { status, headers: HEADERS });
  if (request.nextUrl.search) return reject("invalid_query");
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return reject("json_required", 415);
  const raw = await request.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_CLIENT_REQUEST_BYTES) return reject("body_too_large", 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return reject("malformed_json");
  }
  const invalid = validateClientInput(input);
  if (invalid) return reject(invalid);
  const r = await saveWhoopClient(input as { client_id: string; client_secret: string });
  if (r.ok === false) return NextResponse.json({ ok: false, outcome: "unavailable", code: r.code }, { status: failureHttpStatus(String(r.state)), headers: HEADERS });
  const outcome = String(r.outcome);
  const body = { ok: outcome === "configured" || outcome === "unchanged", outcome, ...(typeof r.code === "string" ? { code: r.code } : {}) };
  return NextResponse.json(body, { status: STATUS[outcome] ?? 502, headers: HEADERS });
}
