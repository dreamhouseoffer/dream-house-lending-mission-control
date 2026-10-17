import { NextResponse, type NextRequest } from "next/server";
import { type CreatePayload, createTask, failureHttpStatus, hasControlAccess, readCapabilities, readTasks } from "@/lib/mission-control/bridge";
import { countByBucket, filterTasks, observationState } from "@/lib/mission-control/bridge-client.mjs";
import { parseTaskStatus } from "@/lib/mission-control/capabilities.mjs";
import { MAX_CREATE_REQUEST_BYTES, createCapability, isSameOriginMutation, outcomeCopy, validateCreateRequest } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Task list from the Hermes board via the signed bridge (GET), and capability-gated template submission (POST).
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

function outcome(name: string, extra: Record<string, unknown> = {}, status?: number) {
  const copy = outcomeCopy(name);
  return NextResponse.json(
    { ok: name === "accepted", outcome: name, retry: copy.retry, message: copy.title, next_step: copy.next, ...extra },
    { status: status ?? copy.http, headers: HEADERS }
  );
}

// Create one task from a server-advertised template. Order: same-origin -> signed session -> strict JSON ->
// fresh capabilities -> template membership -> signed bridge POST. Body and assignee always come from the server's
// current capabilities; the browser sends only {template_id, title} plus an Idempotency-Key header.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request.headers, request.url)) return NextResponse.json({ ok: false, state: "forbidden" }, { status: 403, headers: HEADERS });
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return outcome("rejected", { code: "json_required" }, 415);
  const raw = await request.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_CREATE_REQUEST_BYTES) return outcome("rejected", { code: "body_too_large" }, 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return outcome("rejected", { code: "malformed_json" });
  }
  const caps = await readCapabilities();
  const create = createCapability(caps.ok ? caps : null);
  if (!create.enabled) return outcome("unavailable", { code: caps.ok ? "create_disabled" : caps.state, reason: create.reason });
  const checked = validateCreateRequest(input, request.headers.get("idempotency-key"), create.templates);
  if (!checked.ok) return outcome("rejected", { code: checked.code, field: checked.field ?? null });
  const result = await createTask(checked.payload as CreatePayload, checked.key as string);
  if (result.outcome === "accepted") {
    return outcome("accepted", {
      task_id: result.task.id,
      task: { id: result.task.id, title: result.task.title ?? null, assignee: result.task.assignee ?? null, ui: result.task.ui, bucket: result.task.bucket },
      deduplicated: result.deduplicated,
      observed_at: result.observedAt,
    });
  }
  return outcome(result.outcome, { code: result.code });
}
