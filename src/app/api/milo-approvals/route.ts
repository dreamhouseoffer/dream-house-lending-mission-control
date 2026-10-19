import { NextResponse } from "next/server";
import { notifyApprovalSignal, readBridgeConfig } from "@/lib/mission-control/bridge-client.mjs";
import { MILO_MAX_PAGES, legacyListUrl, miloHeaders, normalizeLegacyRecord } from "@/lib/mission-control/milo-approvals-client.mjs";
import { approvalSignalVersion } from "@/lib/mission-control/approval-signal-version.mjs";
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

  // Every card (bounded pages): a failed page fails the read; a remaining cursor is reported as truncated.
  const records: AirtableRecord[] = [];
  let offset: string | null = null;
  let pages = 0;
  do {
    const url = legacyListUrl(config);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), { headers: miloHeaders(config), cache: "no-store" });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: "Airtable request failed.", detail: text.slice(0, 500) },
        { status: response.status }
      );
    }
    const data = (await response.json()) as { records?: AirtableRecord[]; offset?: unknown };
    records.push(...(data.records || []));
    offset = typeof data.offset === "string" && data.offset ? data.offset : null;
    pages += 1;
  } while (offset && pages < MILO_MAX_PAGES);

  // `version` is the same content version the supervisor snapshot records, so the board can tell whether the supervisor
  // has read this exact card state.
  const approvals = records.map((record) => ({ ...normalizeLegacyRecord(record), version: approvalSignalVersion(record.fields || {}) }));
  return NextResponse.json({ ok: true, approvals, truncated: Boolean(offset), observedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

// Records an owner decision only. Approval is permission, not dispatch or publication: the record is read first and only
// changed fields are written (never "In Progress", never a reset Approved At, never a downgraded completed outcome).
export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request.headers, request.url)) {
    return NextResponse.json({ ok: false, error: "Cross-origin request refused." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const result = await applyLegacyDecision(miloConfigFromEnv(), body);
  // After a SAVED change only: a signed record/version signal to the owned bridge so the supervisor re-reads the source.
  // Its failure is reported, never a rollback of the saved Airtable decision.
  const responseBody = result.signal
    ? { ...result.body, signal: await notifyApprovalSignal(readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET }), result.signal) }
    : result.body;
  return NextResponse.json(responseBody, { status: result.httpStatus, headers: { "Cache-Control": "no-store" } });
}
