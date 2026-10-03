import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

const BASE_ID = process.env.AIRTABLE_BASE_ID || "app9j7s9BTPr8UglD";
const TABLE_ID = process.env.MILO_APPROVALS_TABLE_ID || "tblMixrIAukHjqBKl";

function getAirtableKey() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || "";
}

function airtableUrl(recordId?: string) {
  const base = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
  return recordId ? `${base}/${recordId}` : base;
}

function headers() {
  const key = getAirtableKey();
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function stringField(fields: Record<string, unknown>, name: string) {
  const value = fields[name];
  return typeof value === "string" ? value : "";
}

function normalizeRecord(record: AirtableRecord) {
  const fields = record.fields || {};
  return {
    id: record.id,
    createdTime: record.createdTime || "",
    title: stringField(fields, "Title"),
    status: stringField(fields, "Status") || "Drafted by Milo",
    approvalLevel: stringField(fields, "Approval Level") || "YELLOW",
    category: stringField(fields, "Category"),
    businessReason: stringField(fields, "Business Reason"),
    proposedChange: stringField(fields, "Proposed Change"),
    affectedUrl: stringField(fields, "Affected URL"),
    evidence: stringField(fields, "Evidence"),
    riskNote: stringField(fields, "Risk Note"),
    decision: stringField(fields, "Decision") || "Pending",
    fonzNotes: stringField(fields, "Fonz Notes"),
    approvedAt: stringField(fields, "Approved At"),
  };
}

export async function GET() {
  if (!getAirtableKey()) {
    return NextResponse.json({ ok: false, error: "Airtable API key is not configured." }, { status: 500 });
  }

  const url = new URL(airtableUrl());
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("sort[0][field]", "Status");
  url.searchParams.set("sort[0][direction]", "asc");
  url.searchParams.set("sort[1][field]", "Approval Level");
  url.searchParams.set("sort[1][direction]", "desc");

  const response = await fetch(url.toString(), {
    headers: headers(),
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
  const approvals = (data.records || []).map(normalizeRecord);
  return NextResponse.json({ ok: true, approvals });
}

export async function PATCH(request: Request) {
  if (!getAirtableKey()) {
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
    fields.Status = "Approved";
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

  const response = await fetch(airtableUrl(id), {
    method: "PATCH",
    headers: headers(),
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
  return NextResponse.json({ ok: true, approval: normalizeRecord(record) });
}
