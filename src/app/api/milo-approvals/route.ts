import { NextResponse } from "next/server";
import { legacyListUrl, miloHeaders, normalizeLegacyRecord } from "@/lib/mission-control/milo-approvals-client.mjs";
import { applyLegacyDecision } from "@/lib/mission-control/milo-legacy-decision.mjs";
import { miloConfigFromEnv } from "@/lib/mission-control/milo-approvals";
import { isSameOriginMutation } from "@/lib/mission-control/task-submit.mjs";

export const dynamic = "force-dynamic";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export async function GET() {
  const config = miloConfigFromEnv();
  if (!config.configured) {
    return NextResponse.json({ ok: false, error: "Airtable API key is not configured." }, { status: 500 });
  }

  const response = await fetch(legacyListUrl(config).toString(), {
    headers: miloHeaders(config),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { ok: false, error: "Airtable request failed.", detail: text.slice(0, 500) },
      { status: response.status }
    );
  }

  const data = (await response.json()) as { records?: AirtableRecord[] };
  const approvals = (data.records || []).map(normalizeLegacyRecord);
  return NextResponse.json({ ok: true, approvals });
}

// Records an owner decision only. Approval is permission, not dispatch or publication: the record is read first and only
// changed fields are written (never "In Progress", never a reset Approved At, never a downgraded completed outcome).
export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request.headers, request.url)) {
    return NextResponse.json({ ok: false, error: "Cross-origin request refused." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const result = await applyLegacyDecision(miloConfigFromEnv(), body);
  return NextResponse.json(result.body, { status: result.httpStatus, headers: { "Cache-Control": "no-store" } });
}
