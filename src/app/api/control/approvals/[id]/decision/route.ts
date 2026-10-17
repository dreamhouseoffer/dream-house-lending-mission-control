import { NextResponse } from "next/server";
import { ceremonyRoute } from "@/lib/mission-control/approval-ceremony-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Challenge-only owner decision. Fail closed (503 ceremony_unavailable) unless the reviewed challenge-only bridge
// capability and the owner opt-in are both present. Never reaches the legacy bridge decision path.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { status, body } = await ceremonyRoute("decide", params.id, await request.text());
  return NextResponse.json(body, { status, headers: HEADERS });
}
