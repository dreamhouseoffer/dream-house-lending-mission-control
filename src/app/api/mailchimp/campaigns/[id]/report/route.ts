import { NextRequest, NextResponse } from "next/server";

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY ?? "";
const MAILCHIMP_SERVER = "us22";

const headers = {
  Authorization: `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString("base64")}`,
  "Content-Type": "application/json",
};

const baseUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0`;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await fetch(`${baseUrl}/reports/${id}`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();

    return NextResponse.json({
      campaign_id: data.id,
      campaign_title: data.campaign_title,
      emails_sent: data.emails_sent,
      opens: {
        total: data.opens?.opens_total ?? 0,
        unique: data.opens?.unique_opens ?? 0,
        rate: data.opens?.open_rate ?? 0,
      },
      clicks: {
        total: data.clicks?.clicks_total ?? 0,
        unique: data.clicks?.unique_clicks ?? 0,
        rate: data.clicks?.click_rate ?? 0,
      },
      bounces: {
        hard: data.bounces?.hard_bounces ?? 0,
        soft: data.bounces?.soft_bounces ?? 0,
      },
      unsubscribes: data.unsubscribed ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
