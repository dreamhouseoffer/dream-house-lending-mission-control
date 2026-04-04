import { NextRequest, NextResponse } from "next/server";

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY ?? "";
const MAILCHIMP_SERVER = "us22";

const headers = {
  Authorization: `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString("base64")}`,
  "Content-Type": "application/json",
};

const baseUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { schedule_time } = body;

    if (!schedule_time) {
      return NextResponse.json(
        { error: "schedule_time is required (ISO 8601 format)" },
        { status: 400 }
      );
    }

    const res = await fetch(`${baseUrl}/campaigns/${id}/actions/schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ schedule_time }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    return NextResponse.json({ success: true, scheduled_for: schedule_time });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
