import { NextResponse } from "next/server";
import { legacyListUrl, miloHeaders, miloTableUrl, normalizeLegacyRecord } from "@/lib/mission-control/milo-approvals-client.mjs";
import { miloConfigFromEnv } from "@/lib/mission-control/milo-approvals";

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

export async function PATCH(request: Request) {
  const config = miloConfigFromEnv();
  if (!config.configured) {
    return NextResponse.json({ ok: false, error: "Airtable API key is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const status = typeof body?.status === "string" ? body.status : "";

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing approval id." }, { status: 400 });
  }

  const fields: Record<string, string> = {};

  if (action === "approve") {
    fields.Decision = "Approved";
    fields.Status = "In Progress";
    fields["Approved At"] = new Date().toISOString();
  } else if (action === "reject") {
    fields.Decision = "Rejected";
    fields.Status = "Rejected / Parked";
  } else if (action === "needs_changes") {
    fields.Decision = "Needs Changes";
    fields.Status = "Hermie Reviewed";
  } else if (action === "status") {
    if (!status) {
      return NextResponse.json({ ok: false, error: "Missing status." }, { status: 400 });
    }
    fields.Status = status;
  } else if (action !== "notes") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  if (notes || action === "notes") fields["Fonz Notes"] = notes;

  const response = await fetch(miloTableUrl(config, id), {
    method: "PATCH",
    headers: miloHeaders(config),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { ok: false, error: "Airtable update failed.", detail: text.slice(0, 500) },
      { status: response.status }
    );
  }

  const record = (await response.json()) as AirtableRecord;
  return NextResponse.json({ ok: true, approval: normalizeLegacyRecord(record) });
}
