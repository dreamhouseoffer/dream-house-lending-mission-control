import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess, readCapabilities } from "@/lib/mission-control/bridge";
import { SAFE_CAPABILITY_COPY, createCapability, publicTemplates } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// What the dashboard may submit right now. Template bodies stay server-side; only id/label/description/assignee leave.
export async function GET() {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  const caps = await readCapabilities();
  if (!caps.ok) {
    const create = createCapability(null);
    return NextResponse.json(
      { ok: false, state: caps.state, code: caps.code, create: { enabled: false, reason: create.reason }, templates: [] },
      { status: failureHttpStatus(caps.state), headers: HEADERS }
    );
  }
  const create = createCapability(caps);
  return NextResponse.json(
    {
      ok: true,
      read_only: caps.readOnly,
      create: { enabled: create.enabled, reason: create.reason },
      templates: publicTemplates(create.templates),
      scope: SAFE_CAPABILITY_COPY,
      unsupported: caps.unsupported,
    },
    { status: 200, headers: HEADERS }
  );
}
