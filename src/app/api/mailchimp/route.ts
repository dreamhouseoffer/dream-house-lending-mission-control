import { NextResponse } from "next/server";

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY ?? "";
const MAILCHIMP_SERVER = "us22";

const headers = {
  Authorization: `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString("base64")}`,
  "Content-Type": "application/json",
};

const baseUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0`;

export async function GET() {
  try {
    const res = await fetch(
      `${baseUrl}/campaigns?count=50&sort_field=send_time&sort_dir=DESC`,
      { headers, cache: "no-store" }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();

    const campaigns = data.campaigns.map((c: Record<string, unknown>) => {
      const report = c.report_summary as Record<string, number> | undefined;
      return {
        id: c.id,
        web_id: c.web_id,
        name: (c.settings as Record<string, unknown>)?.title || "",
        subject: (c.settings as Record<string, unknown>)?.subject_line || "",
        status: c.status,
        send_time: c.send_time || null,
        emails_sent: c.emails_sent || 0,
        open_rate: report?.open_rate ?? null,
        click_rate: report?.click_rate ?? null,
        list_id: (c.recipients as Record<string, unknown>)?.list_id || "",
        audience_name: (c.recipients as Record<string, unknown>)?.list_name || "",
      };
    });

    return NextResponse.json({ campaigns });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
